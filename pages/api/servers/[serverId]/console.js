// pages/api/servers/[serverId]/console.js
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req, res) {
  const { serverId } = req.query;
  const { since } = req.query;

  // --- SECURITY FIX: Authentication ---
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const token = authHeader.split(' ')[1];
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

  if (authError || !user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Get server info
  const { data: server, error } = await supabaseAdmin
    .from('servers')
    .select('ipv4, rcon_password, status, user_id, subdomain')
    .eq('id', serverId)
    .single();

  if (error || !server) {
    return res.status(404).json({ error: 'Server not found' });
  }

  // Check Ownership
  if (server.user_id !== user.id) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  if (server.status !== 'Running') {
    return res.status(400).json({ error: 'Server is not running' });
  }

  try {
    // Fetch logs from game server via the file API console endpoint (port 3005)
    // or the wrapper (port 3006). Based on previous files, 3005 (file-api) is used.
    
    // We use the subdomain for consistent routing through the proxy system if needed
    // or fall back to IPv4 if subdomain DNS hasn't propagated.
    const host = server.subdomain ? `${server.subdomain}.spawnly.net` : server.ipv4;
    
    const response = await fetch(`http://${host}:3005/api/console?since=${since || ''}`, {
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