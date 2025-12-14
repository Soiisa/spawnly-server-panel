// pages/api/servers/update-status.js
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing Supabase env vars');
}

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const {
      serverId,
      status,
      cpu,
      memory,
      disk,
      player_count,
      players_online,
      tps,
      tps_1m,
      tps_5m,
      tps_15m,
      error: reporterError,
      timestamp,
      max_players,
      motd,
      map,
    } = req.body;

    if (!serverId) {
      return res.status(400).json({ error: 'Missing serverId' });
    }

    // --- SECURITY FIX: Authenticate Reporter ---
    // Fetch credentials securely using admin client
    const { data: serverAuth, error: authErr } = await supabaseAdmin
      .from('servers')
      .select('rcon_password')
      .eq('id', serverId)
      .single();

    if (authErr || !serverAuth) {
        return res.status(404).json({ error: 'Server not found' });
    }

    const authHeader = req.headers.authorization;
    // The server-wrapper MUST send "Bearer <RCON_PASSWORD>"
    // This authenticates that the update is coming from the actual VPS.
    if (!authHeader || authHeader !== `Bearer ${serverAuth.rcon_password}`) {
      console.warn(`[Security] Invalid status update attempt for ${serverId}`);
      return res.status(401).json({ error: 'Unauthorized status update' });
    }
    // -------------------------------------------

    const now = timestamp ? new Date(timestamp) : new Date();

    // Fetch current server state to check existing timers
    const { data: server, error: fetchErr } = await supabaseAdmin
      .from('servers')
      .select('last_empty_at, running_since, last_billed_at, runtime_accumulated_seconds')
      .eq('id', serverId)
      .single();

    if (fetchErr || !server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    // Base updates
    const updates = {
      status: status || 'Unknown',
      last_heartbeat_at: now.toISOString(),
      error_message: reporterError || null,
      player_count: player_count !== undefined ? Number(player_count) : 0,
      players_online: players_online !== undefined ? (players_online || 'None') : 'None',
    };

    // --- AUTO-STOP LOGIC START ---
    if (status === 'Running') {
      const currentPlayerCount = player_count !== undefined ? Number(player_count) : 0;

      if (currentPlayerCount > 0) {
        // Players are online, clear the empty timer
        updates.last_empty_at = null;
      } else {
        // No players online
        if (!server.last_empty_at) {
          // It was not empty before, start the timer now
          updates.last_empty_at = now.toISOString();
        } 
      }
    } else {
      // If not running, clear the timer
      updates.last_empty_at = null;
    }
    // --- AUTO-STOP LOGIC END ---

    // Optional metrics
    if (cpu !== undefined && cpu !== null) updates.cpu = Number(cpu.toFixed(1));
    if (memory !== undefined && memory !== null) updates.memory = Number(memory.toFixed(1));
    if (disk !== undefined && disk !== null) updates.disk = Number(disk);
    if (max_players !== undefined && max_players !== null) updates.max_players = Number(max_players);
    if (motd !== undefined) updates.motd = motd || '';
    if (map !== undefined) updates.map = map || '';
    if (tps !== undefined && tps !== null) updates.tps = Number(tps);
    if (tps_1m !== undefined && tps_1m !== null) updates.tps_1m = Number(tps_1m);
    if (tps_5m !== undefined && tps_5m !== null) updates.tps_5m = Number(tps_5m);
    if (tps_15m !== undefined && tps_15m !== null) updates.tps_15m = Number(tps_15m);

    // Runtime tracking logic
    if (status === 'Running') {
      if (!server.running_since) {
        updates.running_since = now.toISOString();
        if (!server.last_billed_at) {
          updates.last_billed_at = now.toISOString();
        }
        if (server.runtime_accumulated_seconds == null) {
          updates.runtime_accumulated_seconds = 0;
        }
      }
    } else {
      if (server.running_since) {
        try {
          const runningSince = new Date(server.running_since);
          const deltaSeconds = Math.max(0, Math.floor((now - runningSince) / 1000));
          updates.runtime_accumulated_seconds =
            (server.runtime_accumulated_seconds || 0) + deltaSeconds;
        } catch (e) {
          console.error('Failed to parse running_since:', e.message);
        }
        updates.running_since = null;
      }
    }

    // Perform update
    const { data, error: updateErr } = await supabaseAdmin
      .from('servers')
      .update(updates)
      .eq('id', serverId)
      .select()
      .single();

    if (updateErr) {
      return res.status(500).json({ error: 'Failed to update server', details: updateErr.message });
    }

    return res.status(200).json({ success: true, server: data });
  } catch (error) {
    console.error('Unexpected error in update-status API:', error);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
}