// lib/accessControl.js
export async function verifyServerAccess(supabase, serverId, userId, requiredPermission = null) {
  // 1. Fetch Server to check Ownership
  const { data: server, error } = await supabase
    .from('servers')
    .select('user_id, name')
    .eq('id', serverId)
    .single();

  if (error || !server) return { allowed: false, error: 'Server not found' };

  // 2. Is Owner?
  if (server.user_id === userId) {
    return { allowed: true, isOwner: true, server };
  }

  // 3. Is Sub-User? Check Permissions table
  const { data: perm } = await supabase
    .from('server_permissions')
    .select('permissions')
    .eq('server_id', serverId)
    .eq('user_id', userId)
    .single();

  if (!perm) return { allowed: false, error: 'Access denied' };

  // 4. Check Specific Permission (if requested)
  if (requiredPermission) {
    // e.g. requiredPermission = 'control' (for start/stop)
    if (perm.permissions?.[requiredPermission] === true) {
      return { allowed: true, isOwner: false, server };
    }
    return { allowed: false, error: `Missing permission: ${requiredPermission}` };
  }

  // If no specific permission required (just "can access dashboard"), allow
  return { allowed: true, isOwner: false, server };
}