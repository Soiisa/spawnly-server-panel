import { stripe } from '../../../lib/stripe';
import { createClient } from '@supabase/supabase-js';
import { buffer } from 'micro'; 
import bonusesConfig from '../../../lib/stripeBonuses.json';
import nodemailer from 'nodemailer';
import fs from 'fs';
import path from 'path';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const config = {
  api: {
    bodyParser: false, 
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;
  try {
    const buf = await buffer(req);
    event = stripe.webhooks.constructEvent(buf, sig, webhookSecret);
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed' || event.type === 'payment_intent.succeeded') {
    const object = event.data.object;
    
    const userId = object.metadata.user_id;
    const waiverTimestamp = object.metadata.refund_waiver_timestamp;
    
    const amountInCents = object.amount || object.amount_total;
    const amountEuro = amountInCents / 100; 

    const baseCredits = amountInCents; 
    const bonusTier = bonusesConfig.bonuses.find(b => amountEuro >= b.min_euro);
    const bonusCredits = bonusTier ? Math.floor(baseCredits * (bonusTier.bonus_percent / 100)) : 0;
    const totalCreditsToAdd = baseCredits + bonusCredits;

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    try {
      // 1. Update Database
      const { data: profile } = await supabaseAdmin.from('profiles').select('credits, email').eq('id', userId).single();
      const newBalance = (profile?.credits || 0) + totalCreditsToAdd;
      
      await supabaseAdmin.from('profiles').update({ credits: newBalance }).eq('id', userId);

      // Append the exact timestamp of the waiver agreement into the permanent database record
      let transactionDesc = `Stripe Deposit: €${amountEuro.toFixed(2)}${bonusCredits > 0 ? ` (+${bonusCredits} Bonus)` : ''}`;
      if (waiverTimestamp) {
        transactionDesc += ` | EU Waiver Agreed: ${waiverTimestamp}`;
      }

      await supabaseAdmin.from('credit_transactions').insert({
        user_id: userId,
        amount: totalCreditsToAdd,
        type: 'deposit',
        description: transactionDesc,
        created_at: new Date().toISOString()
      });
      
      console.log(`✅ Success: Added ${totalCreditsToAdd} credits to user ${userId}`);

      // 2. Send Confirmation Email
      if (profile?.email) {
          try {
              console.log(`📧 Sending confirmation email to ${profile.email}...`);
              
              const transporter = nodemailer.createTransport({
                  host: process.env.SMTP_HOST,
                  port: parseInt(process.env.SMTP_PORT || '587', 10),
                  secure: parseInt(process.env.SMTP_PORT, 10) === 465, 
                  auth: {
                    user: process.env.SMTP_USER,
                    pass: process.env.SMTP_PASS,
                  },
              });

              const templatePath = path.join(process.cwd(), 'public', 'emails', 'purchase_confirmation.html');
              let htmlTemplate = fs.readFileSync(templatePath, 'utf8');
              
              // Replace placeholder with formatted amount
              htmlTemplate = htmlTemplate.replace('{{CREDITS_AMOUNT}}', totalCreditsToAdd.toLocaleString());

              await transporter.sendMail({
                  from: `"Spawnly Billing" <${process.env.SMTP_FROM_EMAIL}>`,
                  to: profile.email,
                  replyTo: process.env.SMTP_FROM_EMAIL, // Allow them to reply directly to support
                  subject: 'Payment Successful - Credits Added to Spawnly',
                  html: htmlTemplate,
              });
              
              console.log(`✅ Confirmation email sent!`);
          } catch (emailErr) {
              console.error('❌ Failed to send confirmation email:', emailErr.message);
              // We do NOT throw here, because we don't want to tell Stripe the webhook failed 
              // just because the email failed. The credits were already added successfully.
          }
      }

    } catch (err) {
      console.error('❌ DB Error:', err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  res.status(200).json({ received: true });
}