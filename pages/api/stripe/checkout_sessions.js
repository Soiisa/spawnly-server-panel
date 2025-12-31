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
    
    if (error || !user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { amount } = req.body; // Amount in Euros from slider

    if (!amount || isNaN(amount) || amount < 3 || amount > 50) {
      return res.status(400).json({ error: 'Amount must be between 3€ and 50€.' });
    }

    // Calculate Bonus logic
    const baseCredits = amount * 100;
    const bonusTier = bonusesConfig.bonuses.find(b => amount >= b.min_euro);
    const bonusCredits = bonusTier ? Math.floor(baseCredits * (bonusTier.bonus_percent / 100)) : 0;
    const totalCredits = baseCredits + bonusCredits;

    // Get origin to serve the image. Fallback to a production URL if origin is missing.
    const origin = req.headers.origin || process.env.NEXT_PUBLIC_SITE_URL || 'https://spawnly.net';

    const session = await stripe.checkout.sessions.create({
      line_items: [
        {
          price_data: {
            currency: 'eur',
            product_data: {
              name: `${totalCredits.toLocaleString()} Spawnly Credits`,
              description: bonusCredits > 0 
                ? `Includes ${bonusCredits} bonus credits (${bonusTier.bonus_percent}% bonus!)`
                : `Instant deposit of ${baseCredits} credits.`,
              // NEW: Add image to the product display on Stripe
              images: [`${origin}/logo.png`], 
            },
            unit_amount: Math.round(amount * 100),
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      // NEW: Customizes the pay button text (e.g., "Pay €10.00")
      submit_type: 'pay', 
      // NEW: Allows you to create coupons in Stripe Dashboard and users can use them
      allow_promotion_codes: true, 
      success_url: `${origin}/credits?payment_success=true`,
      cancel_url: `${origin}/credits?payment_canceled=true`,
      metadata: { 
        user_id: user.id 
      },
    });

    res.status(200).json({ url: session.url });
  } catch (err) {
    console.error("Stripe Error:", err.message);
    res.status(500).json({ error: err.message });
  }
}