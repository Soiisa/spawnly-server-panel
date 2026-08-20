// pages/api/partners/validate.js
//
// Checks a partner code and tells the UI what the buyer would get. Deliberately
// returns nothing about the partner or the commission -- the browser only ever
// learns the bonus percentage.

import { createClient } from '@supabase/supabase-js';
import { lookupPartnerCode, partnerBonusCredits, normalizeCode } from '../../../lib/partnerCodes';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Require a signed-in user so this can't be used to enumerate codes anonymously.
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(authHeader.split(' ')[1]);
  if (authErr || !user) return res.status(401).json({ error: 'Unauthorized' });

  const { code, amount } = req.body || {};
  const partner = await lookupPartnerCode(supabaseAdmin, code);

  if (!partner) {
    return res.status(200).json({ valid: false, code: normalizeCode(code) });
  }

  const euro = Number(amount);
  const baseCredits = Number.isFinite(euro) && euro > 0 ? Math.round(euro * 100) : 0;

  return res.status(200).json({
    valid: true,
    code: partner.code,
    bonus_percent: Number(partner.bonus_percent),
    bonus_credits: partnerBonusCredits(baseCredits, partner),
  });
}
