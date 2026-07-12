// pages/api/servers/install-oxide.js
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  
  const token = authHeader.split(' ')[1];
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !user) return res.status(401).json({ error: 'Unauthorized' });

  const { serverId } = req.body;
  if (!serverId) return res.status(400).json({ error: 'Missing serverId' });

  const { data: server, error: serverError } = await supabaseAdmin.from('servers').select('*').eq('id', serverId).single();
  if (serverError || !server) return res.status(404).json({ error: 'Server not found' });

  // Ownership Check
  if (server.user_id !== user.id) return res.status(403).json({ error: 'Forbidden' });

  if (server.game !== 'rust') return res.status(400).json({ error: 'Oxide is only applicable to Rust servers.' });
  if (!server.ipv4) return res.status(400).json({ error: 'Server is currently offline.' });
  
  // Safe-guard: Game MUST be stopped to replace active DLL files
  if (server.game_status !== 'Stopped') {
      return res.status(400).json({ error: 'The server MUST be stopped before installing or updating Oxide.' });
  }

  try {
    const response = await fetch(`http://${server.ipv4}:3005/api/install-oxide`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${server.rcon_password}` }
    });

    if (!response.ok) {
       const errData = await response.json().catch(() => ({}));
       throw new Error(errData.error || `Daemon failed with status: ${response.status}`);
    }

    await supabaseAdmin.from('server_audit_logs').insert({
        server_id: server.id, user_id: user.id, action_type: 'install_oxide', details: 'Installed/Updated Oxide Framework'
    });

    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to install Oxide', detail: err.message });
  }
}