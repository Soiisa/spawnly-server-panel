// pages/api/servers/[serverId]/backup-action.js
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { serverId } = req.query;
  const { action, s3Key } = req.body;

  // Authentication
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });
  const token = authHeader.split(' ')[1];
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

  if (authError || !user) return res.status(401).json({ error: 'Unauthorized' });

  // Get Server Info
  const { data: server } = await supabaseAdmin
    .from('servers')
    .select('subdomain, rcon_password, user_id, status')
    .eq('id', serverId)
    .single();

  if (!server) return res.status(404).json({ error: 'Server not found' });
  if (server.user_id !== user.id) return res.status(403).json({ error: 'Forbidden' });

  // --- LOGIC SPLIT ---

  if (action === 'restore') {
    // RESTORE: Must be done when STOPPED (Ephemeral architecture)
    if (server.status === 'Running' || server.status === 'Starting') {
      return res.status(409).json({ 
        error: 'Server must be STOPPED to restore a backup.' 
      });
    }

    // Queue the restore in the DB
    const { error: updateError } = await supabaseAdmin
      .from('servers')
      .update({ pending_backup_restore: s3Key })
      .eq('id', serverId);

    if (updateError) {
      console.error('Failed to queue restore:', updateError);
      return res.status(500).json({ error: 'Database error queuing restore' });
    }

    return res.status(200).json({ 
      success: true, 
      message: 'Restore queued. The backup will be applied when you next START the server.' 
    });
  } 
  
  else if (action === 'create') {
    // CREATE: Must be done when RUNNING (Needs VPS to zip files)
    if (server.status !== 'Running') {
      return res.status(409).json({ 
        error: 'Server must be RUNNING to create a backup.' 
      });
    }

    const fileApiUrl = `http://${server.subdomain}.spawnly.net:3005/api/backups`;

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
      console.error('Backup creation error:', err.message);
      res.status(502).json({ error: 'Failed to communicate with server agent', details: err.message });
    }
  } else {
    return res.status(400).json({ error: 'Invalid action' });
  }
}