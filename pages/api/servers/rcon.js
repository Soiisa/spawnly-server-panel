// pages/api/servers/rcon.js
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

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

  const { serverId, command } = req.body || {};
  if (!serverId || !command) return res.status(400).json({ error: 'Missing serverId or command' });

  try {
    // 1. Get Server Details & Check Ownership
    const { data: server, error } = await supabaseAdmin
      .from('servers')
      .select('subdomain, rcon_password, user_id')
      .eq('id', serverId)
      .single();

    if (error || !server) return res.status(404).json({ error: 'Server not found' });
    
    // Authorization Check
    if (server.user_id !== user.id) {
        return res.status(403).json({ error: 'Forbidden: You do not own this server' });
    }

    if (!server.subdomain) return res.status(400).json({ error: 'Server has no subdomain' });

    // 2. Send Command to Wrapper API (Port 3006)
    // Note: We use HTTP, not HTTPS, because we haven't set up SSL for this custom port
    const wrapperUrl = `http://${server.subdomain}.spawnly.net:3006/api/command`;
    
    const wrapperRes = await fetch(wrapperUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${server.rcon_password}` // Wrapper expects this token
      },
      body: JSON.stringify({ command })
    });

    const data = await wrapperRes.json();

    if (!wrapperRes.ok) {
      return res.status(wrapperRes.status).json({ error: data.error || 'Wrapper rejected command' });
    }

    // [AUDIT LOG START]
    try {
        await supabaseAdmin.from('server_audit_logs').insert({
            server_id: serverId,
            user_id: user.id,
            action_type: 'rcon_command',
            details: `Executed: ${command}`,
            created_at: new Date().toISOString()
        });
    } catch (logErr) {
        console.error("Failed to log RCON command:", logErr);
    }
    // [AUDIT LOG END]

    return res.status(200).json({ response: 'Command sent' });

  } catch (err) {
    console.error('Command API Error:', err);
    return res.status(500).json({ error: 'Failed to communicate with server wrapper', detail: err.message });
  }
}