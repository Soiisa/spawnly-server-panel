// pages/api/servers/log.js
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Max log size in characters (approx 50KB) to prevent DB bloat
const MAX_LOG_SIZE = 50000;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // 1. Destructure status (The Fix)
  const { serverId, console_log, status } = req.body;
  const authHeader = req.headers.authorization;

  // Allow empty log if status is provided (e.g. crash with no new logs)
  if (!serverId || (console_log === undefined && !status)) {
    return res.status(400).json({ error: 'Missing serverId or data' });
  }

  try {
    // 2. Authenticate & Fetch Stats (Added stats fields for billing logic)
    const { data: server, error: dbErr } = await supabaseAdmin
      .from('servers')
      .select('rcon_password, running_since, runtime_accumulated_seconds')
      .eq('id', serverId)
      .single();

    if (dbErr || !server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    if (!authHeader || authHeader !== `Bearer ${server.rcon_password}`) {
      console.warn(`[Log Ingest] Unauthorized attempt for server ${serverId}`);
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // 3. Handle Status Update (The Fix)
    if (status) {
      const now = new Date();
      const updates = { status };

      // --- CLEAN UP STARTED_AT IF RUNNING, STOPPED, OR CRASHED ---
      if (status === 'Running' || status === 'Stopped' || status === 'Crashed') {
          updates.started_at = null;
      }

      // Stop the billing clock if it was running
      if (server.running_since) {
        const start = new Date(server.running_since);
        const seconds = Math.max(0, Math.floor((now - start) / 1000));
        updates.runtime_accumulated_seconds = (server.runtime_accumulated_seconds || 0) + seconds;
        updates.running_since = null;
      }

      await supabaseAdmin.from('servers').update(updates).eq('id', serverId);
      console.log(`[Log Ingest] Status updated to '${status}' for server ${serverId}`);
    }

    // 4. Process Logs (Only if content exists)
    if (console_log) {
      // Fetch Existing Log
      const { data: currentData } = await supabaseAdmin
        .from('server_console')
        .select('console_log')
        .eq('server_id', serverId)
        .single();

      let existingLog = currentData?.console_log || '';

      // Append & Trim
      const separator = existingLog.endsWith('\n') ? '' : '\n';
      let newFullLog = existingLog + separator + console_log;

      if (newFullLog.length > MAX_LOG_SIZE) {
        newFullLog = newFullLog.substring(newFullLog.length - MAX_LOG_SIZE);
        // Clean up partial line at the start if cut
        const firstNewline = newFullLog.indexOf('\n');
        if (firstNewline !== -1 && firstNewline < 100) {
          newFullLog = newFullLog.substring(firstNewline + 1);
        }
      }

      // Update DB
      const { error: upsertErr } = await supabaseAdmin
        .from('server_console')
        .upsert({ 
          server_id: serverId, 
          console_log: newFullLog, 
          updated_at: new Date().toISOString() 
        }, { onConflict: 'server_id' });

      if (upsertErr) {
        console.error('[Log Ingest] DB Error:', upsertErr.message);
        return res.status(500).json({ error: 'Database error' });
      }
    }

    return res.status(200).json({ success: true });

  } catch (err) {
    console.error('[Log Ingest] Unexpected error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
}