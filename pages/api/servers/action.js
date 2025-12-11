// pages/api/servers/action.js
import { createClient } from '@supabase/supabase-js';
import { S3Client, DeleteObjectsCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { v4 as uuidv4 } from 'uuid';

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

// The IP of the Sleeper Proxy Server created in Step 2
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
    console.log(`[deleteCloudflareRecords] Extracted subdomain prefix: ${subdomainPrefix}`);
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
          const errorText = await response.text().catch(() => 'no-body');
          throw new Error(`Cloudflare ${recordType.type} record lookup failed: ${response.status} ${errorText}`);
        }

        const { result } = await response.json();
        console.log(`[deleteCloudflareRecords] Found ${result.length} ${recordType.type} records for ${recordType.name}`);

        for (const record of result) {
          const deleteUrl = `${CLOUDFLARE_API_BASE}/zones/${CLOUDFLARE_ZONE_ID}/dns_records/${record.id}`;
          const deleteResponse = await fetch(deleteUrl, {
            method: 'DELETE',
            headers: {
              Authorization: `Bearer ${CLOUDFLARE_API_TOKEN}`,
              'Content-Type': 'application/json',
            },
          });

          if (!deleteResponse.ok) {
            const errorText = await deleteResponse.text().catch(() => 'no-body');
            console.warn(`[deleteCloudflareRecords] Failed to delete ${record.type} record ${record.id}: ${deleteResponse.status} ${errorText}`);
            allDeleted = false;
          } else {
            console.log(`[deleteCloudflareRecords] Successfully deleted ${record.type} record ${record.id} for ${recordType.name}`);
          }
        }
        break;
      } catch (err) {
        attempt++;
        console.error(`[deleteCloudflareRecords] Attempt ${attempt} failed for ${recordType.type} record: ${err.message}`);
        if (attempt >= maxRetries) {
          console.error(`[deleteCloudflareRecords] Failed to delete ${recordType.type} records for ${recordType.name} after ${maxRetries} attempts: ${err.message}`);
          allDeleted = false;
        }
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
  }
  console.log(`[deleteCloudflareRecords] DNS deletion result for ${subdomainPrefix}: ${allDeleted ? 'success' : 'partial or failed'}`);
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
  if (server.status !== 'Running') return;

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

  await deductCredits(supabaseAdmin, server.user_id, cost, `Final runtime charge for server ${server.id} (${elapsedSeconds} seconds)`, server.current_session_id);

  try {
    await supabaseAdmin.from('servers').update({ last_billed_at: now.toISOString(), runtime_accumulated_seconds: 0 }).eq('id', server.id);
  } catch (e) {
    console.error('[billRemainingTime] Failed to update server billing fields:', e && e.message);
  }
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  try {
    console.log('[API:action] Received request:', { method: req.method, body: req.body });
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!HETZNER_TOKEN || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !S3_ENDPOINT || !S3_BUCKET || !S3_REGION || !AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY || !CLOUDFLARE_API_TOKEN || !CLOUDFLARE_ZONE_ID) {
      console.error('[API:action] Missing environment variables');
      return res.status(500).json({ error: 'Missing env vars' });
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

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
    console.log(`[API:action] Server data retrieved:`, { id: server.id, subdomain: server.subdomain, hetzner_id: server.hetzner_id, status: server.status, ipv4: server.ipv4, current_session_id: server.current_session_id });

    const { data: profile, error: profileErr } = await supabaseAdmin.from('profiles').select('credits').eq('id', server.user_id).single();
    if (profileErr || !profile) return res.status(500).json({ error: 'Failed to fetch user profile' });

    if (action === 'start' || action === 'restart') {
      const minCost = (server.cost_per_hour / 60) * 5;
      if (profile.credits < minCost) {
        return res.status(402).json({ error: 'Insufficient credits to start server' });
      }
    }

    if (action === 'delete' || action === 'stop') {
      await billRemainingTime(supabaseAdmin, server);

      if (server.hetzner_id && server.status === 'Running') {
        try {
          console.log(`[API:action] Shutting down Hetzner server: ${server.hetzner_id}`);
          await hetznerDoAction(server.hetzner_id, 'shutdown');
          const isOff = await waitForServerStatus(server.hetzner_id, 'off', 30, 5000);
          if (!isOff) {
            console.warn(`[API:action] Server ${server.hetzner_id} did not reach 'off' status in time, proceeding with deletion`);
          }
        } catch (stopErr) {
          console.error('[API:action] Failed to stop server before deletion:', stopErr.message);
          return res.status(502).json({ error: 'Failed to stop server before deletion', detail: stopErr.message });
        }
      }

      if (server.hetzner_id) {
        try {
          await hetznerDeleteServer(server.hetzner_id);
        } catch (hetznerErr) {
          console.error('[API:action] Failed to delete server from Hetzner:', hetznerErr.message);
          return res.status(502).json({ error: 'Failed to delete server from Hetzner', detail: hetznerErr.message });
        }
      }

      if (server.subdomain) {
        try {
          console.log(`[API:action] Cleaning up DNS records for subdomain: ${server.subdomain}`);
          
          // 1. Always delete the specific IP records (Hetzner IP) first
          await deleteCloudflareRecords(server.subdomain);

          // 2. IF STOPPING: Point DNS to Sleeper Proxy
          if (action === 'stop') {
            console.log(`[API:action] Pointing ${server.subdomain} to Sleeper Proxy (${SLEEPER_PROXY_IP})`);
            const dnsUrl = `${CLOUDFLARE_API_BASE}/zones/${CLOUDFLARE_ZONE_ID}/dns_records`;
            
            await fetch(dnsUrl, {
              method: 'POST',
              headers: { Authorization: `Bearer ${CLOUDFLARE_API_TOKEN}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                type: 'A',
                name: `${server.subdomain}${DOMAIN_SUFFIX}`,
                content: SLEEPER_PROXY_IP,
                ttl: 60, // Short TTL for fast propagation when starting
                proxied: false 
              })
            });
          }
        } catch (dnsErr) {
          console.error('[API:action] Failed to update Cloudflare DNS records:', dnsErr.message);
          // Don't fail the whole request, but log it
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
        console.log(`[API:action] Updating Supabase for server ${serverId}: setting status to 'Stopped', clearing hetzner_id and ipv4`);
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
            current_session_id: null, // ← CLEARED ON STOP
            last_heartbeat_at: nowIso,
            last_empty_at: null // ← CLEARED ON STOP (Fix for auto-stop loop)
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

    if (!server.hetzner_id) {
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

    // Generate new session ID on fresh start (after stop)
    let sessionId = server.current_session_id;
    if (action === 'start' && !sessionId) { // Falsy check for null/undefined
      sessionId = uuidv4(); // ← NEW UUID EVERY FRESH START
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
      last_empty_at: null // ← CLEARED ON START/RESTART
    };
    if (action === 'start' && sessionId && sessionId !== server.current_session_id) {
      updateFields.current_session_id = sessionId; // ← SET NEW SESSION ID
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