// pages/api/servers/update-status.js
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const HETZNER_TOKEN = process.env.HETZNER_API_TOKEN;
const CLOUDFLARE_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const CLOUDFLARE_ZONE_ID = process.env.CLOUDFLARE_ZONE_ID;
const SLEEPER_PROXY_IP = process.env.SLEEPER_PROXY_IP || '91.99.130.49';
const DOMAIN_SUFFIX = '.spawnly.net';

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// --- Teardown Helpers (Mirrored from action.js) ---
async function pointToSleeper(subdomain) {
  if (!subdomain) return;
  const url = `https://api.cloudflare.com/client/v4/zones/${CLOUDFLARE_ZONE_ID}/dns_records`;
  const cleanSub = subdomain.replace(DOMAIN_SUFFIX, '');
  const search = await fetch(`${url}?name=${encodeURIComponent(cleanSub + DOMAIN_SUFFIX)}`, { headers: { Authorization: `Bearer ${CLOUDFLARE_API_TOKEN}` } });
  const { result } = await search.json();
  for (const rec of result) { await fetch(`${url}/${rec.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${CLOUDFLARE_API_TOKEN}` } }); }
  await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${CLOUDFLARE_API_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'A', name: `${cleanSub}${DOMAIN_SUFFIX}`, content: SLEEPER_PROXY_IP, ttl: 60, proxied: false })
  });
}

async function billFinalTime(server, now) {
  if (server.status !== 'Running' && server.status !== 'Starting') return;
  let baseTime = server.last_billed_at ? new Date(server.last_billed_at) : (server.running_since ? new Date(server.running_since) : null);
  if (!baseTime) return;
  const elapsedSeconds = Math.floor((now - baseTime) / 1000) + (server.runtime_accumulated_seconds || 0);
  if (elapsedSeconds < 60) return;
  const hours = elapsedSeconds / 3600;
  const cost = hours * (server.cost_per_hour || 0);
  
  const { data: profile } = await supabaseAdmin.from('profiles').select('credits').eq('id', server.user_id).single();
  if (profile) {
    await supabaseAdmin.from('profiles').update({ credits: profile.credits - cost }).eq('id', server.user_id);
    await supabaseAdmin.from('credit_transactions').insert({
      user_id: server.user_id, amount: -cost, type: 'usage', session_id: server.current_session_id, description: `Automated teardown charge (${elapsedSeconds}s)`
    });
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { serverId, status, cpu, memory, disk, player_count, players_online, tps, tps_1m, tps_5m, tps_15m, 
            error: reporterError, timestamp, max_players, motd, map, sync_complete } = req.body;
    const now = timestamp ? new Date(timestamp) : new Date();

    const { data: server, error: fetchErr } = await supabaseAdmin.from('servers').select('*').eq('id', serverId).single();
    if (fetchErr || !server) return res.status(404).json({ error: 'Server not found' });

    const authHeader = req.headers.authorization;
    if (!authHeader || authHeader !== `Bearer ${server.rcon_password}`) {
      console.warn(`[Security] Unauthorized update attempt for ${serverId}`);
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // --- AUTOMATED TEARDOWN (TRIGGERED BY MC-SYNC.SH) ---
    if (sync_complete) {
      console.log(`[Auto-Stop] Finalizing teardown for ${serverId}`);
      await billFinalTime(server, now);
      await pointToSleeper(server.subdomain);
      if (server.hetzner_id) {
        await fetch(`https://api.hetzner.cloud/v1/servers/${server.hetzner_id}`, {
          method: 'DELETE', headers: { Authorization: `Bearer ${HETZNER_TOKEN}` }
        });
      }
      await supabaseAdmin.from('servers').update({
        status: 'Stopped', hetzner_id: null, ipv4: null, running_since: null,
        last_billed_at: null, runtime_accumulated_seconds: 0, current_session_id: null, last_empty_at: null
      }).eq('id', serverId);
      return res.status(200).json({ success: true });
    }

    // --- REGULAR STATUS UPDATES & METRICS ---
    const updates = {
      status: status || server.status,
      last_heartbeat_at: now.toISOString(),
      error_message: reporterError || null,
      player_count: player_count !== undefined ? Number(player_count) : server.player_count,
      players_online: players_online || server.players_online,
    };

    // Auto-stop logic (if empty for too long)
    if (status === 'Running') {
      if (Number(player_count) > 0) updates.last_empty_at = null;
      else if (!server.last_empty_at) updates.last_empty_at = now.toISOString();
    } else updates.last_empty_at = null;

    // Optional metrics
    if (cpu !== undefined) updates.cpu = Number(cpu.toFixed(1));
    if (memory !== undefined) updates.memory = Number(memory.toFixed(1));
    if (disk !== undefined) updates.disk = Number(disk);
    if (max_players !== undefined) updates.max_players = Number(max_players);
    if (motd !== undefined) updates.motd = motd || '';
    if (map !== undefined) updates.map = map || '';
    if (tps !== undefined) updates.tps = Number(tps);
    if (tps_1m !== undefined) updates.tps_1m = Number(tps_1m);
    if (tps_5m !== undefined) updates.tps_5m = Number(tps_5m);
    if (tps_15m !== undefined) updates.tps_15m = Number(tps_15m);

    // Runtime tracking logic
    if (status === 'Running') {
      if (!server.running_since) {
        updates.running_since = now.toISOString();
        if (!server.last_billed_at) updates.last_billed_at = now.toISOString();
        if (server.runtime_accumulated_seconds == null) updates.runtime_accumulated_seconds = 0;
      }
    } else if (server.running_since) {
      try {
        const runningSince = new Date(server.running_since);
        const deltaSeconds = Math.max(0, Math.floor((now - runningSince) / 1000));
        updates.runtime_accumulated_seconds = (server.runtime_accumulated_seconds || 0) + deltaSeconds;
      } catch (e) {}
      updates.running_since = null;
    }

    const { data, error: updateErr } = await supabaseAdmin.from('servers').update(updates).eq('id', serverId).select().single();
    if (updateErr) return res.status(500).json({ error: 'Failed to update server' });

    return res.status(200).json({ success: true, server: data });
  } catch (error) {
    console.error('Unexpected error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}