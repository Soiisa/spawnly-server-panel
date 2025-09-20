// pages/api/servers/rcon.js
import { createClient } from '@supabase/supabase-js';
import { Rcon } from 'rcon-client';

// Ensure env vars are loaded
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing Supabase env vars');
  throw new Error('Missing Supabase server env vars');
}

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { serverId, command } = req.body || {};
  if (!serverId || !command) {
    return res.status(400).json({ error: 'Missing serverId or command' });
  }

  try {
    // Fetch server info from Supabase
    const { data: server, error } = await supabaseAdmin
      .from('servers')
      .select('id, ipv4, rcon_password, status')
      .eq('id', serverId)
      .single();

    if (error || !server) {
      console.error('Server fetch error', error);
      return res.status(404).json({ error: 'Server not found' });
    }

    const { ipv4: ip, rcon_password: pass } = server;
    const port = 25575;

    if (!ip || !pass) {
      console.error('Missing connection info', { ip, pass });
      return res.status(400).json({ error: 'Missing server connection info' });
    }

    // Connect to RCON
    let rcon;
    try {
      rcon = await Rcon.connect({ host: ip, port, password: pass, timeout: 5000 });
    } catch (connectErr) {
      console.error('RCON connection failed', { ip, port, pass, connectErr });
      return res.status(500).json({ error: 'Failed to connect to RCON', detail: connectErr.message });
    }

    // Send command
    let response;
    try {
      response = await rcon.send(command);
    } catch (sendErr) {
      console.error('RCON command failed', sendErr);
      return res.status(500).json({ error: 'Failed to send RCON command', detail: sendErr.message });
    } finally {
      await rcon.end().catch(() => {}); // Always clean up
    }

    return res.status(200).json({ response });
  } catch (err) {
    console.error('Unexpected API error', err);
    return res.status(500).json({ error: 'Unexpected server error', detail: err.message });
  }
}
