// pages/api/servers/action.js
import { createClient } from '@supabase/supabase-js';
import { S3Client, DeleteObjectsCommand, ListObjectsV2Command, CopyObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
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

const s3Client = new S3Client({ endpoint: S3_ENDPOINT, region: S3_REGION, credentials: { accessKeyId: AWS_ACCESS_KEY_ID, secretAccessKey: AWS_SECRET_ACCESS_KEY }, forcePathStyle: true });

const deleteCloudflareRecords = async (subdomain, maxRetries = 3) => {
  let subdomainPrefix = subdomain.endsWith(DOMAIN_SUFFIX) ? subdomain.replace(DOMAIN_SUFFIX, '') : subdomain;
  if (!subdomainPrefix || !subdomainPrefix.match(/^[a-zA-Z0-9-]+$/)) return false;
  const recordTypes = [{ type: 'A', name: `${subdomainPrefix}${DOMAIN_SUFFIX}` }, { type: 'A', name: `${subdomainPrefix}-api${DOMAIN_SUFFIX}` }, { type: 'SRV', name: `_minecraft._tcp.${subdomainPrefix}${DOMAIN_SUFFIX}` }];

  let allDeleted = true;
  for (const recordType of recordTypes) {
    let attempt = 0;
    while (attempt < maxRetries) {
      try {
        const url = `${CLOUDFLARE_API_BASE}/zones/${CLOUDFLARE_ZONE_ID}/dns_records?type=${recordType.type}&name=${encodeURIComponent(recordType.name)}`;
        const response = await fetch(url, { headers: { Authorization: `Bearer ${CLOUDFLARE_API_TOKEN}`, 'Content-Type': 'application/json' } });
        if (!response.ok) throw new Error(`Lookup failed`);
        const { result } = await response.json();
        for (const record of result) {
          await fetch(`${CLOUDFLARE_API_BASE}/zones/${CLOUDFLARE_ZONE_ID}/dns_records/${record.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${CLOUDFLARE_API_TOKEN}`, 'Content-Type': 'application/json' } });
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
  const url = `${HETZNER_API_BASE}/servers/${hetznerId}/actions/${action}`;
  const res = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${HETZNER_TOKEN}`, 'Content-Type': 'application/json' } });
  if (res.status === 404) return null;
  const text = await res.text().catch(() => '');
  if (!res.ok) throw new Error(`Hetzner action failed`);
  try { return text ? JSON.parse(text) : null; } catch (e) { return null; }
};

const hetznerGetServer = async (hetznerId) => {
  const url = `${HETZNER_API_BASE}/servers/${hetznerId}`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${HETZNER_TOKEN}` } });
  if (r.status === 404) return null;
  const txt = await r.text().catch(() => '');
  if (!r.ok) throw new Error(`Hetzner GET failed`);
  try { return txt ? JSON.parse(txt) : null; } catch (e) { return null; }
};

const waitForServerStatus = async (hetznerId, targetStatus, maxAttempts = 30, intervalMs = 5000) => {
  for (let i = 0; i < maxAttempts; i++) {
    const serverData = await hetznerGetServer(hetznerId);
    if (!serverData) return true; // Server is gone
    if (serverData?.server?.status === targetStatus) return true;
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }
  return false;
};

const hetznerDeleteServer = async (hetznerId) => {
  const url = `${HETZNER_API_BASE}/servers/${hetznerId}`;
  const res = await fetch(url, { method: 'DELETE', headers: { Authorization: `Bearer ${HETZNER_TOKEN}` } });
  if (res.status === 404) return true;
  if (!res.ok) throw new Error(`Hetzner delete failed`);
  return true;
};

const deleteS3ServerFolder = async (serverId) => {
  try {
    let continuationToken = null;
    do {
        const listResponse = await s3Client.send(new ListObjectsV2Command({ Bucket: S3_BUCKET, Prefix: `servers/${serverId}/`, ContinuationToken: continuationToken }));
        if (listResponse.Contents?.length > 0) {
            await s3Client.send(new DeleteObjectsCommand({ Bucket: S3_BUCKET, Delete: { Objects: listResponse.Contents.map((obj) => ({ Key: obj.Key })), Quiet: true } }));
        }
        continuationToken = listResponse.NextContinuationToken;
    } while (continuationToken);
    return true;
  } catch (err) { return false; }
};

