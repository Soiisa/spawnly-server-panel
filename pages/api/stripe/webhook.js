import { stripe } from '../../../lib/stripe';
import { createClient } from '@supabase/supabase-js';
import { buffer } from 'micro'; 
import bonusesConfig from '../../../lib/stripeBonuses.json';

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

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const userId = session.metadata.user_id;
    const amountEuro = session.amount_total / 100;

    // Calculate Credits + Bonus using the JSON config
    const baseCredits = session.amount_total; // 1 cent = 1 credit
    const bonusTier = bonusesConfig.bonuses.find(b => amountEuro >= b.min_euro);
    const bonusCredits = bonusTier ? Math.floor(baseCredits * (bonusTier.bonus_percent / 100)) : 0;
    const totalCreditsToAdd = baseCredits + bonusCredits;

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    try {
      const { data: profile } = await supabaseAdmin.from('profiles').select('credits').eq('id', userId).single();
      const newBalance = (profile?.credits || 0) + totalCreditsToAdd;
      
      await supabaseAdmin.from('profiles').update({ credits: newBalance }).eq('id', userId);

      await supabaseAdmin.from('credit_transactions').insert({
        user_id: userId,
        amount: totalCreditsToAdd,
        type: 'deposit',
        description: `Stripe Deposit: €${amountEuro.toFixed(2)}${bonusCredits > 0 ? ` (+${bonusCredits} Bonus)` : ''}`,
        created_at: new Date().toISOString()
      });
      
      console.log(`✅ Success: Added ${totalCreditsToAdd} credits to user ${userId}`);
    } catch (err) {
      console.error('❌ DB Error:', err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  res.status(200).json({ received: true });
}