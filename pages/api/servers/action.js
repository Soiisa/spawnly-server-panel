// pages/api/servers/action.js
import { createClient } from '@supabase/supabase-js';
import { 
  S3Client, 
  DeleteObjectsCommand, 
  ListObjectsV2Command, 
  CopyObjectCommand, 
  DeleteObjectCommand 
} from '@aws-sdk/client-s3';
import { v4 as uuidv4 } from 'uuid';
import { verifyServerAccess } from '../../../lib/accessControl'; // <--- NEW IMPORT

const HETZNER_API_BASE = 'https://api.hetzner.cloud/v1';
const CLOUDFLARE_API_BASE = 'https://api.cloudflare.com/client/v4';
const HETZNER_TOKEN = process.env.HETZNER_API_TOKEN;
const CLOUDFLARE_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const CLOUDFLARE_ZONE_ID = process.env.CLOUDFLARE_ZONE_ID;
const S3_ENDPOINT = process.env.S3_ENDPOINT;
const S3_BUCKET = process.env.S3_BUCKET;
const S3_REGION = process.env.S3_REGION;
const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID;
const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY;
const DOMAIN_SUFFIX = '.spawnly.net';

// The IP of the Sleeper Proxy Server
const SLEEPER_PROXY_IP = process.env.SLEEPER_PROXY_IP || '91.99.130.49'; 

const s3Client = new S3Client({
  endpoint: S3_ENDPOINT,
  region: S3_REGION,
  credentials: {
    accessKeyId: AWS_ACCESS_KEY_ID,
    secretAccessKey: AWS_SECRET_ACCESS_KEY,
  },
  forcePathStyle: true,
});

const deleteCloudflareRecords = async (subdomain, maxRetries = 3) => {
  console.log(`[deleteCloudflareRecords] Attempting to delete DNS records for subdomain: ${subdomain}`);
  
  let subdomainPrefix = subdomain;
  if (subdomain.endsWith(DOMAIN_SUFFIX)) {
    subdomainPrefix = subdomain.replace(DOMAIN_SUFFIX, '');
  }

  if (!subdomainPrefix || typeof subdomainPrefix !== 'string' || !subdomainPrefix.match(/^[a-zA-Z0-9-]+$/)) {
    console.warn(`[deleteCloudflareRecords] Invalid or missing subdomain prefix: ${subdomainPrefix}, skipping DNS deletion`);
    return false;
  }

  const recordTypes = [
    { type: 'A', name: `${subdomainPrefix}${DOMAIN_SUFFIX}` },
    { type: 'A', name: `${subdomainPrefix}-api${DOMAIN_SUFFIX}` },
    { type: 'SRV', name: `_minecraft._tcp.${subdomainPrefix}${DOMAIN_SUFFIX}` },
  ];

  let allDeleted = true;
  for (const recordType of recordTypes) {
    let attempt = 0;
    while (attempt < maxRetries) {
      try {
        console.log(`[deleteCloudflareRecords] Attempt ${attempt + 1}: Fetching ${recordType.type} records for ${recordType.name}`);
        const url = `${CLOUDFLARE_API_BASE}/zones/${CLOUDFLARE_ZONE_ID}/dns_records?type=${recordType.type}&name=${encodeURIComponent(recordType.name)}`;
        const response = await fetch(url, {
          headers: {
            Authorization: `Bearer ${CLOUDFLARE_API_TOKEN}`,
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
           console.warn(`[deleteCloudflareRecords] Lookup failed: ${response.status}`);
           throw new Error(`Cloudflare lookup failed: ${response.status}`);
        }

        const { result } = await response.json();
        console.log(`[deleteCloudflareRecords] Found ${result.length} ${recordType.type} records for ${recordType.name}`);

        for (const record of result) {
          await fetch(`${CLOUDFLARE_API_BASE}/zones/${CLOUDFLARE_ZONE_ID}/dns_records/${record.id}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${CLOUDFLARE_API_TOKEN}`, 'Content-Type': 'application/json' },
          });
        }
        break;
      } catch (err) {
        attempt++;
        if (attempt >= maxRetries) allDeleted = false;
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
  }
  return allDeleted;
};

const hetznerDoAction = async (hetznerId, action) => {
  console.log(`[hetznerDoAction] Performing action ${action} for server ${hetznerId}`);
  const url = `${HETZNER_API_BASE}/servers/${hetznerId}/actions/${action}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${HETZNER_TOKEN}`,
      'Content-Type': 'application/json',
    },
  });

  if (res.status === 404) {
      console.warn(`[hetznerDoAction] Server ${hetznerId} not found (404). Assuming action '${action}' is moot/done.`);
      return null;
  }

  const text = await res.text().catch(() => '');
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch (e) {}

  if (!res.ok) {
    throw new Error(`Hetzner action failed (${res.status}): ${text || JSON.stringify(json)}`);
  }
  console.log(`[hetznerDoAction] Action ${action} successful for server ${hetznerId}`);
  return json;
};

