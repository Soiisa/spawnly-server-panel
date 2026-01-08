// pages/api/servers/get-token.js
import { createClient } from '@supabase/supabase-js';
import { verifyServerAccess } from '../../../lib/accessControl'; // Adjust path if needed

const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { serverId } = req.query;
  if (!serverId) return res.status(400).json({ error: 'Missing serverId' });

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const token = authHeader.split(' ')[1];

  try {
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !user) return res.status(401).json({ error: 'Unauthorized' });

    // 1. Fetch Server & RCON (No ownership check yet)
    const { data: server, error: serverError } = await supabaseAdmin
      .from('servers')
      .select('id, user_id, rcon_password')
      .eq('id', serverId)
      .single();

    if (serverError || !server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    // 2. Check Permissions manually (Complex OR logic)
    let isAllowed = false;

    // A. Owner
    if (server.user_id === user.id) {
      isAllowed = true;
    } 
    // B. Shared User - Check DB directly for specific rights
    else {
      const { data: perm } = await supabaseAdmin
        .from('server_permissions')
        .select('permissions')
        .eq('server_id', serverId)
        .eq('user_id', user.id)
        .single();

      if (perm) {
        // Allow if user has ANY of the permissions that require this token
        if (perm.permissions.files || perm.permissions.world || perm.permissions.players || perm.permissions.backups) {
          isAllowed = true;
        }
      }
    }

    if (!isAllowed) {
      return res.status(403).json({ error: 'Forbidden', detail: 'Insufficient permissions' });
    }

    return res.status(200).json({ token: server.rcon_password });

  } catch (err) {
    console.error('get-token handler error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}