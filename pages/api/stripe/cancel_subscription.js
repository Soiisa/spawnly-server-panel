// pages/api/stripe/cancel_subscription.js
import { stripe } from '../../../lib/stripe';
import { createClient } from '@supabase/supabase-js';

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

    // Fetch the user's active subscription ID
    const { data: profile } = await supabase
      .from('profiles')
      .select('recurring_stripe_subscription_id')
      .eq('id', user.id)
      .single();

    if (!profile || !profile.recurring_stripe_subscription_id) {
      return res.status(400).json({ error: 'No active subscription found.' });
    }

    // Cancel the subscription in Stripe immediately
    await stripe.subscriptions.cancel(profile.recurring_stripe_subscription_id);

    // Remove the subscription link from the database
    await supabase.from('profiles').update({
      recurring_stripe_subscription_id: null,
      recurring_purchase_amount: 0
    }).eq('id', user.id);

    res.status(200).json({ success: true });
  } catch (err) {
    console.error("Cancel Sub Error:", err.message);
    res.status(500).json({ error: err.message });
  }
}