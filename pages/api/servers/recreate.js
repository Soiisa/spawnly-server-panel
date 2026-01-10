// pages/api/servers/recreate.js
import { createClient } from '@supabase/supabase-js';
import { S3Client, DeleteObjectsCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';

const HETZNER_API_BASE = 'https://api.hetzner.cloud/v1';
const CLOUDFLARE_API_BASE = 'https://api.cloudflare.com/client/v4';
const HETZNER_TOKEN = process.env.HETZNER_TOKEN;
const CLOUDFLARE_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const CLOUDFLARE_ZONE_ID = process.env.CLOUDFLARE_ZONE_ID;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const S3_ENDPOINT = process.env.S3_ENDPOINT;
const S3_BUCKET = process.env.S3_BUCKET;
const S3_REGION = process.env.S3_REGION;
const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID;
const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY;

const s3Client = new S3Client({
  endpoint: S3_ENDPOINT,
  region: S3_REGION,
  credentials: {
    accessKeyId: AWS_ACCESS_KEY_ID,
    secretAccessKey: AWS_SECRET_ACCESS_KEY,
  },
  forcePathStyle: true,
});

const deleteCloudflareRecords = async (subdomain) => {
  const url = `${CLOUDFLARE_API_BASE}/zones/${CLOUDFLARE_ZONE_ID}/dns_records?name=${subdomain}.spawnly.net`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${CLOUDFLARE_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
  });
  if (!response.ok) {
    const errorText = await response.text().catch(() => 'no-body');
    throw new Error(`Cloudflare record lookup failed: ${response.status} ${errorText}`);
  }

  const { result } = await response.json();
  for (const record of result) {
    if (record.type === 'A' || record.type === 'SRV') {
      const deleteUrl = `${CLOUDFLARE_API_BASE}/zones/${CLOUDFLARE_ZONE_ID}/dns_records/${record.id}`;
      const deleteResponse = await fetch(deleteUrl, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${CLOUDFLARE_API_TOKEN}`,
          'Content-Type': 'application/json',
        },
      });
      if (!deleteResponse.ok) {
        console.warn(`Failed to delete ${record.type} record ${record.id}: ${deleteResponse.status}`);
      } else {
        console.log(`Deleted ${record.type} record for ${subdomain}.spawnly.net`);
      }
    }
  }
};

const deleteS3ServerFolder = async (serverId) => {
  try {
    let continuationToken = null;
    let deletedCount = 0;
    const prefix = `servers/${serverId}/`;

    do {
      const listCommand = new ListObjectsV2Command({
        Bucket: S3_BUCKET,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      });
      const listResponse = await s3Client.send(listCommand);
      console.log(`Listing S3 objects for servers/${serverId}, found ${listResponse.Contents?.length || 0} objects`);

      if (listResponse.Contents?.length > 0) {
        const deleteCommand = new DeleteObjectsCommand({
          Bucket: S3_BUCKET,
          Delete: {
            Objects: listResponse.Contents.map((obj) => ({ Key: obj.Key })),
            Quiet: true,
          },
        });
        const deleteResponse = await s3Client.send(deleteCommand);
        deletedCount += listResponse.Contents.length;
        console.log(`Deleted ${listResponse.Contents.length} objects from S3`);
        
        // Check for errors in deletion
        if (deleteResponse.Errors?.length > 0) {
          console.error('S3 deletion errors:', deleteResponse.Errors);
          throw new Error(`Failed to delete some objects: ${JSON.stringify(deleteResponse.Errors)}`);
        }
      }

      continuationToken = listResponse.NextContinuationToken;
    } while (continuationToken);

    console.log(`Successfully deleted ${deletedCount} objects from S3 folder servers/${serverId}`);
    return true;
  } catch (err) {
    console.error(`Failed to delete S3 folder servers/${serverId}:`, err);
    throw new Error(`S3 folder deletion failed: ${err.message}`);
  }
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    console.error('Method not allowed:', req.method);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!HETZNER_TOKEN || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !CLOUDFLARE_API_TOKEN || !CLOUDFLARE_ZONE_ID || !S3_ENDPOINT || !S3_BUCKET || !S3_REGION || !AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) {
    console.error('Missing environment variables');
    return res.status(500).json({ error: 'Missing environment variables' });
  }

  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

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

  const { serverId, software, version } = req.body;
  
  if (!serverId || !software || !version) {
    console.error('Missing required parameters:', { serverId, software, version });
    return res.status(400).json({ error: 'Missing required parameters' });
  }

  try {
    const { data: server, error: serverError } = await supabaseAdmin
      .from('servers')
      .select('*')
      .eq('id', serverId)
      .single();

    if (serverError || !server) {
      console.error('Server not found:', serverError?.message);
      return res.status(404).json({ error: 'Server not found', detail: serverError?.message });
    }

    // --- 2. Authorization (Ownership Check) ---
    if (server.user_id !== user.id) {
        return res.status(403).json({ error: 'Forbidden', detail: 'You do not own this server' });
    }

    // Stop the server if it's running
    if (server.status === 'Running' && server.hetzner_id) {
      console.log(`Stopping Hetzner server ${server.hetzner_id}`);
      try {
        await fetch(`${HETZNER_API_BASE}/servers/${server.hetzner_id}/actions/poweroff`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${HETZNER_TOKEN}`,
            'Content-Type': 'application/json',
          },
        });
        await new Promise(resolve => setTimeout(resolve, 10000)); // Wait for shutdown
      } catch (stopErr) {
        console.warn('Failed to stop server:', stopErr.message);
        // Continue with deletion even if stop fails, as server may already be off
      }
    }

    // Delete existing Hetzner server if it exists
    if (server.hetzner_id) {
      console.log(`Deleting Hetzner server ${server.hetzner_id}`);
      try {
        const deleteResponse = await fetch(`${HETZNER_API_BASE}/servers/${server.hetzner_id}`, {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${HETZNER_TOKEN}`,
          },
        });

        if (!deleteResponse.ok) {
          const errorText = await deleteResponse.text().catch(() => 'no-body');
          console.error('Failed to delete Hetzner server:', deleteResponse.status, errorText);
          return res.status(502).json({ error: 'Failed to delete existing server', detail: errorText });
        }
        console.log(`Hetzner server ${server.hetzner_id} deleted successfully`);
      } catch (hetznerErr) {
        console.error('Error deleting Hetzner server:', hetznerErr.message);
        return res.status(502).json({ error: 'Failed to delete existing server', detail: hetznerErr.message });
      }
    }

    // Delete Cloudflare DNS records if subdomain exists
    if (server.subdomain) {
      console.log(`Deleting Cloudflare DNS records for ${server.subdomain}`);
      try {
        await deleteCloudflareRecords(server.subdomain);
        console.log(`Cloudflare DNS records deleted for ${server.subdomain}.spawnly.net`);
      } catch (dnsErr) {
        console.error('Failed to delete Cloudflare DNS records:', dnsErr.message);
        return res.status(502).json({ error: 'Failed to delete DNS records', detail: dnsErr.message });
      }
    }

    // Delete server files if required
    let filesDeleted = false;
    if (server.needs_file_deletion) {
      console.log(`Deleting S3 folder for server ${server.id} due to needs_file_deletion`);
      try {
        await deleteS3ServerFolder(server.id);
        filesDeleted = true;
        console.log(`S3 folder servers/${server.id} deleted successfully`);
      } catch (s3Err) {
        console.error('Failed to delete S3 folder:', s3Err.message);
        return res.status(502).json({ error: 'Failed to delete server files from S3', detail: s3Err.message });
      }
    } else {
      console.log(`No file deletion required for server ${server.id}`);
    }

    // Update server record in Supabase
    console.log(`Updating Supabase for server ${serverId} with software: ${software}, version: ${version}`);
    const { error: updateError } = await supabaseAdmin
      .from('servers')
      .update({
        type: software,
        version: version,
        hetzner_id: null,
        ipv4: null,
        status: 'Stopped',
        rcon_password: null,
        needs_recreation: false,
        needs_file_deletion: false,
        pending_type: null,
        pending_version: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', serverId);

    if (updateError) {
      console.error('Failed to update server in Supabase:', updateError.message);
      return res.status(500).json({ error: 'Failed to update server record', detail: updateError.message });
    }

    // [AUDIT LOG START]
    try {
        await supabaseAdmin.from('server_audit_logs').insert({
            server_id: serverId,
            user_id: user.id,
            action_type: 'server_recreate',
            details: `Recreating server with ${software} ${version}`,
            created_at: new Date().toISOString()
        });
    } catch (logErr) {
        console.error("Failed to log server recreation:", logErr);
    }
    // [AUDIT LOG END]

    console.log(`Server ${serverId} recreation prepared successfully`);
    return res.status(200).json({ 
      success: true, 
      message: filesDeleted 
        ? 'Server configuration updated and files deleted from S3. The server will be recreated with the new software/version on the next start.'
        : 'Server configuration updated. The server will be recreated with the new software/version on the next start.'
    });

  } catch (error) {
    console.error('Error in server recreation:', error.message);
    return res.status(500).json({ error: 'Internal server error', detail: error.message });
  }
}