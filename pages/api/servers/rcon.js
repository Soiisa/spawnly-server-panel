// pages/api/servers/rcon.js
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { serverId, command } = req.body || {};
  if (!serverId || !command) return res.status(400).json({ error: 'Missing serverId or command' });

  try {
    // 1. Get Server Details
    const { data: server, error } = await supabaseAdmin
      .from('servers')
      .select('subdomain, rcon_password')
      .eq('id', serverId)
      .single();

    if (error || !server) return res.status(404).json({ error: 'Server not found' });
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

    return res.status(200).json({ response: 'Command sent' });

  } catch (err) {
    console.error('Command API Error:', err);
    return res.status(500).json({ error: 'Failed to communicate with server wrapper', detail: err.message });
  }
}