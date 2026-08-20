import { stripe } from '../../../lib/stripe';
import { createClient } from '@supabase/supabase-js';
import bonusesConfig from '../../../lib/stripeBonuses.json';
import { lookupPartnerCode } from '../../../lib/partnerCodes';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: req.headers.authorization } },
    });

    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Extract the waiver agreement
    const { amount, refund_waiver_agreed, partner_code } = req.body;

    if (!amount || isNaN(amount) || amount < 3 || amount > 50) {
      return res.status(400).json({ error: 'Amount must be between 3€ and 50€.' });
    }

    // Re-check the code server-side. An invalid one is simply ignored rather
    // than failing the payment; the webhook re-reads it from metadata anyway.
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    const partner = await lookupPartnerCode(supabaseAdmin, partner_code);

    const amountInCents = Math.round(amount * 100);

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountInCents,
      currency: 'eur',
      automatic_payment_methods: {
        enabled: true,
      },
      metadata: {
        user_id: user.id,
        // Save the waiver proof onto Stripe's servers
        refund_waiver_agreed: refund_waiver_agreed ? 'true' : 'false',
        refund_waiver_timestamp: refund_waiver_agreed ? new Date().toISOString() : null,
        // Partner attribution travels with the payment so the webhook can grant
        // the buyer's bonus and record what the partner earned.
        partner_code: partner ? partner.code : null,
      },
    });

    res.status(200).json({ clientSecret: paymentIntent.client_secret });

  } catch (err) {
    console.error("Stripe Intent Error:", err.message);
    res.status(500).json({ error: err.message });
  }
}
