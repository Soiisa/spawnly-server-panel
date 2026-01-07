// pages/api/servers/[serverId]/users.js
import { createClient } from '@supabase/supabase-js';
import { verifyServerAccess } from '../../../../lib/accessControl';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req, res) {
  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { serverId } = req.query;

  // Auth Check
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Missing auth' });
  const { data: { user } } = await supabaseAdmin.auth.getUser(authHeader.split(' ')[1]);
  if (!user) return res.status(401).json({ error: 'Invalid token' });

  // Only OWNER can manage users
  const access = await verifyServerAccess(supabaseAdmin, serverId, user.id);
  if (!access.isOwner) return res.status(403).json({ error: 'Only the owner can manage users' });

  // GET: List users
  if (req.method === 'GET') {
    const { data: permissions } = await supabaseAdmin
      .from('server_permissions')
      .select('id, permissions, user_id')
      .eq('server_id', serverId);

    // Fetch emails manually (since we can't join on auth.users directly easily in client)
    const enriched = await Promise.all(permissions.map(async (p) => {
      const { data: u } = await supabaseAdmin.auth.admin.getUserById(p.user_id);
      return { ...p, email: u?.user?.email || 'Unknown' };
    }));

    return res.json({ users: enriched });
  }

  // POST: Add User
  if (req.method === 'POST') {
    const { email, permissions } = req.body;
    // 1. Find user by email
    // Note: listUsers is costly, but typically okay for single lookup. 
    // Ideally, maintain a 'public_profiles' table mapping email->id if possible, 
    // but using admin.listUsers is strictly backend side.
    const { data: { users } } = await supabaseAdmin.auth.admin.listUsers();
    const targetUser = users.find(u => u.email === email);

    if (!targetUser) return res.status(404).json({ error: 'User not found. They must register first.' });
    if (targetUser.id === user.id) return res.status(400).json({ error: 'Cannot invite yourself.' });

    const { error } = await supabaseAdmin
      .from('server_permissions')
      .upsert({ 
        server_id: serverId, 
        user_id: targetUser.id, 
        permissions 
      }, { onConflict: 'server_id, user_id' });

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ success: true });
  }

  // DELETE: Remove User
  if (req.method === 'DELETE') {
    const { permissionId } = req.body;
    const { error } = await supabaseAdmin.from('server_permissions').delete().eq('id', permissionId);
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ success: true });
  }
}