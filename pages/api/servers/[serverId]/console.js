// pages/api/servers/[serverId]/console.js
import { createClient } from '@supabase/supabase-js';
import { verifyServerAccess } from '../../../../lib/accessControl';

const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req, res) {
  const { serverId, since } = req.query;

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const token = authHeader.split(' ')[1];
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

  if (authError || !user) return res.status(401).json({ error: 'Unauthorized' });

  // --- NEW ACCESS CHECK (Requires 'console' permission) ---
  const access = await verifyServerAccess(supabaseAdmin, serverId, user.id, 'console');
  
  if (!access.allowed) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  
  // Use the server object returned by verification (it includes basic info)
  // We need to fetch full details like rcon/subdomain if verifyServerAccess didn't return them
  // verifyServerAccess returns { server: { user_id, name } } usually.
  // So we re-fetch to be safe or optimize verifyServerAccess later. 
  // For now, let's fetch what we need securely.
  
  const { data: server } = await supabaseAdmin
    .from('servers')
    .select('ipv4, rcon_password, status, subdomain')
    .eq('id', serverId)
    .single();

  if (server.status !== 'Running') {
    return res.status(400).json({ error: 'Server is not running' });
  }

  try {
    const host = server.subdomain ? `${server.subdomain}.spawnly.net` : server.ipv4;
    
    // Using File API port (3005) as per previous context, or wrapper if configured
    const response = await fetch(`http://${host}:3005/api/console?since=${since || ''}`, {
      headers: {
        'Authorization': `Bearer ${server.rcon_password}`
      },
      timeout: 5000
    });

    if (!response.ok) throw new Error(`Failed to fetch console: ${response.statusText}`);

    const logs = await response.text();
    res.setHeader('Content-Type', 'text/plain');
    res.status(200).send(logs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}