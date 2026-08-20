// pages/api/stripe/checkout_sessions.js
import { stripe } from '../../../lib/stripe';
import { createClient } from '@supabase/supabase-js';
import bonusesConfig from '../../../lib/stripeBonuses.json';
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

    const { amount, isSubscription, partner_code } = req.body;

    if (!amount || isNaN(amount) || amount < 5 || amount > 200) {
      return res.status(400).json({ error: 'Invalid amount.' });
    }

    // --- FIX: Calculate Base Credits and Only Apply Bonuses to One-Time Purchases ---
    const baseCredits = Math.round(amount * 100);
    let bonusCredits = 0;
    let bonusTier = null;

    if (!isSubscription) {
      bonusTier = bonusesConfig.bonuses.find(b => amount >= b.min_euro);
      bonusCredits = bonusTier ? Math.floor(baseCredits * (bonusTier.bonus_percent / 100)) : 0;
    }

    // The partner bonus, unlike the volume bonus, applies to subscriptions too.
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    const partner = await lookupPartnerCode(supabaseAdmin, partner_code);
    const partnerBonus = partnerBonusCredits(baseCredits, partner);

    const totalCredits = baseCredits + bonusCredits + partnerBonus;

    const origin = req.headers.origin || process.env.NEXT_PUBLIC_SITE_URL || 'https://spawnly.net';

    const bonusBlurb = [
      bonusCredits > 0 ? `${bonusCredits} bonus credits (${bonusTier.bonus_percent}% bonus!)` : null,
      partnerBonus > 0 ? `${partnerBonus} partner bonus credits (code ${partner.code})` : null,
    ].filter(Boolean).join(' + ');

    const sessionConfig = {
      line_items: [
        {
          price_data: {
            currency: 'eur',
            product_data: {
              name: isSubscription ? `Monthly Auto-Refill (${totalCredits.toLocaleString()} Credits)` : `${totalCredits.toLocaleString()} Spawnly Credits`,
              description: bonusBlurb
                ? `Includes ${bonusBlurb}`
                : `Instant deposit of ${baseCredits} credits.`,
              images: [`${origin}/logo.png`],
            },
            unit_amount: Math.round(amount * 100),
            ...(isSubscription && { recurring: { interval: 'month' } }),
          },
          quantity: 1,
        },
      ],
      mode: isSubscription ? 'subscription' : 'payment',
      allow_promotion_codes: true, // Promos allowed on both subscriptions and one-time
      success_url: `${origin}/credits?payment_success=true`,
      cancel_url: `${origin}/credits?payment_canceled=true`,
      metadata: {
        user_id: user.id,
        is_subscription: isSubscription ? 'true' : 'false',
        credit_amount: totalCredits,
        euro_amount: amount,
        partner_code: partner ? partner.code : '',
      },
      // Pass metadata to the subscription object so the webhook can read it on renewals
      ...(isSubscription && {
        subscription_data: {
          metadata: {
            user_id: user.id,
            credit_amount: totalCredits,
            euro_amount: amount,
            // Renewals read the code from here to keep paying the partner.
            partner_code: partner ? partner.code : '',
          }
        }
      })
    };

    if (!isSubscription) {
        sessionConfig.submit_type = 'pay';
    }

    const session = await stripe.checkout.sessions.create(sessionConfig);

    res.status(200).json({ url: session.url });
  } catch (err) {
    console.error("Stripe Error:", err.message);
    res.status(500).json({ error: err.message });
  }
}
