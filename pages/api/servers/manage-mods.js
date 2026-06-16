// pages/api/servers/manage-mods.js
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req, res) {
  // Extract serverId based on request method (GET uses query, POST uses body)
  const serverId = req.method === 'GET' ? req.query.serverId : req.body.serverId;

  if (!serverId) {
    return res.status(400).json({ error: 'Missing serverId parameter' });
  }

  // --- 1. Authentication ---
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized', detail: 'Missing Authorization header' });
  }
  
  const token = authHeader.split(' ')[1];
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

  if (authError || !user) {
    return res.status(401).json({ error: 'Unauthorized', detail: 'Invalid token' });
  }

  // --- 2. Authorization (Ownership Check) ---
  const { data: server, error: serverError } = await supabaseAdmin
    .from('servers')
    .select('*')
    .eq('id', serverId)
    .single();

  if (serverError || !server) {
    return res.status(404).json({ error: 'Server not found' });
  }

  if (server.user_id !== user.id) {
    return res.status(403).json({ error: 'Forbidden', detail: 'You do not own this server' });
  }

  if (!server.ipv4) {
    return res.status(400).json({ error: 'Server lacks an assigned public IPv4 address.' });
  }

  const daemonBaseUrl = `http://${server.ipv4}:3005`;

  try {
    // ========================================================================
    // ROUTE: GET (List Installed Mods)
    // ========================================================================
    if (req.method === 'GET') {
      const targetRes = await fetch(`${daemonBaseUrl}/api/installed-ficsit`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${server.rcon_password}` }
      });

      if (!targetRes.ok) throw new Error(`Daemon returned ${targetRes.status}`);
      const data = await targetRes.json();
      
      return res.status(200).json(data);
    }

    // ========================================================================
    // ROUTE: POST (Uninstall Mod)
    // ========================================================================
    if (req.method === 'POST') {
      const { modSlug } = req.body;
      
      if (!modSlug) {
          return res.status(400).json({ error: 'Missing modSlug parameter for uninstallation.' });
      }

      const targetRes = await fetch(`${daemonBaseUrl}/api/uninstall-ficsit`, {
        method: 'POST',
        headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${server.rcon_password}` 
        },
        body: JSON.stringify({ modSlug })
      });

      if (!targetRes.ok) {
          const errData = await targetRes.json().catch(() => ({}));
          throw new Error(errData.error || `Daemon returned ${targetRes.status}`);
      }

      const data = await targetRes.json();
      
      // Log the uninstallation
      await supabaseAdmin.from('server_audit_logs').insert({
          server_id: serverId,
          user_id: user.id,
          action_type: 'uninstall_mod',
          details: JSON.stringify({ game: server.game, modSlug }),
          created_at: new Date().toISOString()
      });

      return res.status(200).json(data);
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (err) {
    console.error(`[Manage-Mods] Daemon communication failure:`, err.message);
    return res.status(502).json({ error: 'Failed to communicate with VPS Daemon', detail: err.message });
  }
}