const deleteS3ServerFolderFast = async (serverId) => {
  try {
    await execAsync(`s5cmd --endpoint-url ${S3_ENDPOINT} rm "s3://${S3_BUCKET}/servers/${serverId}/*"`);
    return true;
  } catch (err) { return await deleteS3ServerFolder(serverId); }
};

async function deductCredits(supabaseAdmin, userId, amount, serverId, sessionId, billableSeconds) {
  const { data: profile } = await supabaseAdmin.from('profiles').select('credits').eq('id', userId).single();
  if (profile.credits < amount) throw new Error('Insufficient credits');
  await supabaseAdmin.from('profiles').update({ credits: profile.credits - amount }).eq('id', userId);
  let existingTx = null;
  if (sessionId) existingTx = (await supabaseAdmin.from('credit_transactions').select('*').eq('session_id', sessionId).eq('type', 'usage').single()).data;

  if (existingTx) {
      const timeMatch = existingTx.description.match(/\((\d+)\s*seconds\)/);
      let totalSeconds = billableSeconds + (timeMatch ? parseInt(timeMatch[1], 10) : 0);
      await supabaseAdmin.from('credit_transactions').update({ amount: existingTx.amount - amount, description: `Final runtime charge for server ${serverId} (${totalSeconds} seconds)` }).eq('id', existingTx.id);
  } else {
      await supabaseAdmin.from('credit_transactions').insert({ user_id: userId, amount: -amount, type: 'usage', description: `Final runtime charge for server ${serverId} (${billableSeconds} seconds)`, created_at: new Date().toISOString(), session_id: sessionId });
  }
}

async function deductPoolCredits(supabaseAdmin, poolId, amount, serverId, sessionId, billableSeconds) {
    const { data: pool } = await supabaseAdmin.from('credit_pools').select('balance').eq('id', poolId).single();
    if (pool.balance < amount) throw new Error('Insufficient pool credits');
    await supabaseAdmin.from('credit_pools').update({ balance: pool.balance - amount }).eq('id', poolId);
    let existingTx = null;
    if (sessionId) existingTx = (await supabaseAdmin.from('pool_transactions').select('*').eq('session_id', sessionId).eq('pool_id', poolId).eq('type', 'usage').single()).data;

    if (existingTx) {
         const timeMatch = existingTx.description.match(/\((\d+)\s*seconds\)/);
         let totalSeconds = billableSeconds + (timeMatch ? parseInt(timeMatch[1], 10) : 0);
         await supabaseAdmin.from('pool_transactions').update({ amount: existingTx.amount - amount, description: `Final runtime charge for server ${serverId} (${totalSeconds} seconds)` }).eq('id', existingTx.id);
    } else {
        await supabaseAdmin.from('pool_transactions').insert({ pool_id: poolId, server_id: serverId, amount: -amount, type: 'usage', description: `Final runtime charge for server ${serverId} (${billableSeconds} seconds)`, session_id: sessionId });
    }
}

async function billRemainingTime(supabaseAdmin, server) {
  const billingType = (server.billing_type || '').toLowerCase().trim();
  if (billingType === 'monthly') return;
  if (server.game_status !== 'Running' && !server.last_billed_at) return;

  const now = new Date();
  let baseTime = server.last_billed_at ? new Date(server.last_billed_at) : (server.running_since ? new Date(server.running_since) : null);
  if (!baseTime) return;

  const elapsedSeconds = Math.floor((now - baseTime) / 1000) + (server.runtime_accumulated_seconds || 0);
  if (elapsedSeconds < 60) return;

  const hours = elapsedSeconds / 3600;
  const cost = Number((hours * server.cost_per_hour).toFixed(4));

  if (server.pool_id) {
      try { await deductPoolCredits(supabaseAdmin, server.pool_id, cost, server.id, server.current_session_id, elapsedSeconds); } catch (e) {}
  } else {
      try { await deductCredits(supabaseAdmin, server.user_id, cost, server.id, server.current_session_id, elapsedSeconds); } catch (e) {}
  }

  try { await supabaseAdmin.from('servers').update({ last_billed_at: now.toISOString(), runtime_accumulated_seconds: 0 }).eq('id', server.id); } catch (e) {}
}

