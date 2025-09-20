import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    console.error('Method not allowed:', req.method);
    return res.status(405).json({ error: 'Method not allowed', detail: `Expected GET, got ${req.method}` });
  }

  const { serverId } = req.query;
  if (!serverId) {
    console.error('Missing serverId in query');
    return res.status(400).json({ error: 'Missing serverId', detail: 'Query must include serverId' });
  }

  // Extract JWT token from Authorization header
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.error('Missing or invalid Authorization header');
    return res.status(401).json({ error: 'Unauthorized', detail: 'Missing or invalid Authorization header' });
  }
  const token = authHeader.split(' ')[1];

  // Validate token and get user
  try {
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !user) {
      console.error('Failed to authenticate user:', error?.message);
      return res.status(401).json({ error: 'Unauthorized', detail: error?.message || 'Invalid token' });
    }
    const userId = user.id;

    // Fetch server with matching serverId and userId
    const { data: server, error: serverError } = await supabaseAdmin
      .from('servers')
      .select('rcon_password')
      .eq('id', serverId)
      .eq('user_id', userId)
      .single();

    if (serverError || !server) {
      console.error('Server not found or unauthorized:', serverError?.message);
      return res.status(404).json({
        error: 'Server not found or unauthorized',
        detail: serverError?.message || 'No server found with the provided ID for this user',
      });
    }

    console.log('Successfully retrieved RCON token for serverId:', serverId);
    return res.status(200).json({ token: server.rcon_password });
  } catch (err) {
    console.error('get-token handler error:', err.message, err.stack);
    return res.status(500).json({
      error: 'Internal server error',
      detail: err.message || 'Failed to process request',
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    });
  }
}