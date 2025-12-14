import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { serverId } = req.query;
  const { action, s3Key } = req.body; // action: 'create' | 'restore'

  // Authentication
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });
  const token = authHeader.split(' ')[1];
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

  if (authError || !user) return res.status(401).json({ error: 'Unauthorized' });

  // Get Server Info for Connection
  const { data: server } = await supabaseAdmin
    .from('servers')
    .select('subdomain, rcon_password, user_id, status')
    .eq('id', serverId)
    .single();

  if (!server) return res.status(404).json({ error: 'Server not found' });
  if (server.user_id !== user.id) return res.status(403).json({ error: 'Forbidden' });

  if (server.status === 'Stopped' && action === 'create') {
      // If server is strictly stopped, the File API (VPS) might be offline if you spin down VPS on stop.
      // If you keep VPS running but Minecraft stopped, this is fine. 
      // Assuming VPS is running for now.
  }

  const endpoint = action === 'restore' ? '/api/backups/restore' : '/api/backups';
  const fileApiUrl = `http://${server.subdomain}.spawnly.net:3005${endpoint}`;

  try {
    const vpsRes = await fetch(fileApiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${server.rcon_password}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ s3Key })
    });

    if (!vpsRes.ok) {
        const text = await vpsRes.text();
        throw new Error(text || vpsRes.statusText);
    }
    
    const data = await vpsRes.json();
    res.status(200).json(data);
  } catch (err) {
    console.error('Backup action error:', err.message);
    res.status(502).json({ error: 'Failed to communicate with server agent', details: err.message });
  }
}