const performAutoBackup = async (server, supabaseAdmin) => {
    const lastBackupTime = server.last_backup_at ? new Date(server.last_backup_at).getTime() : 0;
    const intervalMs = (server.auto_backup_interval_hours || 24) * 60 * 60 * 1000;
    if (Date.now() - lastBackupTime < intervalMs) return;

    const fileApiUrl = `http://${server.ipv4}:3005/api/backups`;
    const res = await fetch(fileApiUrl, { method: 'POST', headers: { 'Authorization': `Bearer ${server.rcon_password}`, 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
    if (!res.ok) return;
    
    const data = await res.json();
    const originalKey = data.s3Path.replace(`s3://${S3_BUCKET}/`, '');
    if (originalKey && !originalKey.includes('auto-')) {
        const autoKey = originalKey.replace(originalKey.split('/').pop(), originalKey.split('/').pop().replace('backup-', 'auto-backup-'));
        await s3Client.send(new CopyObjectCommand({ Bucket: S3_BUCKET, CopySource: `${S3_BUCKET}/${originalKey}`, Key: autoKey }));
        await s3Client.send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: originalKey }));
    }
    await supabaseAdmin.from('servers').update({ last_backup_at: new Date().toISOString() }).eq('id', server.id);
};

const callDaemonPower = async (server, daemonAction) => {
    const response = await fetch(`http://${server.ipv4}:3005/api/power`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${server.rcon_password}` }, body: JSON.stringify({ action: daemonAction })
    });
    if (!response.ok) throw new Error(`Daemon returned ${response.status}`);
    return await response.json();
};

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(authHeader.split(' ')[1]);
    if (authError || !user) return res.status(401).json({ error: 'Unauthorized' });

    const { serverId, action } = req.body || {};
    if (!serverId || !action) return res.status(400).json({ error: 'Missing parameters' });

    const { data: server, error: serverErr } = await supabaseAdmin.from('servers').select('*').eq('id', serverId).single();
    if (serverErr || !server) return res.status(404).json({ error: 'Server not found' });
    
    const permissionMap = { start: 'control', stop: 'control', restart: 'control', hard_restart: 'control', kill: 'control', delete: 'admin' };
    const access = await verifyServerAccess(supabaseAdmin, serverId, user.id, permissionMap[action]);
    if (!access.allowed) return res.status(403).json({ error: 'Forbidden' });

    // --- DECOUPLED ROUTING LOGIC ---
    const billingType = (server.billing_type || '').toLowerCase().trim();
    const isMonthly = billingType === 'monthly';
    const vpsIsRunning = server.status === 'Running' && server.ipv4;

    let targetRoute = 'hetzner'; 
    if (vpsIsRunning && ['start', 'stop', 'restart', 'kill', 'hard_restart'].includes(action)) {
        if (action === 'stop' && !isMonthly) {
            targetRoute = 'hetzner'; // Hourly servers are destroyed to save money
        } else if (action === 'hard_restart') {
            targetRoute = 'hetzner'; // Force OS reboot
        } else {
            targetRoute = 'daemon'; // Talk directly to the game wrapper (leaves VPS alone)
        }
    }

    const nowIso = new Date().toISOString();
    let sessionId = server.current_session_id;
    if (action === 'start' && !sessionId) sessionId = uuidv4();

    // ========================================================================
    // STOP / KILL / DELETE ACTIONS
    // ========================================================================
    if (action === 'delete' || action === 'stop' || action === 'kill') {
      await billRemainingTime(supabaseAdmin, server);

      if (action === 'stop' && server.auto_backup_enabled && server.hetzner_id && vpsIsRunning) {
          try { await performAutoBackup(server, supabaseAdmin); } catch (e) {}
      }

      const shouldDeleteVps = action === 'delete' || (!isMonthly && (action === 'stop' || action === 'kill'));

      if (targetRoute === 'daemon') {
          try { await callDaemonPower(server, action === 'kill' ? 'stop' : 'stop'); } catch (e) {}
      } else if (server.hetzner_id) {
          if (action === 'stop' || action === 'delete') {
              try { await hetznerDoAction(server.hetzner_id, 'shutdown'); await waitForServerStatus(server.hetzner_id, 'off', 30, 5000); } catch (e) {}
          } else if (action === 'kill') {
              try { await hetznerDoAction(server.hetzner_id, 'poweroff'); } catch (e) {}
          }
          if (shouldDeleteVps) {
              try { await hetznerDeleteServer(server.hetzner_id); } catch (e) { return res.status(502).json({ error: 'Failed to delete server from Hetzner' }); }
          }
      }

      if (server.subdomain && shouldDeleteVps) try { await deleteCloudflareRecords(server.subdomain); } catch (e) {}

      if (action === 'delete') {
        await supabaseAdmin.from('server_audit_logs').insert({ server_id: serverId, user_id: user.id, action_type: 'server_delete', details: 'Server deleted permanently' });
        try {
            await supabaseAdmin.from('pool_transactions').delete().eq('server_id', serverId);
            await supabaseAdmin.from('server_permissions').delete().eq('server_id', serverId);
            await supabaseAdmin.from('allocations').delete().eq('server_id', serverId);
            await supabaseAdmin.from('server_console').delete().eq('server_id', serverId);
            await supabaseAdmin.from('installed_software').delete().eq('server_id', serverId);
        } catch (e) {}
        await supabaseAdmin.from('servers').delete().eq('id', serverId);
        try { await deleteS3ServerFolderFast(server.id); } catch (e) {}
      } else {
        const updatePayload = {
            game_status: 'Stopped', running_since: null, current_session_id: null, last_heartbeat_at: nowIso, last_empty_at: null, started_at: null
        };
        
        if (targetRoute === 'hetzner') {
            updatePayload.status = 'Stopped';
            if (shouldDeleteVps) {
                updatePayload.hetzner_id = null;
                updatePayload.ipv4 = null;
            }
        }

        if (!isMonthly) {
            updatePayload.last_billed_at = null;
            updatePayload.runtime_accumulated_seconds = 0;
        }

        await supabaseAdmin.from('servers').update(updatePayload).eq('id', serverId);
        await supabaseAdmin.from('server_audit_logs').insert({ server_id: serverId, user_id: user.id, action_type: `server_${action}`, details: `Action ${action} executed` });
      }

      return res.status(200).json({ ok: true });
    }

    // ========================================================================
    // START / RESTART ACTIONS
    // ========================================================================
    if (!server.hetzner_id) return res.status(400).json({ error: 'Server not provisioned on Hetzner' });

    if (targetRoute === 'daemon') {
        try { await callDaemonPower(server, action === 'start' ? 'start' : 'restart'); } catch (err) { return res.status(502).json({ error: 'VPS Daemon failed' }); }
        
        const updateFields = { game_status: 'Starting', runtime_accumulated_seconds: 0, last_empty_at: null, started_at: nowIso, running_since: nowIso };
        if (!isMonthly) updateFields.last_billed_at = nowIso;
        if (action === 'start') updateFields.current_session_id = sessionId;

        await supabaseAdmin.from('servers').update(updateFields).eq('id', serverId);
        await supabaseAdmin.from('server_audit_logs').insert({ server_id: serverId, user_id: user.id, action_type: `server_${action}`, details: `Daemon ${action} executed` });
        
        return res.status(200).json({ ok: true });
    }

    // Hard Hardware Actions
    let hetAction = action === 'start' ? 'poweron' : 'reboot';
    const hetRes = await hetznerDoAction(server.hetzner_id, hetAction);

    const updateFields = { status: 'Starting', game_status: 'Starting', runtime_accumulated_seconds: 0, last_empty_at: null, started_at: nowIso };
    if (!isMonthly) updateFields.last_billed_at = nowIso;
    if (action === 'start' && sessionId) updateFields.current_session_id = sessionId;

    await supabaseAdmin.from('servers').update(updateFields).eq('id', serverId);
    await new Promise(resolve => setTimeout(resolve, 15000));
    
    const hetznerServer = await hetznerGetServer(server.hetzner_id);
    let finalStatus = 'Starting';
    if (hetznerServer?.server?.status === 'running') finalStatus = 'Running';

    await supabaseAdmin.from('servers').update({ status: finalStatus }).eq('id', serverId);
    await supabaseAdmin.from('server_audit_logs').insert({ server_id: serverId, user_id: user.id, action_type: `server_${action}`, details: `Hardware ${action} initiated.` });

    return res.status(200).json({ ok: true, hetznerAction: hetRes });
  } catch (err) { return res.status(500).json({ error: 'Internal server error', detail: String(err) }); }
}