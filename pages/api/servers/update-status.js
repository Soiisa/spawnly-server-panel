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
    console.log('API RECEIVED: Status update payload received from reporter:', JSON.stringify(req.body)); // DEBUG ADDITION
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
      // NEW FIELDS from query protocol:
      max_players,
      motd,
      map,
    } = req.body;

    console.log('Status update received:', {
      serverId,
      status,
      player_count,
      players_online,
      max_players,
      motd,
      map,
    });

    if (!serverId) {
      return res.status(400).json({ error: 'Missing serverId' });
    }

    const now = timestamp ? new Date(timestamp) : new Date();

    // Fetch current server state
    const { data: server, error: fetchErr } = await supabaseAdmin
      .from('servers')
      .select('*')
      .eq('id', serverId)
      .single();

    if (fetchErr || !server) {
      console.error('Server not found:', serverId, fetchErr?.message);
      return res.status(404).json({ error: 'Server not found' });
    }

    // Base updates - ALWAYS set these
    const updates = {
      status: status || 'Unknown',
      last_heartbeat_at: now.toISOString(),
      error_message: reporterError || null,
      // NEW: Always update player fields, default to 0/empty if not provided
      player_count: player_count !== undefined ? Number(player_count) : 0,
      players_online: players_online !== undefined ? (players_online || 'None') : 'None',
    };

    // Optional metrics – only update if provided
    if (cpu !== undefined && cpu !== null) updates.cpu = Number(cpu.toFixed(1));
    if (memory !== undefined && memory !== null) updates.memory = Number(memory.toFixed(1));
    if (disk !== undefined && disk !== null) updates.disk = Number(disk);
    
    // NEW: Add query protocol fields
    if (max_players !== undefined && max_players !== null) updates.max_players = Number(max_players);
    if (motd !== undefined) updates.motd = motd || '';
    if (map !== undefined) updates.map = map || '';
    
    if (tps !== undefined && tps !== null) updates.tps = Number(tps);
    if (tps_1m !== undefined && tps_1m !== null) updates.tps_1m = Number(tps_1m);
    if (tps_5m !== undefined && tps_5m !== null) updates.tps_5m = Number(tps_5m);
    if (tps_15m !== undefined && tps_15m !== null) updates.tps_15m = Number(tps_15m);

    // Runtime tracking logic (same as before)
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
      // Server stopped or errored → accumulate runtime
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
      console.error('Supabase update failed:', updateErr);
      return res.status(500).json({ error: 'Failed to update server', details: updateErr.message });
    }

    console.log(`Server ${serverId} status updated → ${data.status} | ${data.player_count} players | Online: ${data.players_online}`);

    return res.status(200).json({
      success: true,
      server: data,
    });
  } catch (error) {
    console.error('Unexpected error in update-status API:', error);
    return res.status(500).json({
      error: 'Internal server error',
      details: error.message,
    });
  }
}