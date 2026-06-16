// pages/api/stripe/update_subscription.js
import { stripe } from '../../../lib/stripe';
import { createClient } from '@supabase/supabase-js';
import bonusesConfig from '../../../lib/stripeBonuses.json';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

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

    // Recalculate credits so the Webhook knows the new payload size
    const baseCredits = Math.round(amount * 100);
    const bonusTier = bonusesConfig.bonuses.find(b => amount >= b.min_euro);
    const bonusCredits = bonusTier ? Math.floor(baseCredits * (bonusTier.bonus_percent / 100)) : 0;
    const totalCredits = baseCredits + bonusCredits;

    // ---> THE FIX: Create the new product explicitly first so Stripe accepts it
    const newProduct = await stripe.products.create({
      name: `Monthly Auto-Refill (${totalCredits.toLocaleString()} Credits)`,
    });

    // Retrieve the subscription from Stripe to get the internal Item ID
    const subscription = await stripe.subscriptions.retrieve(subId);
    const subItemId = subscription.items.data[0].id;

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
        credit_amount: totalCredits
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