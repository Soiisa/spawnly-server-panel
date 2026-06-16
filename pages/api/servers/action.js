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
import { verifyServerAccess } from '../../../lib/accessControl';
import { promisify } from 'util';
import { exec } from 'child_process';

const execAsync = promisify(exec);

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

// --- Standard S3 Delete (Fallback) ---
const deleteS3ServerFolder = async (serverId) => {
  console.log(`[deleteS3ServerFolder] Standard deleting S3 folder for server: ${serverId}`);
  try {
    let continuationToken = null;
    do {
        const listCommand = new ListObjectsV2Command({
            Bucket: S3_BUCKET,
            Prefix: `servers/${serverId}/`,
            ContinuationToken: continuationToken
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
            console.log(`[deleteS3ServerFolder] Deleted batch of ${listResponse.Contents.length} objects`);
        }
        continuationToken = listResponse.NextContinuationToken;
    } while (continuationToken);
    
    console.log(`[deleteS3ServerFolder] Successfully deleted all objects for server: ${serverId}`);
    return true;
  } catch (err) {
    console.error(`[deleteS3ServerFolder] Failed to delete S3 folder servers/${serverId}:`, err);
    return false;
  }
};

// --- Fast S3 Delete using s5cmd (Primary) ---
const deleteS3ServerFolderFast = async (serverId) => {
  console.log(`[deleteS3ServerFolderFast] Fast deleting S3 folder for server: ${serverId} using s5cmd`);
  const bucketUrl = `s3://${S3_BUCKET}/servers/${serverId}/*`;
  
  try {
    const cmd = `s5cmd --endpoint-url ${S3_ENDPOINT} rm "${bucketUrl}"`;
    const { stdout, stderr } = await execAsync(cmd);
    
    if (stdout) console.log('[s5cmd]', stdout);
    
    console.log(`[deleteS3ServerFolderFast] Successfully triggered deletion for ${bucketUrl}`);
    return true;
  } catch (err) {
    console.warn(`[deleteS3ServerFolderFast] s5cmd failed (likely missing). Falling back to standard delete.`);
    return await deleteS3ServerFolder(serverId);
  }
};

async function deductCredits(supabaseAdmin, userId, amount, serverId, sessionId, billableSeconds) {
  const { data: profile, error } = await supabaseAdmin.from('profiles').select('credits').eq('id', userId).single();
  if (error || profile.credits < amount) {
    throw new Error('Insufficient credits');
  }

  const newCredits = profile.credits - amount;
  await supabaseAdmin.from('profiles').update({ credits: newCredits }).eq('id', userId);

  let existingTx = null;
  if (sessionId) {
      const { data } = await supabaseAdmin.from('credit_transactions').select('*').eq('session_id', sessionId).eq('type', 'usage').single();
      existingTx = data;
  }

  if (existingTx) {
      const newAmount = existingTx.amount - amount;
      const timeMatch = existingTx.description.match(/\((\d+)\s*seconds\)/);
      let totalSeconds = billableSeconds;
      if (timeMatch && timeMatch[1]) totalSeconds += parseInt(timeMatch[1], 10);
      await supabaseAdmin.from('credit_transactions').update({
        amount: newAmount, description: `Final runtime charge for server ${serverId} (${totalSeconds} seconds)`
      }).eq('id', existingTx.id);
  } else {
      await supabaseAdmin.from('credit_transactions').insert({
          user_id: userId, amount: -amount, type: 'usage',
          description: `Final runtime charge for server ${serverId} (${billableSeconds} seconds)`, created_at: new Date().toISOString(), session_id: sessionId
      });
  }
}

async function deductPoolCredits(supabaseAdmin, poolId, amount, serverId, sessionId, billableSeconds) {
    const { data: pool, error } = await supabaseAdmin.from('credit_pools').select('balance').eq('id', poolId).single();
    if (error || pool.balance < amount) throw new Error('Insufficient pool credits');
    
    const newBalance = pool.balance - amount;
    await supabaseAdmin.from('credit_pools').update({ balance: newBalance }).eq('id', poolId);

    let existingTx = null;
    if (sessionId) {
        const { data } = await supabaseAdmin.from('pool_transactions').select('*').eq('session_id', sessionId).eq('pool_id', poolId).eq('type', 'usage').single();
        existingTx = data;
    }

    if (existingTx) {
         const newAmount = existingTx.amount - amount;
         const timeMatch = existingTx.description.match(/\((\d+)\s*seconds\)/);
         let totalSeconds = billableSeconds;
         if (timeMatch && timeMatch[1]) totalSeconds += parseInt(timeMatch[1], 10);
         await supabaseAdmin.from('pool_transactions').update({
             amount: newAmount, description: `Final runtime charge for server ${serverId} (${totalSeconds} seconds)`
         }).eq('id', existingTx.id);
    } else {
        await supabaseAdmin.from('pool_transactions').insert({
            pool_id: poolId, server_id: serverId, amount: -amount, type: 'usage',
            description: `Final runtime charge for server ${serverId} (${billableSeconds} seconds)`, session_id: sessionId
        });
    }
}

async function billRemainingTime(supabaseAdmin, server) {
  const billingType = (server.billing_type || '').toLowerCase().trim();
  if (billingType === 'monthly') return;

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
  const cost = Number((hours * server.cost_per_hour).toFixed(4));

  if (server.pool_id) {
      try {
          await deductPoolCredits(supabaseAdmin, server.pool_id, cost, server.id, server.current_session_id, elapsedSeconds);
      } catch (e) { console.warn(`[billRemainingTime] Pool Error: ${e.message}`); }
  } else {
      try {
          await deductCredits(supabaseAdmin, server.user_id, cost, server.id, server.current_session_id, elapsedSeconds);
      } catch (e) { console.error(`[billRemainingTime] Wallet Error: ${e.message}`); }
  }

  try {
    await supabaseAdmin.from('servers').update({ last_billed_at: now.toISOString(), runtime_accumulated_seconds: 0 }).eq('id', server.id);
  } catch (e) {
    console.error('[billRemainingTime] Failed to update server billing fields:', e && e.message);
  }
}

const rotateAutoBackups = async (serverId, maxKeep) => {
    try {
        const command = new ListObjectsV2Command({
            Bucket: S3_BUCKET,
            Prefix: `backups/${serverId}/auto-`, 
        });
        const response = await s3Client.send(command);
        const backups = (response.Contents || [])
            .sort((a, b) => new Date(a.LastModified) - new Date(b.LastModified));

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

const performAutoBackup = async (server, supabaseAdmin) => {
    console.log(`[AutoBackup] Checking criteria for server ${server.id}`);
    
    const lastBackupTime = server.last_backup_at ? new Date(server.last_backup_at).getTime() : 0;
    const intervalMs = (server.auto_backup_interval_hours || 24) * 60 * 60 * 1000;
    const now = Date.now();

    if (now - lastBackupTime < intervalMs) {
        return;
    }
    console.log(`[AutoBackup] Starting auto-backup for ${server.id}`);
    const fileApiUrl = `http://${server.subdomain}.spawnly.net:3005/api/backups`;
    
    const res = await fetch(fileApiUrl, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${server.rcon_password}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({})
    });

    if (!res.ok) throw new Error(`Agent returned ${res.status}: ${await res.text()}`);
    
    const data = await res.json();
    
    const originalKey = data.s3Path.replace(`s3://${S3_BUCKET}/`, '');
    
    if (originalKey && !originalKey.includes('auto-')) {
        const fileName = originalKey.split('/').pop();
        const autoFileName = fileName.replace('backup-', 'auto-backup-');
        const autoKey = originalKey.replace(fileName, autoFileName);

        await s3Client.send(new CopyObjectCommand({
            Bucket: S3_BUCKET, CopySource: `${S3_BUCKET}/${originalKey}`, Key: autoKey
        }));
        await s3Client.send(new DeleteObjectCommand({
            Bucket: S3_BUCKET, Key: originalKey
        }));
    }

    await supabaseAdmin.from('servers').update({ last_backup_at: new Date().toISOString() }).eq('id', server.id);
    await rotateAutoBackups(server.id, server.max_auto_backups || 5);
};

// --- NEW: Daemon Power Intercept Helper ---
const callDaemonPower = async (server, daemonAction) => {
    console.log(`[callDaemonPower] Dispatching ${daemonAction} to http://${server.ipv4}:3005/api/power`);
    const response = await fetch(`http://${server.ipv4}:3005/api/power`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${server.rcon_password}`
        },
        body: JSON.stringify({ action: daemonAction })
    });

    if (!response.ok) {
        const errText = await response.text().catch(() => '');
        throw new Error(`Daemon returned ${response.status}: ${errText}`);
    }
    return await response.json();
};

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  try {
    console.log('[API:action] Received request:', { method: req.method, body: req.body });
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!HETZNER_TOKEN || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
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
      return res.status(400).json({ error: 'Missing serverId or action' });
    }

    const { data: server, error: serverErr } = await supabaseAdmin
      .from('servers')
      .select('*')
      .eq('id', serverId)
      .single();

    if (serverErr || !server) {
      return res.status(404).json({ error: 'Server not found', detail: serverErr?.message || null });
    }
    
    // Support the new hard_restart payload
    const permissionMap = {
      start: 'control',
      stop: 'control',
      restart: 'control',
      hard_restart: 'control',
      kill: 'control',
      delete: 'admin'
    };
    
    const requiredPerm = permissionMap[action];
    const access = await verifyServerAccess(supabaseAdmin, serverId, user.id, requiredPerm);
    
    if (!access.allowed) {
      return res.status(403).json({ error: 'Forbidden', detail: access.error || 'You do not have permission' });
    }

    // Determine target route: Daemon soft-restart vs Hetzner hard-restart
    const isSteamGame = server.game && server.game !== 'minecraft';
    let targetRoute = 'hetzner'; 
    if (isSteamGame && ['start', 'stop', 'restart', 'kill'].includes(action)) {
        targetRoute = 'daemon'; // Soft actions handled by the VPS daemon
    }

    // ========================================================================
    // STOP / KILL / DELETE ACTIONS
    // ========================================================================
    if (action === 'delete' || action === 'stop' || action === 'kill') {
      await billRemainingTime(supabaseAdmin, server);

      if (action === 'stop' && server.auto_backup_enabled && server.hetzner_id) {
          try { await performAutoBackup(server, supabaseAdmin); } catch (backupErr) {}
      }

      const billingType = (server.billing_type || '').toLowerCase().trim();
      const isHourly = billingType === 'hourly';
      let shouldDeleteVps = action === 'delete' || (isHourly && (action === 'stop' || action === 'kill'));

      // If we are soft-stopping via the daemon, NEVER delete the VPS hardware.
      if (targetRoute === 'daemon') {
          shouldDeleteVps = false;
          try {
              const daemonAction = action === 'kill' ? 'stop' : 'stop';
              await callDaemonPower(server, daemonAction);
          } catch (e) {
              console.error('[API:action] Daemon stop failed (non-fatal):', e.message);
          }
      } 
      // Hardware-level actions
      else if (server.hetzner_id) {
        if (action === 'stop' || action === 'delete') {
            try {
              await hetznerDoAction(server.hetzner_id, 'shutdown');
              await waitForServerStatus(server.hetzner_id, 'off', 30, 5000);
            } catch (stopErr) {}
        } else if (action === 'kill') {
            try { await hetznerDoAction(server.hetzner_id, 'poweroff'); } catch (killErr) {}
        }

        if (shouldDeleteVps) {
            try { await hetznerDeleteServer(server.hetzner_id); } 
            catch (hetznerErr) { return res.status(502).json({ error: 'Failed to delete server from Hetzner' }); }
        }
      }

      if (server.subdomain && shouldDeleteVps) {
        try { await deleteCloudflareRecords(server.subdomain); } catch (dnsErr) {}
      }

      if (action === 'delete') {
        await supabaseAdmin.from('server_audit_logs').insert({ server_id: serverId, user_id: user.id, action_type: 'server_delete', details: 'Server deleted permanently', created_at: new Date().toISOString() });
        
        try {
            await supabaseAdmin.from('pool_transactions').delete().eq('server_id', serverId);
            await supabaseAdmin.from('server_permissions').delete().eq('server_id', serverId);
            await supabaseAdmin.from('allocations').delete().eq('server_id', serverId);
            await supabaseAdmin.from('server_console').delete().eq('server_id', serverId);
            await supabaseAdmin.from('installed_software').delete().eq('server_id', serverId);
        } catch (cleanupErr) {}

        const { error: delErr } = await supabaseAdmin.from('servers').delete().eq('id', serverId);
        if (delErr) return res.status(500).json({ error: 'Failed to delete server from Supabase', detail: delErr.message });
        
        try { await deleteS3ServerFolderFast(server.id); } catch (s3Err) {}
      } else {
        const nowIso = new Date().toISOString();
        const updatePayload = {
            status: 'Stopped', running_since: null, current_session_id: null, last_heartbeat_at: nowIso, last_empty_at: null, started_at: null
        };
        
        if (shouldDeleteVps) {
            updatePayload.hetzner_id = null;
            updatePayload.ipv4 = null;
        }

        if (billingType !== 'monthly') {
            updatePayload.last_billed_at = null;
            updatePayload.runtime_accumulated_seconds = 0;
        }

        await supabaseAdmin.from('servers').update(updatePayload).eq('id', serverId);
        await supabaseAdmin.from('server_audit_logs').insert({ server_id: serverId, user_id: user.id, action_type: `server_${action}`, details: `Action ${action} executed successfully`, created_at: nowIso });
      }

      return res.status(200).json({ ok: true });
    }

    // ========================================================================
    // START / RESTART ACTIONS
    // ========================================================================
    if (!server.hetzner_id) {
      return res.status(400).json({ error: 'Server not provisioned on Hetzner' });
    }

    const billingType = (server.billing_type || '').toLowerCase().trim();
    const nowIso = new Date().toISOString();
    let sessionId = server.current_session_id;

    if (action === 'start' && !sessionId) sessionId = uuidv4();

    // 1. Soft-Start via VPS Daemon
    if (targetRoute === 'daemon') {
        const daemonAction = action === 'start' ? 'start' : 'restart';
        
        try {
            await callDaemonPower(server, daemonAction);
        } catch (err) {
            return res.status(502).json({ error: 'VPS Daemon failed to process command', detail: err.message });
        }

        const updateFields = { 
            status: 'Running', runtime_accumulated_seconds: 0, last_empty_at: null, started_at: nowIso, running_since: nowIso 
        };
        if (billingType !== 'monthly') updateFields.last_billed_at = nowIso;
        if (action === 'start') updateFields.current_session_id = sessionId;

        await supabaseAdmin.from('servers').update(updateFields).eq('id', serverId);
        await supabaseAdmin.from('server_audit_logs').insert({ server_id: serverId, user_id: user.id, action_type: `server_${action}`, details: `Daemon ${daemonAction} executed`, created_at: nowIso });
        
        return res.status(200).json({ ok: true, status: 'Running' });
    }

    // 2. Hard-Start via Hetzner Hardware
    let hetAction;
    let newStatus;
    switch (action) {
      case 'start': hetAction = 'poweron'; newStatus = 'Starting'; break;
      case 'restart': 
      case 'hard_restart': hetAction = 'reboot'; newStatus = 'Restarting'; break;
      default: return res.status(400).json({ error: 'Unknown action' });
    }

    const hetRes = await hetznerDoAction(server.hetzner_id, hetAction);

    const updateFields = { status: newStatus, runtime_accumulated_seconds: 0, last_empty_at: null, started_at: nowIso };
    if (billingType !== 'monthly') updateFields.last_billed_at = nowIso;
    if (action === 'start' && sessionId) updateFields.current_session_id = sessionId;

    await supabaseAdmin.from('servers').update(updateFields).eq('id', serverId);

    await new Promise(resolve => setTimeout(resolve, 15000));
    const hetznerServer = await hetznerGetServer(server.hetzner_id);
    
    let finalStatus = newStatus;
    if (hetznerServer && hetznerServer.server) {
      const hetznerStatus = hetznerServer.server.status;
      if (hetznerStatus === 'running') finalStatus = 'Running';
      else if (hetznerStatus === 'off') finalStatus = 'Stopped';
    }

    await supabaseAdmin.from('servers').update({ status: finalStatus }).eq('id', serverId);
    await supabaseAdmin.from('server_audit_logs').insert({ server_id: serverId, user_id: user.id, action_type: `server_${action}`, details: `Server ${action} initiated. Status: ${finalStatus}`, created_at: nowIso });

    return res.status(200).json({ ok: true, hetznerAction: hetRes, status: finalStatus });
  } catch (err) {
    return res.status(500).json({ error: 'Internal server error', detail: String(err) });
  }
}