// pages/api/admin/fleet-audit.js
// Cross-references Hetzner's live server list against Supabase's `servers` table
// to surface orphaned VPS instances (e.g. manual test/debug boxes) that are
// still being billed by Hetzner but aren't tracked anywhere in the platform.

import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const HETZNER_API_BASE = 'https://api.hetzner.cloud/v1';

// Hourly pricing (Excl VAT) - kept in sync with pages/api/admin/stats.js
const HETZNER_PRICING = {
  'cx23': 0.0056, 'cx33': 0.0088, 'cx43': 0.0152, 'cx53': 0.0280,
  'cpx11': 0.0071, 'cpx21': 0.0135, 'cpx31': 0.0275, 'cpx41': 0.0534, 'cpx51': 0.1068,
  'ccx13': 0.0298, 'ccx23': 0.0595, 'ccx33': 0.1190,
};

export default async function handler(req, res) {
  // 1. Auth Check
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'No token' });
  const token = authHeader.split(' ')[1];

  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !user) return res.status(401).json({ error: 'Invalid token' });

  const { data: profile } = await supabaseAdmin
    .from('profiles').select('is_admin').eq('id', user.id).single();
  if (!profile?.is_admin) return res.status(403).json({ error: 'Forbidden' });

  // 2. GET: Audit
  if (req.method === 'GET') {
    try {
      const hRes = await fetch(`${HETZNER_API_BASE}/servers`, {
        headers: { Authorization: `Bearer ${process.env.HETZNER_API_TOKEN}` }
      });
      if (!hRes.ok) throw new Error(`Hetzner API returned ${hRes.status}`);
      const hData = await hRes.json();
      const hetznerServers = hData.servers || [];

      const { data: trackedServers, error: dbError } = await supabaseAdmin
        .from('servers')
        .select('id, name, hetzner_id, user_id, status')
        .not('hetzner_id', 'is', null);
      if (dbError) throw dbError;

      const trackedIds = new Set(trackedServers.map(s => String(s.hetzner_id)));

      const orphaned = hetznerServers
        .filter(s => !trackedIds.has(String(s.id)))
        .map(s => {
          const type = s.server_type?.name?.toLowerCase() || '';
          const costPerHour = HETZNER_PRICING[type] || 0.01;
          const ageMs = Date.now() - new Date(s.created).getTime();
          return {
            hetzner_id: s.id,
            name: s.name,
            server_type: s.server_type?.name || 'unknown',
            ipv4: s.public_net?.ipv4?.ip || null,
            status: s.status,
            created: s.created,
            age_hours: Math.floor(ageMs / (1000 * 60 * 60)),
            cost_per_hour: costPerHour,
            cost_accrued: Number(((ageMs / (1000 * 60 * 60)) * costPerHour).toFixed(2))
          };
        })
        .sort((a, b) => b.cost_accrued - a.cost_accrued);

      return res.status(200).json({
        total_hetzner_servers: hetznerServers.length,
        total_tracked_servers: trackedServers.length,
        orphaned_count: orphaned.length,
        orphaned_cost_per_hour: Number(orphaned.reduce((acc, s) => acc + s.cost_per_hour, 0).toFixed(4)),
        orphaned
      });
    } catch (e) {
      console.error('Fleet audit error:', e);
      return res.status(500).json({ error: 'Failed to audit fleet', detail: e.message });
    }
  }

  // 3. POST: Terminate an orphaned Hetzner server directly (not in our DB, so no DNS/S3 teardown needed)
  if (req.method === 'POST') {
    const { hetznerId } = req.body;
    if (!hetznerId) return res.status(400).json({ error: 'Missing hetznerId' });

    try {
      const delRes = await fetch(`${HETZNER_API_BASE}/servers/${hetznerId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${process.env.HETZNER_API_TOKEN}` }
      });
      if (!delRes.ok && delRes.status !== 404) {
        const detail = await delRes.text();
        throw new Error(`Hetzner delete failed: ${detail}`);
      }
      return res.status(200).json({ success: true });
    } catch (e) {
      console.error('Orphan termination error:', e);
      return res.status(500).json({ error: 'Failed to terminate server', detail: e.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
