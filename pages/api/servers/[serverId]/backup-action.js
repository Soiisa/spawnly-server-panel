// pages/api/servers/[serverId]/backup-action.js
import { createClient } from '@supabase/supabase-js';
import { S3Client, ListObjectsV2Command, GetObjectCommand, DeleteObjectsCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import archiver from 'archiver';
import { PassThrough } from 'stream';

const s3Client = new S3Client({
  endpoint: process.env.S3_ENDPOINT,
  region: process.env.S3_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
  forcePathStyle: true,
});

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// --- HELPER: Enforce Hard Cap of 10 Backups ---
const enforceRetention = async (serverId) => {
    const MAX_BACKUPS = 10;
    try {
        const command = new ListObjectsV2Command({
            Bucket: process.env.S3_BUCKET,
            Prefix: `backups/${serverId}/`,
        });
        const response = await s3Client.send(command);
        const backups = (response.Contents || [])
            .sort((a, b) => new Date(b.LastModified) - new Date(a.LastModified)); // Newest first

        if (backups.length > MAX_BACKUPS) {
            const toDelete = backups.slice(MAX_BACKUPS).map(b => ({ Key: b.Key }));
            console.log(`[Backup] Enforcing retention. Deleting ${toDelete.length} old backups for ${serverId}`);
            
            await s3Client.send(new DeleteObjectsCommand({
                Bucket: process.env.S3_BUCKET,
                Delete: { Objects: toDelete }
            }));
        }
    } catch (e) {
        console.error("Failed to enforce backup retention:", e);
        // Don't fail the main request just because cleanup failed
    }
};

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

  // --- LOGIC ---

  if (action === 'restore') {
    if (server.status === 'Running' || server.status === 'Starting') {
      return res.status(409).json({ error: 'Server must be STOPPED to restore a backup.' });
    }

    const { error: updateError } = await supabaseAdmin
      .from('servers')
      .update({ pending_backup_restore: s3Key })
      .eq('id', serverId);

    if (updateError) return res.status(500).json({ error: 'Database error queuing restore' });

    return res.status(200).json({ 
      success: true, 
      message: 'Restore queued. The backup will be applied when you next START the server.' 
    });
  } 
  
  else if (action === 'create') {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `manual-backup-${timestamp}.zip`;
    const targetKey = `backups/${serverId}/${filename}`;

    // CASE A: Server is Running -> Use VPS Agent
    if (server.status === 'Running') {
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

            if (!vpsRes.ok) throw new Error((await vpsRes.text()) || vpsRes.statusText);
            const data = await vpsRes.json();
            
            // Update last_backup_at & Enforce Retention
            await supabaseAdmin.from('servers').update({ last_backup_at: new Date().toISOString() }).eq('id', serverId);
            await enforceRetention(serverId);
            
            return res.status(200).json(data);
        } catch (err) {
            console.error('VPS Backup error:', err.message);
            return res.status(502).json({ error: 'Failed to create backup on server', details: err.message });
        }
    } 
    
    // CASE B: Server is Stopped -> Zip S3 files directly
    else if (server.status === 'Stopped') {
        try {
            console.log(`[Backup] Server stopped. Zipping S3 files for ${serverId}...`);
            const Bucket = process.env.S3_BUCKET;
            const prefix = `servers/${serverId}/`;

            // 1. List files
            const listCommand = new ListObjectsV2Command({ Bucket, Prefix: prefix });
            const listRes = await s3Client.send(listCommand);
            const files = listRes.Contents || [];

            if (files.length === 0) return res.status(404).json({ error: 'No files found to backup' });

            // 2. Setup Stream Archiver
            const archive = archiver('zip', { zlib: { level: 9 } });
            const passThrough = new PassThrough();
            
            // 3. Setup Upload Stream
            const upload = new Upload({
                client: s3Client,
                params: {
                    Bucket,
                    Key: targetKey,
                    Body: passThrough,
                    ContentType: 'application/zip'
                },
            });

            // 4. Pipe Archive -> Upload
            archive.pipe(passThrough);

            // 5. Append files from S3 to Archive
            for (const file of files) {
                // Skip existing backups/ or node_modules
                if (file.Key.includes('node_modules') || file.Key.includes('/backups/')) continue;

                const fileStream = await s3Client.send(new GetObjectCommand({ Bucket, Key: file.Key }));
                // Rel path inside zip
                const name = file.Key.replace(prefix, ''); 
                archive.append(fileStream.Body, { name });
            }

            // 6. Finalize
            await archive.finalize();
            await upload.done();

            // Update last_backup_at & Enforce Retention
            await supabaseAdmin.from('servers').update({ last_backup_at: new Date().toISOString() }).eq('id', serverId);
            await enforceRetention(serverId);

            return res.status(200).json({ success: true, filename, s3Path: `s3://${Bucket}/${targetKey}` });
        } catch (err) {
            console.error('S3 Backup error:', err);
            return res.status(500).json({ error: 'Failed to zip S3 files', details: err.message });
        }
    } else {
        return res.status(409).json({ error: 'Server is in a transitional state. Please wait.' });
    }
  } else {
    return res.status(400).json({ error: 'Invalid action' });
  }
}