const hetznerGetServer = async (hetznerId) => {
  console.log(`[hetznerGetServer] Fetching server info for ${hetznerId}`);
  const url = `${HETZNER_API_BASE}/servers/${hetznerId}`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${HETZNER_TOKEN}` } });
  
  if (r.status === 404) {
      console.warn(`[hetznerGetServer] Server ${hetznerId} returned 404 Not Found.`);
      return null;
  }

  const txt = await r.text().catch(() => '');
  let j = null;
  try { j = txt ? JSON.parse(txt) : null; } catch (e) {}
  
  if (!r.ok) throw new Error(`Hetzner GET server failed (${r.status}): ${txt || JSON.stringify(j)}`);
  console.log(`[hetznerGetServer] Successfully fetched server info for ${hetznerId}`);
  return j;
};

const waitForServerStatus = async (hetznerId, targetStatus, maxAttempts = 30, intervalMs = 5000) => {
  console.log(`[waitForServerStatus] Waiting for server ${hetznerId} to reach status: ${targetStatus}`);
  for (let i = 0; i < maxAttempts; i++) {
    const serverData = await hetznerGetServer(hetznerId);
    
    if (!serverData) {
        console.log(`[waitForServerStatus] Server ${hetznerId} is gone (404). Treating as success.`);
        return true;
    }

    const currentStatus = serverData?.server?.status;
    console.log(`[waitForServerStatus] Attempt ${i + 1}: Current status is ${currentStatus}`);
    if (currentStatus === targetStatus) {
      console.log(`[waitForServerStatus] Server ${hetznerId} reached target status: ${targetStatus}`);
      return true;
    }
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }
  console.warn(`[waitForServerStatus] Server ${hetznerId} did not reach '${targetStatus}' status after ${maxAttempts} attempts`);
  return false;
};

const hetznerDeleteServer = async (hetznerId) => {
  console.log(`[hetznerDeleteServer] Deleting Hetzner server: ${hetznerId}`);
  const url = `${HETZNER_API_BASE}/servers/${hetznerId}`;
  const res = await fetch(url, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${HETZNER_TOKEN}` },
  });

  if (res.status === 404) {
      console.log(`[hetznerDeleteServer] Server ${hetznerId} already deleted (404). Skipping.`);
      return true;
  }

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Hetzner delete failed (${res.status}): ${txt}`);
  }
  console.log(`[hetznerDeleteServer] Successfully deleted Hetzner server: ${hetznerId}`);
  return true;
};

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

async function deductCredits(supabaseAdmin, userId, amount, description, sessionId) {
  const { data: profile, error } = await supabaseAdmin.from('profiles').select('credits').eq('id', userId).single();
  if (error || profile.credits < amount) {
    throw new Error('Insufficient credits');
  }

  const newCredits = profile.credits - amount;
  await supabaseAdmin.from('profiles').update({ credits: newCredits }).eq('id', userId);

  await supabaseAdmin.from('credit_transactions').insert({
    user_id: userId,
    amount: -amount,
    type: 'usage',
    description,
    created_at: new Date().toISOString(),
    session_id: sessionId
  });
}

async function billRemainingTime(supabaseAdmin, server) {
  // We check for Running, but if we are KILLING a stuck server (Initializing/Starting), 
  // we might check if billing started (last_billed_at exists).
  if (server.status !== 'Running' && !server.last_billed_at) return;

  const now = new Date();
  let baseTime = null;
  if (server.last_billed_at) {
    try { baseTime = new Date(server.last_billed_at); } catch (e) { baseTime = null; }
  }
  if (!baseTime && server.running_since) {
    try { baseTime = new Date(server.running_since); } catch (e) { baseTime = null; }
  }

  if (!baseTime) return;

  const elapsedSeconds = Math.floor((now - baseTime) / 1000) + (server.runtime_accumulated_seconds || 0);
  if (elapsedSeconds < 60) return;

  const hours = elapsedSeconds / 3600;
  const cost = hours * server.cost_per_hour;

  // BILL THE OWNER (server.user_id), regardless of who triggered the action
  await deductCredits(supabaseAdmin, server.user_id, cost, `Final runtime charge for server ${server.id} (${elapsedSeconds} seconds)`, server.current_session_id);

  try {
    await supabaseAdmin.from('servers').update({ last_billed_at: now.toISOString(), runtime_accumulated_seconds: 0 }).eq('id', server.id);
  } catch (e) {
    console.error('[billRemainingTime] Failed to update server billing fields:', e && e.message);
  }
}

// --- NEW HELPER: Rotate Auto Backups ---
const rotateAutoBackups = async (serverId, maxKeep) => {
    try {
        const command = new ListObjectsV2Command({
            Bucket: S3_BUCKET,
            Prefix: `backups/${serverId}/auto-`, 
        });
        const response = await s3Client.send(command);
        const backups = (response.Contents || [])
            .sort((a, b) => new Date(a.LastModified) - new Date(b.LastModified)); // Ascending (Oldest first)

        if (backups.length > maxKeep) {
            const toDelete = backups.slice(0, backups.length - maxKeep);
            console.log(`[AutoBackup] Rotating: Deleting ${toDelete.length} old backups for server ${serverId}`);
            
            if (toDelete.length > 0) {
                await s3Client.send(new DeleteObjectsCommand({
                    Bucket: S3_BUCKET,
                    Delete: { Objects: toDelete.map(b => ({ Key: b.Key })) }
                }));
            }
        }
    } catch (e) {
        console.error(`[AutoBackup] Rotation failed: ${e.message}`);
    }
};

// --- NEW HELPER: Perform Auto Backup ---
const performAutoBackup = async (server, supabaseAdmin) => {
    console.log(`[AutoBackup] Checking criteria for server ${server.id}`);
    
    // 1. Check Interval
    const lastBackupTime = server.last_backup_at ? new Date(server.last_backup_at).getTime() : 0;
    const intervalMs = (server.auto_backup_interval_hours || 24) * 60 * 60 * 1000;
    const now = Date.now();

    if (now - lastBackupTime < intervalMs) {
        return;
    }
    console.log(`[AutoBackup] Starting auto-backup for ${server.id}`);
    const fileApiUrl = `http://${server.subdomain}.spawnly.net:3005/api/backups`;
    
    // 2. Trigger Backup on VPS
    const res = await fetch(fileApiUrl, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${server.rcon_password}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({}) // Empty body implies default behavior
    });

    if (!res.ok) throw new Error(`Agent returned ${res.status}: ${await res.text()}`);
    
    const data = await res.json();
    
    // 3. Rename/Tag as Auto (Agent usually names it backup-timestamp.zip)
    // We copy it to a "auto-" prefix so UI can identify it and rotation logic works.
    const originalKey = data.s3Path.replace(`s3://${S3_BUCKET}/`, '');
    
    // Only rename if it doesn't already have 'auto-' (Agent currently generates 'backup-XYZ.zip')
    if (originalKey && !originalKey.includes('auto-')) {
        const fileName = originalKey.split('/').pop();
        const autoFileName = fileName.replace('backup-', 'auto-backup-');
        const autoKey = originalKey.replace(fileName, autoFileName);

        console.log(`[AutoBackup] Renaming ${originalKey} to ${autoKey}`);

        // Copy
        await s3Client.send(new CopyObjectCommand({
            Bucket: S3_BUCKET,
            CopySource: `${S3_BUCKET}/${originalKey}`,
            Key: autoKey
        }));

        // Delete Original
        await s3Client.send(new DeleteObjectCommand({
            Bucket: S3_BUCKET,
            Key: originalKey
        }));
    }

    console.log(`[AutoBackup] Success`);
    
    // 4. Update DB
    await supabaseAdmin.from('servers').update({ last_backup_at: new Date().toISOString() }).eq('id', server.id);

    // 5. Rotation (Delete Oldest)
    await rotateAutoBackups(server.id, server.max_auto_backups || 5);
};

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  try {
    console.log('[API:action] Received request:', { method: req.method, body: req.body });
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!HETZNER_TOKEN || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      console.error('[API:action] Missing environment variables');
      return res.status(500).json({ error: 'Missing env vars' });
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized', detail: 'Missing Authorization header' });
    }
    const token = authHeader.split(' ')[1];
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return res.status(401).json({ error: 'Unauthorized', detail: 'Invalid token' });
    }

    const { serverId, action } = req.body || {};
    if (!serverId || !action) {
      console.error('[API:action] Missing serverId or action in request body');
      return res.status(400).json({ error: 'Missing serverId or action' });
    }

    console.log(`[API:action] Fetching server data for serverId: ${serverId}, action: ${action}`);
    const { data: server, error: serverErr } = await supabaseAdmin
      .from('servers')
      .select('*')
      .eq('id', serverId)
      .single();

    if (serverErr || !server) {
      console.error('[API:action] Server not found or error:', serverErr?.message);
      return res.status(404).json({ error: 'Server not found', detail: serverErr?.message || null });
    }
    
    // --- SHARED OWNERSHIP PERMISSION CHECK START ---
    const permissionMap = {
      start: 'control',
      stop: 'control',
      restart: 'control',
      kill: 'control',
      delete: 'admin' // Effectively only Owner or specifically 'admin' permission
    };
    
    const requiredPerm = permissionMap[action];

    // Use verifyServerAccess helper to check owner OR permissions table
    const access = await verifyServerAccess(supabaseAdmin, serverId, user.id, requiredPerm);
    
    if (!access.allowed) {
      console.warn(`[Security] User ${user.id} denied ${action} on server ${server.id}`);
      return res.status(403).json({ error: 'Forbidden', detail: access.error || 'You do not have permission to perform this action' });
    }
    // --- SHARED OWNERSHIP PERMISSION CHECK END ---

    // Fetch Owner's profile for billing (WE ALWAYS BILL THE OWNER)
    const { data: profile, error: profileErr } = await supabaseAdmin.from('profiles').select('credits').eq('id', server.user_id).single();
    if (profileErr || !profile) return res.status(500).json({ error: 'Failed to fetch server owner profile' });

    if (action === 'start' || action === 'restart') {
      const minCost = (server.cost_per_hour / 60) * 5;
      if (profile.credits < minCost) {
        return res.status(402).json({ error: 'Insufficient credits to start server' });
      }
    }

    // --- UPDATED: Handle STOP, DELETE, and KILL ---
    if (action === 'delete' || action === 'stop' || action === 'kill') {
      await billRemainingTime(supabaseAdmin, server);

      // --- AUTO BACKUP LOGIC START ---
      // We only attempt backup if: 
      // 1. Action is STOP (not delete/kill)
      // 2. Feature is enabled
      // 3. Server is actually running/provisioned (has Hetzner ID)
      if (action === 'stop' && server.auto_backup_enabled && server.hetzner_id) {
          try {
             await performAutoBackup(server, supabaseAdmin);
          } catch (backupErr) {
             console.error('[API:action] Auto-backup failed, proceeding with stop:', backupErr.message);
          }
      }
      // --- AUTO BACKUP LOGIC END ---

      if (server.hetzner_id) {
        // [UPDATED] Graceful Shutdown Loop only if NOT killing
        if (action !== 'kill') {
            try {
              console.log(`[API:action] Shutting down Hetzner server: ${server.hetzner_id}`);
              await hetznerDoAction(server.hetzner_id, 'shutdown');
              
              const isOff = await waitForServerStatus(server.hetzner_id, 'off', 30, 5000);
              if (!isOff) {
                console.warn(`[API:action] Server ${server.hetzner_id} did not reach 'off' status (or is still running), proceeding with force deletion`);
              }
            } catch (stopErr) {
              console.error('[API:action] Stop sequence warning (likely non-fatal):', stopErr.message);
            }
        } else {
             console.log(`[API:action] FORCE KILL requested. Skipping graceful shutdown for server ${server.hetzner_id}.`);
        }

        try {
          // [UPDATED] Robust Deletion
          await hetznerDeleteServer(server.hetzner_id);
        } catch (hetznerErr) {
          console.error('[API:action] Failed to delete server from Hetzner:', hetznerErr.message);
          return res.status(502).json({ error: 'Failed to delete server from Hetzner', detail: hetznerErr.message });
        }
      }

      if (server.subdomain) {
        try {
          console.log(`[API:action] Cleaning up DNS records for subdomain: ${server.subdomain}`);
          await deleteCloudflareRecords(server.subdomain);

          // For STOP or KILL, redirect DNS to Sleeper Proxy
          if (action === 'stop' || action === 'kill') {
            console.log(`[API:action] Pointing ${server.subdomain} to Sleeper Proxy (${SLEEPER_PROXY_IP})`);
            const dnsUrl = `${CLOUDFLARE_API_BASE}/zones/${CLOUDFLARE_ZONE_ID}/dns_records`;
            await fetch(dnsUrl, {
              method: 'POST',
              headers: { Authorization: `Bearer ${CLOUDFLARE_API_TOKEN}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                type: 'A',
                name: `${server.subdomain}${DOMAIN_SUFFIX}`,
                content: SLEEPER_PROXY_IP,
                ttl: 60, 
                proxied: false 
              })
            });
          }
        } catch (dnsErr) {
          console.error('[API:action] Failed to update Cloudflare DNS records:', dnsErr.message);
        }
      }

      if (action === 'delete') {
        try {
          await deleteS3ServerFolder(server.id);
        } catch (s3Err) {
          console.error('[API:action] Failed to delete S3 folder:', s3Err.message);
          return res.status(502).json({ error: 'Failed to delete server data from S3', detail: s3Err.message });
        }

        const { error: delErr } = await supabaseAdmin
          .from('servers')
          .delete()
          .eq('id', serverId);
        if (delErr) {
          console.error('[API:action] Supabase delete error:', delErr);
          return res.status(500).json({ error: 'Failed to delete server from Supabase', detail: delErr.message });
        }
      } else {
        // STOP or KILL -> Set status to 'Stopped'
        console.log(`[API:action] Updating Supabase for server ${serverId}: setting status to 'Stopped'`);
        const nowIso = new Date().toISOString();
        const { error: updateErr } = await supabaseAdmin
          .from('servers')
          .update({
            status: 'Stopped',
            hetzner_id: null,
            ipv4: null,
            last_billed_at: null,
            runtime_accumulated_seconds: 0,
            running_since: null,
            current_session_id: null, 
            last_heartbeat_at: nowIso,
            last_empty_at: null,
            started_at: null // --- CLEAN UP STARTED_AT ON STOP/KILL ---
          })
          .eq('id', serverId);
        if (updateErr) {
          console.error('[API:action] Failed to update Supabase after stop:', updateErr.message);
          return res.status(502).json({ error: 'Failed to update Supabase after shutdown', detail: updateErr.message });
        }
      }

      console.log(`[API:action] Action ${action} completed successfully for server ${serverId}`);
      return res.status(200).json({ ok: true });
    }

    // [MODIFIED] If action is kill, we might proceed even without Hetzner ID to clean up DB/DNS
    if (!server.hetzner_id) {
      // If the user wants to KILL a stuck initializing server that has no hetzner_id yet
      if (action === 'kill') {
           console.log('[API:action] Force killing unprovisioned server (cleaning up DB/DNS only).');
           // DNS Cleaning
           if (server.subdomain) {
             await deleteCloudflareRecords(server.subdomain);
             // Sleeper redirect
             try {
                const dnsUrl = `${CLOUDFLARE_API_BASE}/zones/${CLOUDFLARE_ZONE_ID}/dns_records`;
                await fetch(dnsUrl, {
                  method: 'POST',
                  headers: { Authorization: `Bearer ${CLOUDFLARE_API_TOKEN}`, 'Content-Type': 'application/json' },
                  body: JSON.stringify({ type: 'A', name: `${server.subdomain}${DOMAIN_SUFFIX}`, content: SLEEPER_PROXY_IP, ttl: 60, proxied: false })
                });
             } catch(e) {}
           }
           
           await supabaseAdmin.from('servers').update({
             status: 'Stopped', hetzner_id: null, ipv4: null, 
             last_billed_at: null, runtime_accumulated_seconds: 0, 
             running_since: null, current_session_id: null,
             started_at: null // --- CLEAN UP STARTED_AT ---
           }).eq('id', serverId);
           
           return res.status(200).json({ ok: true, message: 'Force killed unprovisioned server.' });
      }

      console.error('[API:action] Server not provisioned on Hetzner, cannot perform action:', action);
      return res.status(400).json({ error: 'Server not provisioned on Hetzner' });
    }

    let hetAction;
    let newStatus;
    switch (action) {
      case 'start':
        hetAction = 'poweron';
        newStatus = 'Starting';
        break;
      case 'restart':
        hetAction = 'reboot';
        newStatus = 'Restarting';
        break;
      default:
        console.error('[API:action] Unknown action:', action);
        return res.status(400).json({ error: 'Unknown action' });
    }

    let sessionId = server.current_session_id;
    if (action === 'start' && !sessionId) { 
      sessionId = uuidv4(); 
      console.log(`[API:action] Generating new session_id: ${sessionId}`);
    }

    console.log(`[API:action] Performing Hetzner action: ${hetAction} for server: ${server.hetzner_id}`);
    const hetRes = await hetznerDoAction(server.hetzner_id, hetAction);

    console.log(`[API:action] Updating server status to ${newStatus} in Supabase`);
    const now = new Date().toISOString();
    const updateFields = { 
      status: newStatus,
      last_billed_at: now,
      runtime_accumulated_seconds: 0,
      last_empty_at: null,
      started_at: now // --- SET STARTED_AT ON START/RESTART ---
    };
    if (action === 'start' && sessionId && sessionId !== server.current_session_id) {
      updateFields.current_session_id = sessionId; 
    }
    const { error: statusUpdateErr } = await supabaseAdmin.from('servers').update(updateFields).eq('id', serverId);
    if (statusUpdateErr) {
      console.error('[API:action] Failed to update server status in Supabase:', statusUpdateErr.message);
      return res.status(500).json({ error: 'Failed to update server status', detail: statusUpdateErr.message });
    }

    console.log(`[API:action] Waiting 15 seconds for server status update after action: ${action}`);
    await new Promise(resolve => setTimeout(resolve, 15000));
    console.log(`[API:action] Fetching final server status for: ${server.hetzner_id}`);
    const hetznerServer = await hetznerGetServer(server.hetzner_id);
    let finalStatus = newStatus;

    if (hetznerServer && hetznerServer.server) {
      const hetznerStatus = hetznerServer.server.status;
      console.log(`[API:action] Hetzner server status: ${hetznerStatus}`);
      if (hetznerStatus === 'running') {
        finalStatus = 'Running';
      } else if (hetznerStatus === 'off') {
        finalStatus = 'Stopped';
      }
    }

    console.log(`[API:action] Updating Supabase with final status: ${finalStatus}`);
    const { error: finalStatusErr } = await supabaseAdmin.from('servers').update({ status: finalStatus }).eq('id', serverId);
    if (finalStatusErr) {
      console.error('[API:action] Failed to update final server status in Supabase:', finalStatusErr.message);
      return res.status(500).json({ error: 'Failed to update final server status', detail: finalStatusErr.message });
    }

    console.log(`[API:action] Action ${action} completed successfully for server ${serverId}`);
    return res.status(200).json({ ok: true, hetznerAction: hetRes, status: finalStatus });
  } catch (err) {
    console.error('[API:action] Unhandled error:', err.message, err.stack);
    return res.status(500).json({ error: 'Internal server error', detail: String(err), stack: process.env.NODE_ENV === 'development' ? err.stack : undefined });
  }
}