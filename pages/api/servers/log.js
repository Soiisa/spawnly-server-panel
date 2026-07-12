// pages/api/servers/log.js
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const MAX_LOG_SIZE = 50000;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // --- NEW: Destructure the new player variables ---
  const { serverId, console_log, status, cpu, memory, disk, player_count, max_players, players_online } = req.body;
  const authHeader = req.headers.authorization;

  if (!serverId || (console_log === undefined && !status && cpu === undefined && memory === undefined)) {
    return res.status(400).json({ error: 'Missing serverId or data' });
  }

  try {
    const { data: server, error: dbErr } = await supabaseAdmin
      .from('servers')
      .select('rcon_password, running_since, runtime_accumulated_seconds')
      .eq('id', serverId)
      .single();

    if (dbErr || !server) return res.status(404).json({ error: 'Server not found' });
    if (!authHeader || authHeader !== `Bearer ${server.rcon_password}`) return res.status(401).json({ error: 'Unauthorized' });

    const updates = {};
    let shouldUpdateServerTable = false;

    if (status) {
      updates.game_status = status;  
      updates.status = 'Running';    
      shouldUpdateServerTable = true;
      const now = new Date();

      if (status === 'Running' || status === 'Stopped' || status === 'Crashed') {
          updates.started_at = null;
      }

      if (server.running_since && (status === 'Stopped' || status === 'Crashed')) {
        const start = new Date(server.running_since);
        const seconds = Math.max(0, Math.floor((now - start) / 1000));
        updates.runtime_accumulated_seconds = (server.runtime_accumulated_seconds || 0) + seconds;
        updates.running_since = null;
      }
    }

    // --- NEW: Inject player counts into Supabase ---
    if (cpu !== undefined) { updates.cpu = cpu; shouldUpdateServerTable = true; }
    if (memory !== undefined) { updates.memory = memory; shouldUpdateServerTable = true; }
    if (disk !== undefined) { updates.disk = disk; shouldUpdateServerTable = true; }
    if (player_count !== undefined) { updates.player_count = player_count; shouldUpdateServerTable = true; }
    if (max_players !== undefined) { updates.max_players = max_players; shouldUpdateServerTable = true; }
    if (players_online !== undefined) { updates.players_online = players_online; shouldUpdateServerTable = true; }

    if (shouldUpdateServerTable) {
      updates.last_heartbeat_at = new Date().toISOString();
      await supabaseAdmin.from('servers').update(updates).eq('id', serverId);
    }

    if (console_log && console_log.trim().length > 0) {
      const { data: currentData } = await supabaseAdmin.from('server_console').select('console_log').eq('server_id', serverId).single();
      let existingLog = currentData?.console_log || '';
      const separator = existingLog.endsWith('\n') || existingLog === '' ? '' : '\n';
      let newFullLog = existingLog + separator + console_log;

      if (newFullLog.length > MAX_LOG_SIZE) {
        newFullLog = newFullLog.substring(newFullLog.length - MAX_LOG_SIZE);
        const firstNewline = newFullLog.indexOf('\n');
        if (firstNewline !== -1 && firstNewline < 100) newFullLog = newFullLog.substring(firstNewline + 1);
      }

      await supabaseAdmin.from('server_console').upsert({ 
          server_id: serverId, console_log: newFullLog, updated_at: new Date().toISOString() 
      }, { onConflict: 'server_id' });
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: 'Internal server error' });
  }
}