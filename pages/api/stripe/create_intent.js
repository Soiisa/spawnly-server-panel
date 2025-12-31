import { stripe } from '../../../lib/stripe';
import { createClient } from '@supabase/supabase-js';

// We import bonuses to calculate the exact amount/bonus server-side if needed, 
// though for the intent we primarily need the amount to charge.
// Ensure the path to stripeBonuses.json is correct relative to this file.
import bonusesConfig from '../../../lib/stripeBonuses.json';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // 1. Authenticate the user via Supabase
    // We forward the user's access token to Supabase to verify identity
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: req.headers.authorization } },
    });
    
    const { data: { user }, error } = await supabase.auth.getUser();
    
    if (error || !user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // 2. Validate the requested amount
    const { amount } = req.body; // Amount in Euros

    if (!amount || isNaN(amount) || amount < 3 || amount > 50) {
      return res.status(400).json({ error: 'Amount must be between 3€ and 50€.' });
    }

    // 3. Create the PaymentIntent
    // We convert the Euro amount to cents (integer)
    const amountInCents = Math.round(amount * 100);

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountInCents,
      currency: 'eur',
      // In the new Stripe API, automatic_payment_methods enabled is the standard way 
      // to support Cards, Apple Pay, Google Pay, iDEAL, Bancontact, etc. automatically.
      automatic_payment_methods: {
        enabled: true,
      },
      metadata: {
        user_id: user.id,
      },
    });

    // 4. Return the client secret to the frontend
    res.status(200).json({ clientSecret: paymentIntent.client_secret });

  } catch (err) {
    console.error("Stripe Intent Error:", err.message);
    res.status(500).json({ error: err.message });
  }
}