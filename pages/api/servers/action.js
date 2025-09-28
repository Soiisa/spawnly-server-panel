import { createClient } from '@supabase/supabase-js';
import { S3Client, DeleteObjectsCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';

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

const deleteCloudflareRecords = async (serverId, subdomain, dnsRecordIds = [], maxRetries = 3) => {
  console.log(`[deleteCloudflareRecords] Attempting to delete DNS records for serverId: ${serverId}, subdomain: ${subdomain}, dnsRecordIds: ${JSON.stringify(dnsRecordIds)}`);
  
  // Extract subdomain prefix if full domain is provided
  let subdomainPrefix = subdomain;
  if (subdomain.endsWith(DOMAIN_SUFFIX)) {
    subdomainPrefix = subdomain.replace(DOMAIN_SUFFIX, '');
    console.log(`[deleteCloudflareRecords] Extracted subdomain prefix: ${subdomainPrefix}`);
  }

  // Validate subdomain prefix (allow uppercase letters)
  if (!subdomainPrefix || typeof subdomainPrefix !== 'string' || !subdomainPrefix.match(/^[a-zA-Z0-9-]+$/)) {
    console.warn(`[deleteCloudflareRecords] Invalid or missing subdomain prefix: ${subdomainPrefix}, skipping DNS deletion`);
    return false;
  }

  // Define record types to delete
  const recordTypes = [
    { type: 'A', name: `${subdomainPrefix}${DOMAIN_SUFFIX}` }, // e.g., paredes.spawnly.net
    { type: 'A', name: `${subdomainPrefix}-api${DOMAIN_SUFFIX}` }, // e.g., paredes-api.spawnly.net
    { type: 'SRV', name: `_minecraft._tcp.${subdomainPrefix}${DOMAIN_SUFFIX}` }, // e.g., _minecraft._tcp.paredes.spawnly.net
  ];

  let allDeleted = true;

  // First, try deleting records using dnsRecordIds from Supabase
  if (dnsRecordIds.length > 0) {
    for (const recordId of dnsRecordIds) {
      let attempt = 0;
      while (attempt < maxRetries) {
        try {
          console.log(`[deleteCloudflareRecords] Attempt ${attempt + 1}: Deleting DNS record ID ${recordId}`);
          const deleteUrl = `${CLOUDFLARE_API_BASE}/zones/${CLOUDFLARE_ZONE_ID}/dns_records/${recordId}`;
          const deleteResponse = await fetch(deleteUrl, {
            method: 'DELETE',
            headers: {
              Authorization: `Bearer ${CLOUDFLARE_API_TOKEN}`,
              'Content-Type': 'application/json',
            },
          });

          if (!deleteResponse.ok) {
            const errorText = await deleteResponse.text().catch(() => 'no-body');
            throw new Error(`Failed to delete DNS record ${recordId}: ${deleteResponse.status} ${errorText}`);
          }

          console.log(`[deleteCloudflareRecords] Successfully deleted DNS record ${recordId}`);
          break; // Success, move to next record ID
        } catch (err) {
          attempt++;
          console.error(`[deleteCloudflareRecords] Attempt ${attempt} failed for record ID ${recordId}: ${err.message}`);
          if (attempt >= maxRetries) {
            console.error(`[deleteCloudflareRecords] Failed to delete record ${recordId} after ${maxRetries} attempts: ${err.message}`);
            allDeleted = false;
          }
          await new Promise(resolve => setTimeout(resolve, 2000)); // Wait before retrying
        }
      }
    }
  }

  // Fallback: Query and delete records by type and name if dnsRecordIds are incomplete or missing
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
          // Skip if already deleted via dnsRecordIds
          if (dnsRecordIds.includes(record.id)) {
            console.log(`[deleteCloudflareRecords] Skipping already deleted record ${record.id} for ${recordType.name}`);
            continue;
          }

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
        break; // Success, move to next record type
      } catch (err) {
        attempt++;
        console.error(`[deleteCloudflareRecords] Attempt ${attempt} failed for ${recordType.type} record: ${err.message}`);
        if (attempt >= maxRetries) {
          console.error(`[deleteCloudflareRecords] Failed to delete ${recordType.type} records for ${recordType.name} after ${maxRetries} attempts: ${err.message}`);
          allDeleted = false;
        }
        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait before retrying
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
      .select('id, subdomain, hetzner_id, status, ipv4, dns_record_ids')
      .eq('id', serverId)
      .single();

    if (serverErr || !server) {
      console.error('[API:action] Server not found or error:', serverErr?.message);
      return res.status(404).json({ error: 'Server not found', detail: serverErr?.message || null });
    }
    console.log(`[API:action] Server data retrieved:`, { id: server.id, subdomain: server.subdomain, hetzner_id: server.hetzner_id, status: server.status, ipv4: server.ipv4, dns_record_ids: server.dns_record_ids });

    if (action === 'delete' || action === 'stop') {
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

      if (server.subdomain || server.dns_record_ids?.length > 0) {
        try {
          console.log(`[API:action] Deleting Cloudflare DNS records for serverId: ${server.id}, subdomain: ${server.subdomain}`);
          const dnsDeleted = await deleteCloudflareRecords(server.id, server.subdomain, server.dns_record_ids || []);
          if (!dnsDeleted) {
            console.warn(`[API:action] DNS record deletion for ${server.subdomain} was not fully successful`);
          } else {
            console.log(`[API:action] Successfully deleted DNS records for ${server.subdomain}`);
          }
        } catch (dnsErr) {
          console.error('[API:action] Failed to delete Cloudflare DNS records:', dnsErr.message);
          return res.status(502).json({ error: 'Failed to delete DNS records', detail: dnsErr.message });
        }
      } else if (server.ipv4) {
        console.warn('[API:action] No subdomain or dns_record_ids found in Supabase, checking Cloudflare for residual records with IP: ${server.ipv4}');
        try {
          const url = `${CLOUDFLARE_API_BASE}/zones/${CLOUDFLARE_ZONE_ID}/dns_records?type=A&content=${server.ipv4}`;
          const response = await fetch(url, {
            headers: {
              Authorization: `Bearer ${CLOUDFLARE_API_TOKEN}`,
              'Content-Type': 'application/json',
            },
          });

          if (response.ok) {
            const { result } = await response.json();
            console.log(`[API:action] Found ${result.length} A records with IP ${server.ipv4}`);
            for (const record of result) {
              const deleteUrl = `${CLOUDFLARE_API_BASE}/zones/${CLOUDFLARE_ZONE_ID}/dns_records/${record.id}`;
              const deleteResponse = await fetch(deleteUrl, {
                method: 'DELETE',
                headers: {
                  Authorization: `Bearer ${CLOUDFLARE_API_TOKEN}`,
                  'Content-Type': 'application/json',
                },
              });
              if (deleteResponse.ok) {
                console.log(`[API:action] Successfully deleted residual A record ${record.id} for ${record.name}`);
              } else {
                const errorText = await deleteResponse.text().catch(() => 'no-body');
                console.warn(`[API:action] Failed to delete residual A record ${record.id}: ${deleteResponse.status} ${errorText}`);
              }
            }
          } else {
            const errorText = await response.text().catch(() => 'no-body');
            console.warn(`[API:action] Failed to search for residual A records: ${response.status} ${errorText}`);
          }
        } catch (err) {
          console.error('[API:action] Error checking residual A records:', err.message);
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
        // For stop action, update Supabase to reflect stopped state
        console.log(`[API:action] Updating Supabase for server ${serverId}: setting status to 'Stopped', clearing hetzner_id and ipv4`);
        const { error: updateErr } = await supabaseAdmin
          .from('servers')
          .update({ status: 'Stopped', hetzner_id: null, ipv4: null, dns_record_ids: [] })
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

    console.log(`[API:action] Performing Hetzner action: ${hetAction} for server: ${server.hetzner_id}`);
    const hetRes = await hetznerDoAction(server.hetzner_id, hetAction);

    console.log(`[API:action] Updating server status to ${newStatus} in Supabase`);
    const { error: statusUpdateErr } = await supabaseAdmin.from('servers').update({ status: newStatus }).eq('id', serverId);
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