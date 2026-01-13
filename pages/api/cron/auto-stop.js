// pages/api/cron/auto-stop.js
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CRON_SECRET = process.env.CRON_SECRET;
const HETZNER_API_TOKEN = process.env.HETZNER_API_TOKEN;
const CLOUDFLARE_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const CLOUDFLARE_ZONE_ID = process.env.CLOUDFLARE_ZONE_ID;
const DOMAIN_SUFFIX = '.spawnly.net';
const SLEEPER_PROXY_IP = process.env.SLEEPER_PROXY_IP || '91.99.130.49';

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// --- SHARED HELPERS ---

const hetznerDoAction = async (hetznerId, action) => {
  const url = `https://api.hetzner.cloud/v1/servers/${hetznerId}/actions/${action}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${HETZNER_API_TOKEN}`, 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(`Hetzner action ${action} failed: ${res.status}`);
  return res.json();
};

const waitForServerStatus = async (hetznerId, targetStatus) => {
  for (let i = 0; i < 20; i++) { // Max ~100 seconds
    const r = await fetch(`https://api.hetzner.cloud/v1/servers/${hetznerId}`, {
      headers: { Authorization: `Bearer ${HETZNER_API_TOKEN}` }
    });
    const data = await r.json();
    if (data?.server?.status === targetStatus) return true;
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
  return false;
};

const deleteCloudflareRecords = async (subdomain) => {
  const cleanSub = subdomain.replace(DOMAIN_SUFFIX, '');
  const url = `https://api.cloudflare.com/client/v4/zones/${CLOUDFLARE_ZONE_ID}/dns_records`;
  
  const searchUrls = [
    `${url}?type=A&name=${cleanSub}${DOMAIN_SUFFIX}`,
    `${url}?type=SRV&name=_minecraft._tcp.${cleanSub}${DOMAIN_SUFFIX}`
  ];

  for (const sUrl of searchUrls) {
    const res = await fetch(sUrl, { headers: { Authorization: `Bearer ${CLOUDFLARE_API_TOKEN}` } });
    const { result } = await res.json();
    for (const record of result || []) {
      await fetch(`${url}/${record.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${CLOUDFLARE_API_TOKEN}` } });
    }
  }
};

async function billRemainingTime(server) {
  if (server.status !== 'Running') return;
  const now = new Date();
  let baseTime = server.last_billed_at ? new Date(server.last_billed_at) : (server.running_since ? new Date(server.running_since) : null);
  if (!baseTime) return;

  const elapsedSeconds = Math.floor((now - baseTime) / 1000) + (server.runtime_accumulated_seconds || 0);
  if (elapsedSeconds < 60) return;

  const hours = elapsedSeconds / 3600;
  const cost = hours * server.cost_per_hour;

  const { data: profile } = await supabaseAdmin.from('profiles').select('credits').eq('id', server.user_id).single();
  if (profile) {
    await supabaseAdmin.from('profiles').update({ credits: profile.credits - cost }).eq('id', server.user_id);
    await supabaseAdmin.from('credit_transactions').insert({
      user_id: server.user_id, amount: -cost, type: 'usage',
      description: `Auto-stop charge (${elapsedSeconds}s)`, session_id: server.current_session_id
    });
  }
}

// --- MAIN CRON HANDLER ---

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  
  const cronHeader = req.headers['x-cron-secret'] || req.headers.authorization?.split(' ')[1];
  if (!CRON_SECRET || cronHeader !== CRON_SECRET) return res.status(401).json({ error: 'Unauthorized' });

  const { data: servers, error } = await supabaseAdmin
    .from('servers')
    .select('*')
    .eq('status', 'Running')
    .gt('auto_stop_timeout', 0)
    .not('last_empty_at', 'is', null);

  if (error) return res.status(500).json({ error: 'Database error' });

  console.log(`[Auto-Stop] Checking ${servers?.length || 0} potentially empty servers...`);
  
  const now = new Date();
  let stoppedCount = 0;

  for (const server of servers || []) {
    const lastEmpty = new Date(server.last_empty_at);
    const emptyMinutes = (now - lastEmpty) / 1000 / 60;

    if (emptyMinutes >= server.auto_stop_timeout) {
      console.log(`[Auto-Stop] Processing full teardown for ${server.id}`);

      try {
        // 1. Billing
        await billRemainingTime(server);

        // 2. Infrastructure Shutdown
        if (server.hetzner_id) {
          await hetznerDoAction(server.hetzner_id, 'shutdown');
          await waitForServerStatus(server.hetzner_id, 'off'); 
          await fetch(`https://api.hetzner.cloud/v1/servers/${server.hetzner_id}`, {
            method: 'DELETE', headers: { Authorization: `Bearer ${HETZNER_API_TOKEN}` }
          });
        }

        // 3. DNS Cleanup & Redirect
        if (server.subdomain) {
          await deleteCloudflareRecords(server.subdomain);
          await fetch(`https://api.cloudflare.com/client/v4/zones/${CLOUDFLARE_ZONE_ID}/dns_records`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${CLOUDFLARE_API_TOKEN}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'A', name: `${server.subdomain}${DOMAIN_SUFFIX}`, content: SLEEPER_PROXY_IP, ttl: 60, proxied: false
            })
          });
        }

        // 4. Update Database
        await supabaseAdmin.from('servers').update({
          status: 'Stopped', hetzner_id: null, ipv4: null, last_billed_at: null,
          runtime_accumulated_seconds: 0, running_since: null, current_session_id: null,
          last_empty_at: null
        }).eq('id', server.id);

        // [NEW] 5. Insert Audit Log
        await supabaseAdmin.from('server_audit_logs').insert({
          server_id: server.id,
          user_id: null, // System action
          action_type: 'AUTO_STOP',
          details: `Server auto-stopped after ${server.auto_stop_timeout} mins of inactivity.`,
          created_at: new Date().toISOString()
        });

        stoppedCount++;
      } catch (err) {
        console.error(`[Auto-Stop] Failed teardown for ${server.id}:`, err.message);
      }
    }
  }

  res.status(200).json({ success: true, stopped: stoppedCount });
}