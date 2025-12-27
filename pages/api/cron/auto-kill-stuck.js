// pages/api/cron/auto-kill-stuck.js
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

// --- SHARED HELPERS (Duplicated to be self-contained) ---

const deleteCloudflareRecords = async (subdomain) => {
  const cleanSub = subdomain.replace(DOMAIN_SUFFIX, '');
  const url = `https://api.cloudflare.com/client/v4/zones/${CLOUDFLARE_ZONE_ID}/dns_records`;
  
  // Search for A and SRV records
  const searchUrls = [
    `${url}?type=A&name=${cleanSub}${DOMAIN_SUFFIX}`,
    `${url}?type=SRV&name=_minecraft._tcp.${cleanSub}${DOMAIN_SUFFIX}`
  ];

  for (const sUrl of searchUrls) {
    try {
        const res = await fetch(sUrl, { headers: { Authorization: `Bearer ${CLOUDFLARE_API_TOKEN}` } });
        const { result } = await res.json();
        for (const record of result || []) {
        await fetch(`${url}/${record.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${CLOUDFLARE_API_TOKEN}` } });
        }
    } catch(e) { console.error('DNS Cleanup error:', e.message); }
  }
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  
  const cronHeader = req.headers['x-cron-secret'] || req.headers.authorization?.split(' ')[1];
  if (!CRON_SECRET || cronHeader !== CRON_SECRET) return res.status(401).json({ error: 'Unauthorized' });

  // 1. Identify Stuck Servers
  // Logic: Status is 'Initializing' or 'Starting' AND started_at was > 30 mins ago.
  const timeLimit = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  
  const { data: servers, error } = await supabaseAdmin
    .from('servers')
    .select('*')
    .in('status', ['Initializing', 'Starting'])
    // --- UPDATED QUERY ---
    .lt('started_at', timeLimit)
    .not('started_at', 'is', null) // Ensure started_at is present
    .not('hetzner_id', 'is', null); // Only kill if provisioned

  if (error) return res.status(500).json({ error: 'Database error', detail: error.message });

  let killedCount = 0;

  for (const server of servers || []) {
    console.log(`[Auto-Kill] Killing stuck server ${server.id} (Status: ${server.status}, Started At: ${server.started_at})`);

    try {
      // 2. Kill Infrastructure (Skip graceful shutdown)
      if (server.hetzner_id) {
        // Just delete immediately
        const delRes = await fetch(`https://api.hetzner.cloud/v1/servers/${server.hetzner_id}`, {
          method: 'DELETE', headers: { Authorization: `Bearer ${HETZNER_API_TOKEN}` }
        });
        
        if (delRes.status === 404) console.log(`[Auto-Kill] Server ${server.hetzner_id} already gone.`);
        else if (!delRes.ok) console.error(`[Auto-Kill] Hetzner delete failed: ${delRes.status}`);
      }

      // 3. Reset DNS to Sleeper
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
        started_at: null // --- CLEAN UP STARTED_AT ---
      }).eq('id', server.id);

      killedCount++;
    } catch (err) {
      console.error(`[Auto-Kill] Failed to kill ${server.id}:`, err.message);
    }
  }

  res.status(200).json({ success: true, killed: killedCount });
}