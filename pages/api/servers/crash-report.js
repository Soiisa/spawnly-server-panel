// pages/api/servers/crash-report.js
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req, res) {
  // 1. Method Check
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { serverId, analysis, log } = req.body;
  const authHeader = req.headers.authorization;

  if (!serverId || !analysis) {
    return res.status(400).json({ error: 'Missing required data (serverId or analysis)' });
  }

  try {
    // 2. Authentication: Fetch RCON password to verify the request comes from the server
    const { data: server, error: dbErr } = await supabaseAdmin
      .from('servers')
      .select('rcon_password')
      .eq('id', serverId)
      .single();

    if (dbErr || !server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    if (!authHeader || authHeader !== `Bearer ${server.rcon_password}`) {
      console.warn(`[Crash Report] Unauthorized attempt for server ${serverId}`);
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // 3. Save the Crash Report
    const { error: insertError } = await supabaseAdmin
      .from('server_crashes')
      .insert({
        server_id: serverId,
        status: 'crashed',
        analysis_json: analysis, // The structured JSON from Codex
        raw_log: log || '',      // The log context provided by the wrapper
        created_at: new Date().toISOString()
      });

    if (insertError) {
      console.error('[Crash Report] Failed to insert report:', insertError.message);
      return res.status(500).json({ error: 'Database error' });
    }

    // Optional: You could update the server status here, but the wrapper usually 
    // sends a separate 'Crashed' status update to /log or /update-status.
    
    console.log(`[Crash Report] Saved report for server ${serverId}`);
    return res.status(200).json({ success: true });

  } catch (err) {
    console.error('[Crash Report] Unexpected error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
}