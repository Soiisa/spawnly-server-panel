// pages/api/servers/[serverId]/billing.js
//
// Billing-critical fields on `servers` are not writable by the browser — a
// database trigger rejects client updates to them (see
// sql/guard_server_billing_columns.sql). The legitimate flows that need to
// change them run through here, where ownership and values are validated and
// the rate is derived server-side.

import { createClient } from '@supabase/supabase-js';
import { verifyServerAccess } from '../../../../lib/accessControl';
import { getAvailableRamTiers, getServerHourlyRate } from '../../../../lib/config';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(authHeader.split(' ')[1]);
  if (authError || !user) return res.status(401).json({ error: 'Unauthorized' });

  const { serverId } = req.query;
  const { action, ram, poolId } = req.body || {};
  if (!serverId || !action) return res.status(400).json({ error: 'Missing parameters' });

  const { data: server, error: serverErr } = await supabaseAdmin
    .from('servers')
    .select('id, user_id, ram, status, billing_type, cost_per_hour, pool_id')
    .eq('id', serverId)
    .single();
  if (serverErr || !server) return res.status(404).json({ error: 'Server not found' });

  // Both actions change who pays or how much, so they are owner-only.
  const access = await verifyServerAccess(supabaseAdmin, serverId, user.id);
  if (!access.allowed || !access.isOwner) return res.status(403).json({ error: 'Forbidden' });

  // --------------------------------------------------------------- set_ram
  if (action === 'set_ram') {
    const newRam = Number(ram);
    if (!getAvailableRamTiers().includes(newRam)) {
      return res.status(400).json({ error: 'Invalid RAM tier' });
    }
    // Monthly servers resize through /scale, which prorates the difference and
    // moves real hardware. Routing them here would skip that charge.
    if (server.billing_type === 'monthly') {
      return res.status(400).json({ error: 'Monthly servers must be resized via the scaling endpoint' });
    }
    if (server.status !== 'Stopped') {
      return res.status(409).json({ error: 'Server must be stopped to change RAM' });
    }

    const cost_per_hour = getServerHourlyRate(newRam, server.billing_type);
    const { error: uErr } = await supabaseAdmin
      .from('servers')
      .update({ ram: newRam, cost_per_hour })
      .eq('id', serverId);
    if (uErr) return res.status(500).json({ error: uErr.message });

    return res.status(200).json({ success: true, ram: newRam, cost_per_hour });
  }

  // -------------------------------------------------------------- set_pool
  if (action === 'set_pool') {
    // null == bill the owner's personal wallet.
    if (poolId) {
      const { data: pool } = await supabaseAdmin
        .from('credit_pools')
        .select('id, owner_id')
        .eq('id', poolId)
        .single();
      // Without this check any pool UUID could be attached, billing a stranger.
      if (!pool || pool.owner_id !== user.id) {
        return res.status(403).json({ error: 'Pool not found or not owned by you' });
      }
    }

    const { error: uErr } = await supabaseAdmin
      .from('servers')
      .update({ pool_id: poolId || null })
      .eq('id', serverId);
    if (uErr) return res.status(500).json({ error: uErr.message });

    return res.status(200).json({ success: true, pool_id: poolId || null });
  }

  return res.status(400).json({ error: 'Unknown action' });
}
