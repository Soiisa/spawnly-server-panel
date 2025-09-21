// pages/api/servers/[serverId]/console.js
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req, res) {
  const { serverId } = req.query;
  const { since } = req.query;

  // Get server info
  const { data: server, error } = await supabaseAdmin
    .from('servers')
    .select('ipv4, rcon_password, status')
    .eq('id', serverId)
    .single();

  if (error || !server) {
    return res.status(404).json({ error: 'Server not found' });
  }

  if (server.status !== 'Running' || !server.ipv4) {
    return res.status(400).json({ error: 'Server is not running' });
  }

  try {
    // Fetch logs from game server
    const response = await fetch(`http://${server.ipv4}:3005/api/console?since=${since || ''}`, {
      headers: {
        'Authorization': `Bearer ${server.rcon_password}`
      },
      timeout: 5000
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch console: ${response.statusText}`);
    }

    const logs = await response.text();
    res.setHeader('Content-Type', 'text/plain');
    res.status(200).send(logs);
  } catch (error) {
    console.error('Console fetch error:', error);
    res.status(500).json({ error: error.message });
  }
}