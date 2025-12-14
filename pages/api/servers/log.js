// pages/api/servers/log.js
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Admin client to write to the database
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { serverId, console_log } = req.body;
  const authHeader = req.headers.authorization;

  if (!serverId || !console_log) {
    return res.status(400).json({ error: 'Missing serverId or console_log' });
  }

  try {
    // 1. Authenticate the VPS
    // We check if the provided token matches the RCON password stored in the DB.
    const { data: server, error: dbErr } = await supabaseAdmin
      .from('servers')
      .select('rcon_password')
      .eq('id', serverId)
      .single();

    if (dbErr || !server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    if (!authHeader || authHeader !== `Bearer ${server.rcon_password}`) {
      console.warn(`[Log Ingest] Unauthorized attempt for server ${serverId}`);
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // 2. Persist the log securely
    // Using upsert to update the single row for this server's console
    const { error: upsertErr } = await supabaseAdmin
      .from('server_console')
      .upsert({ 
        server_id: serverId, 
        console_log: console_log, 
        updated_at: new Date().toISOString() 
      }, { onConflict: 'server_id' });

    if (upsertErr) {
      console.error('[Log Ingest] DB Error:', upsertErr.message);
      return res.status(500).json({ error: 'Database error' });
    }

    return res.status(200).json({ success: true });

  } catch (err) {
    console.error('[Log Ingest] Unexpected error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
}