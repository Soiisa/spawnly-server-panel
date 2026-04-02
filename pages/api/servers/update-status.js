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

async function pointToSleeper(subdomain) {
  if (!subdomain) return;
  const url = `https://api.cloudflare.com/client/v4/zones/${CLOUDFLARE_ZONE_ID}/dns_records`;
  const cleanSub = subdomain.replace(DOMAIN_SUFFIX, '');
  
  try {
    const search = await fetch(`${url}?name=${encodeURIComponent(cleanSub + DOMAIN_SUFFIX)}`, { headers: { Authorization: `Bearer ${CLOUDFLARE_API_TOKEN}` } });
    const { result } = await search.json();
    for (const rec of result) { await fetch(`${url}/${rec.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${CLOUDFLARE_API_TOKEN}` } }); }
    await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${CLOUDFLARE_API_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'A', name: `${cleanSub}${DOMAIN_SUFFIX}`, content: SLEEPER_PROXY_IP, ttl: 60, proxied: false })
    });
  } catch (e) {}
}

// --- FIX: ADDED DEDUCT CREDITS LOGIC ---
async function deductCredits(supabaseAdmin, userId, amount, serverId, sessionId, billableSeconds) {
  const { data: profile, error } = await supabaseAdmin.from('profiles').select('credits').eq('id', userId).single();
  if (error || profile.credits < amount) throw new Error('Insufficient credits');

  const newCredits = profile.credits - amount;
  await supabaseAdmin.from('profiles').update({ credits: newCredits }).eq('id', userId);

  let existingTx = null;
  if (sessionId) {
      const { data } = await supabaseAdmin.from('credit_transactions').select('*').eq('session_id', sessionId).eq('type', 'usage').single();
      existingTx = data;
  }

  if (existingTx) {
      const newAmount = existingTx.amount - amount;
      const timeMatch = existingTx.description.match(/\((\d+)\s*seconds\)/);
      let totalSeconds = billableSeconds;
      if (timeMatch && timeMatch[1]) totalSeconds += parseInt(timeMatch[1], 10);
      await supabaseAdmin.from('credit_transactions').update({
        amount: newAmount, description: `Automated teardown charge (${totalSeconds} seconds)`
      }).eq('id', existingTx.id);
  } else {
      await supabaseAdmin.from('credit_transactions').insert({
          user_id: userId, amount: -amount, type: 'usage',
          description: `Automated teardown charge (${billableSeconds} seconds)`, created_at: new Date().toISOString(), session_id: sessionId
      });
  }
}

// --- FIX: ADDED POOL DEDUCTION LOGIC ---
async function deductPoolCredits(supabaseAdmin, poolId, amount, serverId, sessionId, billableSeconds) {
    const { data: pool, error } = await supabaseAdmin.from('credit_pools').select('balance').eq('id', poolId).single();
    if (error || pool.balance < amount) throw new Error('Insufficient pool credits');
    
    const newBalance = pool.balance - amount;
    await supabaseAdmin.from('credit_pools').update({ balance: newBalance }).eq('id', poolId);

    let existingTx = null;
    if (sessionId) {
        const { data } = await supabaseAdmin.from('pool_transactions').select('*').eq('session_id', sessionId).eq('pool_id', poolId).eq('type', 'usage').single();
        existingTx = data;
    }

    if (existingTx) {
         const newAmount = existingTx.amount - amount;
         const timeMatch = existingTx.description.match(/\((\d+)\s*seconds\)/);
         let totalSeconds = billableSeconds;
         if (timeMatch && timeMatch[1]) totalSeconds += parseInt(timeMatch[1], 10);
         await supabaseAdmin.from('pool_transactions').update({
             amount: newAmount, description: `Automated teardown charge (${totalSeconds} seconds)`
         }).eq('id', existingTx.id);
    } else {
        await supabaseAdmin.from('pool_transactions').insert({
            pool_id: poolId, server_id: serverId, amount: -amount, type: 'usage',
            description: `Automated teardown charge (${billableSeconds} seconds)`, session_id: sessionId
        });
    }
}

// --- FIX: ROUTE TO POOL OR PERSONAL WALLET ---
async function billFinalTime(server, now) {
  if (server.status !== 'Running' && server.status !== 'Starting') return;
  let baseTime = server.last_billed_at ? new Date(server.last_billed_at) : (server.running_since ? new Date(server.running_since) : null);
  if (!baseTime) return;
  
  const elapsedSeconds = Math.floor((now - baseTime) / 1000) + (server.runtime_accumulated_seconds || 0);
  if (elapsedSeconds < 60) return; 

  const hours = elapsedSeconds / 3600;
  const cost = Number((hours * (server.cost_per_hour || 0)).toFixed(4));
  
  if (server.pool_id) {
      try { await deductPoolCredits(supabaseAdmin, server.pool_id, cost, server.id, server.current_session_id, elapsedSeconds); } catch(e){}
  } else {
      try { await deductCredits(supabaseAdmin, server.user_id, cost, server.id, server.current_session_id, elapsedSeconds); } catch(e){}
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
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (sync_complete) {
      if (server.development_mode) {
          await supabaseAdmin.from('servers').update({
            status: 'Maintenance', 
            last_heartbeat_at: now.toISOString(),
            started_at: null 
          }).eq('id', serverId);
          return res.status(200).json({ success: true, message: "Development mode active: Server preserved." });
      }

      await billFinalTime(server, now);
      await pointToSleeper(server.subdomain);
      
      if (server.hetzner_id) {
        try {
            await fetch(`https://api.hetzner.cloud/v1/servers/${server.hetzner_id}`, {
            method: 'DELETE', headers: { Authorization: `Bearer ${HETZNER_TOKEN}` }
            });
        } catch (e) {}
      }
      
      await supabaseAdmin.from('servers').update({
        status: 'Stopped', hetzner_id: null, ipv4: null, running_since: null,
        last_billed_at: null, runtime_accumulated_seconds: 0, current_session_id: null, last_empty_at: null,
        started_at: null 
      }).eq('id', serverId);
      
      return res.status(200).json({ success: true });
    }

    const updates = {
      status: status || server.status,
      last_heartbeat_at: now.toISOString(),
      error_message: reporterError || null,
      player_count: player_count !== undefined ? Number(player_count) : server.player_count,
      players_online: players_online || server.players_online,
    };

    if (status === 'Running' || status === 'Stopped' || status === 'Crashed') {
        updates.started_at = null;
    }

    if (status === 'Running' && !server.development_mode) { 
      if (Number(player_count) > 0) updates.last_empty_at = null;
      else if (!server.last_empty_at) updates.last_empty_at = now.toISOString();
    } else updates.last_empty_at = null;

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
    return res.status(500).json({ error: 'Internal server error' });
  }
}