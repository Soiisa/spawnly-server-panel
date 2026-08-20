// pages/api/admin/partners.js
//
// Admin view of partner codes: what each one has driven, and what is owed.
//
//   GET                       list codes with aggregated usage + outstanding balance
//   GET  ?codeId=<id>         redemption detail for one code
//   POST { action: 'create' } add a code
//   POST { action: 'toggle' } enable / disable a code
//   POST { action: 'mark_paid', codeId } settle everything outstanding for a code

import { createClient } from '@supabase/supabase-js';
import { normalizeCode } from '../../../lib/partnerCodes';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  // --- 1. Security Check ---
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'No token' });
  const token = authHeader.split(' ')[1];

  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !user) return res.status(401).json({ error: 'Invalid token' });

  const { data: adminProfile } = await supabaseAdmin
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single();

  if (!adminProfile?.is_admin) return res.status(403).json({ error: 'Forbidden' });

  // --- 2. GET ---
  if (req.method === 'GET') {
    try {
      const { codeId } = req.query;

      if (codeId) {
        const { data: rows, error } = await supabaseAdmin
          .from('partner_redemptions')
          .select('*')
          .eq('code_id', codeId)
          .order('created_at', { ascending: false })
          .limit(500);
        if (error) throw error;
        return res.status(200).json({ redemptions: rows || [] });
      }

      const { data: codes, error: cErr } = await supabaseAdmin
        .from('partner_codes')
        .select('*')
        .order('created_at', { ascending: false });
      if (cErr) throw cErr;

      const { data: reds, error: rErr } = await supabaseAdmin
        .from('partner_redemptions')
        .select('code_id, user_id, net_paid_cents, commission_cents, bonus_credits, paid_out, kind');
      if (rErr) throw rErr;

      const summary = (codes || []).map((c) => {
        const mine = (reds || []).filter((r) => r.code_id === c.id);
        const owed = mine.filter((r) => !r.paid_out);
        return {
          ...c,
          uses: mine.length,
          unique_users: new Set(mine.map((r) => r.user_id)).size,
          revenue_cents: mine.reduce((a, r) => a + r.net_paid_cents, 0),
          commission_total_cents: mine.reduce((a, r) => a + r.commission_cents, 0),
          commission_owed_cents: owed.reduce((a, r) => a + r.commission_cents, 0),
          bonus_credits_given: mine.reduce((a, r) => a + r.bonus_credits, 0),
          subscriptions: mine.filter((r) => r.kind !== 'one_time').length,
        };
      });

      return res.status(200).json({
        codes: summary,
        totals: {
          revenue_cents: summary.reduce((a, c) => a + c.revenue_cents, 0),
          commission_owed_cents: summary.reduce((a, c) => a + c.commission_owed_cents, 0),
        },
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // --- 3. POST ---
  if (req.method === 'POST') {
    const { action } = req.body || {};

    try {
      if (action === 'create') {
        const {
          code, partner_name, partner_email,
          bonus_percent = 10, commission_percent = 10,
          max_commissioned_payments = 12, notes,
        } = req.body;

        if (!code || !partner_name) {
          return res.status(400).json({ error: 'Code and partner name are required' });
        }
        for (const [label, v] of [['bonus_percent', bonus_percent], ['commission_percent', commission_percent]]) {
          if (isNaN(v) || Number(v) < 0 || Number(v) > 100) {
            return res.status(400).json({ error: `${label} must be between 0 and 100` });
          }
        }

        const { data, error } = await supabaseAdmin.from('partner_codes').insert({
          code: normalizeCode(code),
          partner_name,
          partner_email: partner_email || null,
          bonus_percent: Number(bonus_percent),
          commission_percent: Number(commission_percent),
          max_commissioned_payments: Number(max_commissioned_payments),
          notes: notes || null,
        }).select().single();

        if (error) {
          if (error.code === '23505') return res.status(409).json({ error: 'That code already exists' });
          throw error;
        }
        return res.status(200).json({ success: true, code: data });
      }

      if (action === 'toggle') {
        const { codeId, active } = req.body;
        if (!codeId) return res.status(400).json({ error: 'Missing codeId' });
        const { error } = await supabaseAdmin
          .from('partner_codes').update({ active: !!active }).eq('id', codeId);
        if (error) throw error;
        return res.status(200).json({ success: true });
      }

      if (action === 'mark_paid') {
        const { codeId } = req.body;
        if (!codeId) return res.status(400).json({ error: 'Missing codeId' });
        const { data, error } = await supabaseAdmin
          .from('partner_redemptions')
          .update({ paid_out: true, paid_out_at: new Date().toISOString() })
          .eq('code_id', codeId)
          .eq('paid_out', false)
          .select('commission_cents');
        if (error) throw error;
        const settled = (data || []).reduce((a, r) => a + r.commission_cents, 0);
        return res.status(200).json({ success: true, settled_cents: settled, rows: (data || []).length });
      }

      return res.status(400).json({ error: 'Unknown action' });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
