// pages/api/stripe/update_subscription.js
import { stripe } from '../../../lib/stripe';
import { createClient } from '@supabase/supabase-js';
import { lookupPartnerCode, partnerBonusCredits } from '../../../lib/partnerCodes';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: req.headers.authorization } },
    });

    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return res.status(401).json({ error: 'Unauthorized' });

    const { amount } = req.body;

    if (!amount || isNaN(amount) || amount < 5 || amount > 200) {
      return res.status(400).json({ error: 'Invalid amount.' });
    }

    // Fetch the active subscription ID
    const { data: profile } = await supabase
      .from('profiles')
      .select('recurring_stripe_subscription_id')
      .eq('id', user.id)
      .single();

    const subId = profile?.recurring_stripe_subscription_id;
    if (!subId) {
      return res.status(400).json({ error: 'No active subscription found.' });
    }

    // Retrieve the subscription up front: we need its item id to reprice, and
    // its metadata to carry the partner code across the change.
    const subscription = await stripe.subscriptions.retrieve(subId);
    const subItemId = subscription.items.data[0].id;

    // Recalculate credits so the Webhook knows the new payload size.
    // Subscriptions never earn the volume bonus (see checkout_sessions.js) --
    // applying it here would quietly pay more on an edit than on signup.
    // The partner bonus does carry over, so an edit can't strip it away.
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    const partner = await lookupPartnerCode(supabaseAdmin, subscription.metadata?.partner_code);

    const baseCredits = Math.round(amount * 100);
    const partnerBonus = partnerBonusCredits(baseCredits, partner);
    const totalCredits = baseCredits + partnerBonus;

    // ---> THE FIX: Create the new product explicitly first so Stripe accepts it
    const newProduct = await stripe.products.create({
      name: `Monthly Auto-Refill (${totalCredits.toLocaleString()} Credits)`,
    });

    // Update the subscription in Stripe using the new explicitly created product
    await stripe.subscriptions.update(subId, {
      items: [{
        id: subItemId,
        price_data: {
          currency: 'eur',
          product: newProduct.id, // Passes the valid ID instead of product_data
          unit_amount: Math.round(amount * 100),
          recurring: { interval: 'month' }
        }
      }],
      metadata: {
        user_id: user.id,
        euro_amount: amount,
        credit_amount: totalCredits,
        partner_code: partner ? partner.code : '',
      },
      // 'none' means it won't charge them mid-month. It just applies the new price on the next renewal date.
      proration_behavior: 'none',
    });

    // Update our Supabase DB to reflect the new UI amount
    await supabase.from('profiles').update({
      recurring_purchase_amount: amount
    }).eq('id', user.id);

    res.status(200).json({ success: true });
  } catch (err) {
    console.error("Update Sub Error:", err.message);
    res.status(500).json({ error: err.message });
  }
}
