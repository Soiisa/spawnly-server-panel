// pages/api/servers/[serverId]/audit-logs.js
import { createClient } from '@supabase/supabase-js';
import { verifyServerAccess } from '../../../../lib/accessControl';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req, res) {
  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { serverId } = req.query;

  // Authenticate User
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Missing auth' });
  const token = authHeader.split(' ')[1];
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

  if (authError || !user) return res.status(401).json({ error: 'Invalid token' });

  // Check Permissions (Owner or Admin required to view logs)
  const access = await verifyServerAccess(supabaseAdmin, serverId, user.id);
  // Allow owner or anyone with 'settings' permission to view/create logs
  if (!access.isOwner && !access.permissions?.settings) {
      return res.status(403).json({ error: 'Unauthorized to view audit logs' });
  }

  // GET: Fetch Logs
  if (req.method === 'GET') {
    // 1. Fetch raw logs without the join
    const { data: logs, error } = await supabaseAdmin
      .from('server_audit_logs')
      .select('*')
      .eq('server_id', serverId)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
        console.error('Error fetching audit logs:', error);
        return res.status(500).json({ error: error.message });
    }

    // 2. Extract unique User IDs to minimize API calls
    const userIds = [...new Set(logs.map(l => l.user_id).filter(Boolean))];
    const userMap = {};

    // 3. Fetch emails for each unique user
    await Promise.all(userIds.map(async (uid) => {
         const { data: u } = await supabaseAdmin.auth.admin.getUserById(uid);
         userMap[uid] = u?.user?.email || 'Unknown';
    }));

    // 4. Attach email to logs (mocking the join structure for frontend)
    const enrichedLogs = logs.map(log => ({
        ...log,
        users: { email: userMap[log.user_id] || 'Unknown' }
    }));

    return res.json({ logs: enrichedLogs });
  }

  // POST: Create Log (For client-side actions like Software Change)
  if (req.method === 'POST') {
    const { action_type, details } = req.body;
    
    if (!action_type) return res.status(400).json({ error: 'Missing action_type' });

    const { error } = await supabaseAdmin
      .from('server_audit_logs')
      .insert({
        server_id: serverId,
        user_id: user.id,
        action_type,
        details: typeof details === 'object' ? JSON.stringify(details) : details,
        created_at: new Date().toISOString()
      });

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}