// pages/api/stripe/customer_portal.js
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

    // Look up user's active subscription to grab their Stripe Customer ID
    const { data: profile } = await supabase
      .from('profiles')
      .select('recurring_stripe_subscription_id')
      .eq('id', user.id)
      .single();

    const subId = profile?.recurring_stripe_subscription_id;
    if (!subId) {
      return res.status(400).json({ error: 'You must have an active subscription to access the billing portal.' });
    }

    // Retrieve subscription from Stripe to read the Customer ID
    const subscription = await stripe.subscriptions.retrieve(subId);
    const customerId = subscription.customer;

    const origin = req.headers.origin || process.env.NEXT_PUBLIC_SITE_URL || 'https://spawnly.net';

    // Create an authenticated session for the billing portal
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${origin}/credits`,
    });

    res.status(200).json({ url: portalSession.url });
  } catch (err) {
    console.error("Customer Portal Error:", err.message);
    res.status(500).json({ error: err.message });
  }
}