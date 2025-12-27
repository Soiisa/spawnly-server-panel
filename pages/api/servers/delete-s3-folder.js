// pages/api/servers/delete-s3-folder.js
import { createClient } from '@supabase/supabase-js';
import { S3Client, DeleteObjectsCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const S3_ENDPOINT = process.env.S3_ENDPOINT;
const S3_BUCKET = process.env.S3_BUCKET;
const S3_REGION = process.env.S3_REGION;
const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID;
const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY;

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const s3Client = new S3Client({
  endpoint: S3_ENDPOINT,
  region: S3_REGION,
  credentials: {
    accessKeyId: AWS_ACCESS_KEY_ID,
    secretAccessKey: AWS_SECRET_ACCESS_KEY,
  },
  forcePathStyle: true,
});

const deleteS3ServerFolder = async (serverId) => {
  console.log(`[deleteS3ServerFolder] Deleting S3 folder for server: ${serverId}`);
  try {
    const listCommand = new ListObjectsV2Command({
      Bucket: S3_BUCKET,
      Prefix: `servers/${serverId}/`,
    });
    const listResponse = await s3Client.send(listCommand);

    if (listResponse.Contents?.length > 0) {
      const deleteCommand = new DeleteObjectsCommand({
        Bucket: S3_BUCKET,
        Delete: {
          Objects: listResponse.Contents.map((obj) => ({ Key: obj.Key })),
          Quiet: true,
        },
      });
      await s3Client.send(deleteCommand);
      console.log(`[deleteS3ServerFolder] Successfully deleted ${listResponse.Contents.length} objects from S3 for server: ${serverId}`);
    } else {
      console.log(`[deleteS3ServerFolder] No objects found in S3 for server: ${serverId}`);
    }
    return true;
  } catch (err) {
    console.error(`[deleteS3ServerFolder] Failed to delete S3 folder servers/${serverId}:`, err);
    throw new Error(`S3 folder deletion failed: ${err.message}`);
  }
};

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  try {
    console.log('[API:delete-s3-folder] Received request:', { method: req.method, body: req.body });
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

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

    const { serverId } = req.body || {};
    if (!serverId) {
      console.error('[API:delete-s3-folder] Missing serverId in request body');
      return res.status(400).json({ error: 'Missing serverId' });
    }

    // --- 2. Authorization (Ownership Check) ---
    const { data: server, error: serverErr } = await supabaseAdmin
      .from('servers')
      .select('user_id')
      .eq('id', serverId)
      .single();

    if (serverErr || !server) {
      return res.status(404).json({ error: 'Server not found' });
    }
    
    if (server.user_id !== user.id) {
      return res.status(403).json({ error: 'Forbidden', detail: 'You do not own this server' });
    }

    // --- 3. Delete Files from S3 ---
    await deleteS3ServerFolder(serverId);
    
    // --- 4. NEW: Clear Console Logs Immediately ---
    // This ensures consistency: if files are wiped, logs from the old server are also wiped.
    try {
        await supabaseAdmin.from('server_console').delete().eq('server_id', serverId);
        console.log(`[API:delete-s3-folder] Successfully deleted console logs for server ${serverId}`);
    } catch (consoleErr) {
        console.warn(`[API:delete-s3-folder] Warning: Failed to clear console logs: ${consoleErr.message}`);
        // Non-fatal, proceed
    }

    console.log(`[API:delete-s3-folder] Full wipe completed successfully for server ${serverId}`);
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[API:delete-s3-folder] Unhandled error:', err.message, err.stack);
    return res.status(500).json({ error: 'Internal server error', detail: String(err) });
  }
}