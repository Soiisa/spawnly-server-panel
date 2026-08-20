// pages/api/stripe/webhook.js
import { stripe } from '../../../lib/stripe';
import { createClient } from '@supabase/supabase-js';
import { buffer } from 'micro';
import bonusesConfig from '../../../lib/stripeBonuses.json';
import nodemailer from 'nodemailer';
import fs from 'fs';
import path from 'path';
import {
  lookupPartnerCode,
  partnerBonusCredits,
  countCommissionedPayments,
  recordRedemption,
} from '../../../lib/partnerCodes';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;

export const config = {
  api: { bodyParser: false },
};

// --- CORE HELPER: Adds credits exactly once per Stripe event ---
//
// The ledger row is written FIRST and doubles as the idempotency key: a unique
// index on credit_transactions.stripe_event_id (see
// sql/credit_deposit_idempotency.sql) means a retried delivery collides here
// and we skip the deposit instead of crediting twice. Stripe retries anything
// that isn't a 2xx, and this handler 500s whenever it throws, so retries are
// routine rather than exceptional.
async function depositCredits(supabaseAdmin, userId, amountToAdd, transactionDesc, stripeEventId = null) {
    console.log(`[Deposit] Starting deposit of ${amountToAdd} for user ${userId}...`);

    // Stake the claim on this event before touching the balance.
    const { data: claim, error: claimErr } = await supabaseAdmin
        .from('credit_transactions')
        .insert({
            user_id: userId,
            amount: amountToAdd,
            type: 'deposit',
            description: transactionDesc,
            created_at: new Date().toISOString(),
            stripe_event_id: stripeEventId,
        })
        .select('id')
        .single();

    if (claimErr) {
        // 23505 = unique_violation: this Stripe event was already credited.
        if (claimErr.code === '23505') {
            console.log(`[Deposit] Event ${stripeEventId} already credited — skipping.`);
            return null;
        }
        throw new Error(`Ledger insert failed: ${claimErr.message}`);
    }

    try {
        const { data: profile, error: profileErr } = await supabaseAdmin
            .from('profiles')
            .select('credits')
            .eq('id', userId)
            .single();

        if (profileErr) throw new Error(`Profile fetch failed: ${profileErr.message}`);

        const currentBalance = profile?.credits || 0;
        const newBalance = currentBalance + amountToAdd;

        const { error: updateErr } = await supabaseAdmin
            .from('profiles')
            .update({ credits: newBalance })
            .eq('id', userId);

        if (updateErr) throw new Error(`Credit update failed: ${updateErr.message}`);

        try {
            const { data: authData } = await supabaseAdmin.auth.admin.getUserById(userId);
            const email = authData?.user?.email;
            if (email) await sendConfirmationEmail(email, amountToAdd);
        } catch (e) {
            console.warn('[Deposit] Email notification failed (non-fatal):', e.message);
        }

        console.log(`✅ [Deposit] Success: Added ${amountToAdd} credits to user ${userId}. New Balance: ${newBalance}`);
        return newBalance;
    } catch (err) {
        // Balance never moved, so release the claim -- otherwise the retry would
        // hit the unique index and skip a deposit that never actually landed.
        await supabaseAdmin.from('credit_transactions').delete().eq('id', claim.id);
        throw err;
    }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;
  try {
    const buf = await buffer(req);
    event = stripe.webhooks.constructEvent(buf, sig, webhookSecret);
  } catch (err) {
    console.error(`❌ [Webhook] Signature Error: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    // ----------------------------------------------------------------------
    // 1. HANDLE CHECKOUT SESSIONS (Subscriptions & Hosted One-Time)
    // ----------------------------------------------------------------------
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      console.log(`[Webhook] Processing checkout.session.completed [${session.id}]`);

      const userId = session.metadata?.user_id;
      if (!userId) {
          console.log(`[Webhook] Missing user_id in session metadata. Skipping.`);
          return res.status(200).json({ received: true });
      }

      // session.amount_total is in cents, this gives us the EXACT amount paid after coupons!
      const actualPaidEuro = session.amount_total / 100;

      // We still give them the FULL credits stored in the metadata from before the discount
      const totalCreditsToAdd = parseInt(session.metadata.credit_amount, 10);

      // Partner attribution was stamped on at checkout-session creation.
      const partner = await lookupPartnerCode(supabaseAdmin, session.metadata?.partner_code);

      // Support 'no_payment_required' in case they use a 100% off coupon!
      const isPaid = session.payment_status === 'paid' || session.payment_status === 'no_payment_required';

      // A. Handle Subscriptions
      if (session.mode === 'subscription' && isPaid) {
         await supabaseAdmin.from('profiles').update({
             recurring_stripe_subscription_id: session.subscription,
             recurring_purchase_amount: actualPaidEuro // Save the discounted recurring price
         }).eq('id', userId);
         console.log(`🔗 Linked Subscription ${session.subscription} to User ${userId}`);

         await depositCredits(
            supabaseAdmin,
            userId,
            totalCreditsToAdd,
            `Auto-Refill Subscription: €${actualPaidEuro.toFixed(2)}${partner ? ` | Code ${partner.code}` : ''}`,
            event.id
         );

         await recordRedemption(supabaseAdmin, {
            partner,
            userId,
            stripeEventId: event.id,
            stripeObjectId: session.id,
            subscriptionId: session.subscription,
            kind: 'subscription_initial',
            paymentIndex: 0,
            grossCents: session.amount_subtotal ?? session.amount_total,
            netPaidCents: session.amount_total,
            bonusCredits: partnerBonusCredits(Math.round(actualPaidEuro * 100), partner),
         });
      }
      // B. Handle One-Time Normal Credit Purchases (With Coupons)
      else if (session.mode === 'payment' && isPaid) {
         console.log(`💳 One-Time Checkout Payment successful for User ${userId}`);

         await depositCredits(
            supabaseAdmin,
            userId,
            totalCreditsToAdd,
            `Stripe Deposit (One-Time Checkout): €${actualPaidEuro.toFixed(2)}${partner ? ` | Code ${partner.code}` : ''}`,
            event.id
         );

         await recordRedemption(supabaseAdmin, {
            partner,
            userId,
            stripeEventId: event.id,
            stripeObjectId: session.id,
            kind: 'one_time',
            paymentIndex: 0,
            grossCents: session.amount_subtotal ?? session.amount_total,
            netPaidCents: session.amount_total,
            bonusCredits: partnerBonusCredits(Math.round(actualPaidEuro * 100), partner),
         });
      }

      return res.status(200).json({ received: true });
    }

    // ----------------------------------------------------------------------
    // 2. HANDLE CUSTOM UI ONE-TIME PAYMENTS (create_intent.js)
    // ----------------------------------------------------------------------
    if (event.type === 'payment_intent.succeeded') {
      const intent = event.data.object;

      if (intent.invoice || !intent.metadata?.user_id) {
          return res.status(200).json({ received: true });
      }

      console.log(`[Webhook] Processing custom UI payment_intent.succeeded [${intent.id}]`);
      const userId = intent.metadata.user_id;
      const waiverTimestamp = intent.metadata.refund_waiver_timestamp;
      const amountEuro = intent.amount / 100;

      const baseCredits = intent.amount;
      const bonusTier = bonusesConfig.bonuses.find(b => amountEuro >= b.min_euro);
      const bonusCredits = bonusTier ? Math.floor(baseCredits * (bonusTier.bonus_percent / 100)) : 0;

      // Partner bonus stacks on top of the volume bonus.
      const partner = await lookupPartnerCode(supabaseAdmin, intent.metadata?.partner_code);
      const partnerBonus = partnerBonusCredits(baseCredits, partner);

      const totalCreditsToAdd = baseCredits + bonusCredits + partnerBonus;

      let transactionDesc = `Stripe Deposit: €${amountEuro.toFixed(2)}${bonusCredits > 0 ? ` (+${bonusCredits} Bonus)` : ''}`;
      if (partnerBonus > 0) transactionDesc += ` (+${partnerBonus} Code ${partner.code})`;
      if (waiverTimestamp) transactionDesc += ` | EU Waiver Agreed: ${waiverTimestamp}`;

      await depositCredits(supabaseAdmin, userId, totalCreditsToAdd, transactionDesc, event.id);

      await recordRedemption(supabaseAdmin, {
        partner,
        userId,
        stripeEventId: event.id,
        stripeObjectId: intent.id,
        kind: 'one_time',
        paymentIndex: 0,
        grossCents: intent.amount,
        netPaidCents: intent.amount,
        bonusCredits: partnerBonus,
      });

      return res.status(200).json({ received: true });
    }

    // ----------------------------------------------------------------------
    // 3. HANDLE RECURRING MONTHLY RENEWALS
    // ----------------------------------------------------------------------
    if (event.type === 'invoice.payment_succeeded') {
      const invoice = event.data.object;
      console.log(`[Webhook] Processing invoice.payment_succeeded [${invoice.id}]`);

      // ---> NEW: Support for Stripe's newer API nested payload structures
      const subscriptionId = invoice.subscription || invoice.parent?.subscription_details?.subscription;

      if (subscriptionId) {
          if (invoice.billing_reason === 'subscription_create') {
              console.log(`[Webhook] Ignoring 'subscription_create' invoice to prevent double-credit.`);
              return res.status(200).json({ received: true });
          }

          // Fetch metadata from the new API location
          const metadata = invoice.parent?.subscription_details?.metadata
                        || invoice.lines?.data?.[0]?.metadata
                        || invoice.metadata
                        || {};

          const userId = metadata.user_id;
          const totalCreditsToAdd = parseInt(metadata.credit_amount, 10);
          const amountEuro = parseFloat(metadata.euro_amount || (invoice.amount_paid / 100)).toFixed(2);

          if (!userId || !totalCreditsToAdd) {
             console.warn(`⚠️ [Webhook] Invoice ${invoice.id} is missing user_id or credit_amount in its metadata payload.`);
             return res.status(200).json({ received: true });
          }

          console.log(`[Webhook] Extracted Renewal Data: User=${userId}, Credits=${totalCreditsToAdd}, Euro=${amountEuro}`);

          const partner = await lookupPartnerCode(supabaseAdmin, metadata.partner_code);

          // Deposit Renewal Credits
          await depositCredits(
            supabaseAdmin,
            userId,
            totalCreditsToAdd,
            `Auto-Refill Renewal: €${amountEuro}${partner ? ` | Code ${partner.code}` : ''}`,
            event.id
          );

          // Commission keeps paying on renewals, but only up to the code's cap.
          if (partner) {
            const alreadyPaid = await countCommissionedPayments(supabaseAdmin, subscriptionId);
            if (alreadyPaid >= partner.max_commissioned_payments) {
              console.log(
                `[Partner] ${partner.code}: subscription ${subscriptionId} reached its ` +
                `${partner.max_commissioned_payments}-payment cap — crediting user, no commission.`
              );
            } else {
              await recordRedemption(supabaseAdmin, {
                partner,
                userId,
                stripeEventId: event.id,
                stripeObjectId: invoice.id,
                subscriptionId,
                kind: 'subscription_renewal',
                paymentIndex: alreadyPaid,
                grossCents: invoice.subtotal ?? invoice.amount_paid,
                netPaidCents: invoice.amount_paid,
                bonusCredits: partnerBonusCredits(Math.round(parseFloat(amountEuro) * 100), partner),
              });
            }
          }
      } else {
          console.log(`[Webhook] Invoice ${invoice.id} is not attached to a subscription.`);
      }
      return res.status(200).json({ received: true });
    }

    // ----------------------------------------------------------------------
    // 4. HANDLE SUBSCRIPTION CANCELLATION/EXPIRATION
    // ----------------------------------------------------------------------
    if (event.type === 'customer.subscription.deleted') {
       const subscription = event.data.object;
       console.log(`[Webhook] Processing customer.subscription.deleted [${subscription.id}]`);

       const userId = subscription.metadata?.user_id;
       if (userId) {
           await supabaseAdmin.from('profiles').update({
               recurring_stripe_subscription_id: null,
               recurring_purchase_amount: 0
           }).eq('id', userId);
           console.log(`🗑️ Unlinked deleted subscription for User ${userId}`);
       }
       return res.status(200).json({ received: true });
    }

  } catch (err) {
    console.error(`❌ [Webhook] Processing Error at runtime:`, err.message);
    return res.status(500).json({ error: err.message });
  }

  // Fallback for unhandled event types
  res.status(200).json({ received: true });
}

// Helper function to send emails
async function sendConfirmationEmail(email, creditsAmount) {
  try {
      const transporter = nodemailer.createTransport({
          host: process.env.SMTP_HOST,
          port: parseInt(process.env.SMTP_PORT || '587', 10),
          secure: parseInt(process.env.SMTP_PORT, 10) === 465,
          auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      });

      const templatePath = path.join(process.cwd(), 'public', 'emails', 'purchase_confirmation.html');
      let htmlTemplate = fs.readFileSync(templatePath, 'utf8');
      htmlTemplate = htmlTemplate.replace('{{CREDITS_AMOUNT}}', creditsAmount.toLocaleString());

      await transporter.sendMail({
          from: `"Spawnly Billing" <${process.env.SMTP_FROM_EMAIL}>`,
          to: email,
          replyTo: process.env.SMTP_FROM_EMAIL,
          subject: 'Payment Successful - Credits Added to Spawnly',
          html: htmlTemplate,
      });
  } catch (emailErr) {
      console.warn('❌ [Email] Failed to send confirmation email (Non-fatal):', emailErr.message);
  }
}
