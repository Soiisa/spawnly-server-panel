import { createClient } from '@supabase/supabase-js';
import { 
  S3Client, 
  DeleteObjectsCommand, 
  ListObjectsV2Command 
} from '@aws-sdk/client-s3';

// --- Configuration (Same as your existing backend) ---
const HETZNER_API_BASE = 'https://api.hetzner.cloud/v1';
const CLOUDFLARE_API_BASE = 'https://api.cloudflare.com/client/v4';
const DOMAIN_SUFFIX = '.spawnly.net';
const SLEEPER_PROXY_IP = process.env.SLEEPER_PROXY_IP || '91.99.130.49';

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
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// --- Helpers (Reused logic for Admin robustness) ---

const hetznerDeleteServer = async (hetznerId) => {
  if (!hetznerId) return;
  try {
    const res = await fetch(`${HETZNER_API_BASE}/servers/${hetznerId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${process.env.HETZNER_API_TOKEN}` },
    });
    if (!res.ok && res.status !== 404) {
      console.error('Hetzner delete failed:', await res.text());
    }
  } catch (e) {
    console.error('Hetzner API error:', e.message);
  }
};

const deleteCloudflareRecords = async (subdomain) => {
  if (!subdomain) return;
  const zoneId = process.env.CLOUDFLARE_ZONE_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN;
  
  // 1. Fetch Records
  const name = `${subdomain}${DOMAIN_SUFFIX}`;
  try {
    const res = await fetch(`${CLOUDFLARE_API_BASE}/zones/${zoneId}/dns_records?name=${encodeURIComponent(name)}`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
    });
    const data = await res.json();
    
    // 2. Delete them
    if (data.result) {
      for (const record of data.result) {
        await fetch(`${CLOUDFLARE_API_BASE}/zones/${zoneId}/dns_records/${record.id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
        });
      }
    }
  } catch (e) {
    console.error('Cloudflare error:', e.message);
  }
};

const setSleeperDNS = async (subdomain) => {
  if (!subdomain) return;
  try {
    await fetch(`${CLOUDFLARE_API_BASE}/zones/${process.env.CLOUDFLARE_ZONE_ID}/dns_records`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'A',
        name: `${subdomain}${DOMAIN_SUFFIX}`,
        content: SLEEPER_PROXY_IP,
        ttl: 60, 
        proxied: false 
      })
    });
  } catch (e) {}
};

const deleteS3Data = async (serverId) => {
  try {
    const listCmd = new ListObjectsV2Command({
      Bucket: process.env.S3_BUCKET,
      Prefix: `servers/${serverId}/`,
    });
    const list = await s3Client.send(listCmd);
    if (list.Contents?.length > 0) {
      await s3Client.send(new DeleteObjectsCommand({
        Bucket: process.env.S3_BUCKET,
        Delete: { Objects: list.Contents.map(o => ({ Key: o.Key })) }
      }));
    }
  } catch (e) {
    console.error('S3 delete error:', e.message);
  }
};

// --- Main Handler ---

export default async function handler(req, res) {
  // 1. Auth Check
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'No token' });
  const token = authHeader.split(' ')[1];
  
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !user) return res.status(401).json({ error: 'Invalid token' });

  // Verify Admin
  const { data: adminProfile } = await supabaseAdmin
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single();

  if (!adminProfile?.is_admin) return res.status(403).json({ error: 'Forbidden' });

  // 2. GET: List Servers
  if (req.method === 'GET') {
    try {
      const { search } = req.query;

      // Fetch Servers
      const { data: servers, error: serverError } = await supabaseAdmin
        .from('servers')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (serverError) throw serverError;

      // Fetch Users (to map IDs to Emails)
      const { data: { users: authUsers } } = await supabaseAdmin.auth.admin.listUsers();
      const userMap = {};
      authUsers.forEach(u => userMap[u.id] = u.email);

      // Combine Data
      let result = servers.map(s => ({
        ...s,
        owner_email: userMap[s.user_id] || 'Unknown User'
      }));

      // Filter
      if (search) {
        const lower = search.toLowerCase();
        result = result.filter(s => 
          s.name.toLowerCase().includes(lower) || 
          s.owner_email.toLowerCase().includes(lower) ||
          s.id.includes(lower)
        );
      }

      return res.status(200).json({ servers: result });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ error: 'Failed to fetch servers' });
    }
  }

  // 3. POST: Actions
  if (req.method === 'POST') {
    const { action, serverId } = req.body;
    if (!serverId) return res.status(400).json({ error: 'Missing serverId' });

    // Fetch target server
    const { data: server } = await supabaseAdmin.from('servers').select('*').eq('id', serverId).single();
    if (!server) return res.status(404).json({ error: 'Server not found' });

    try {
      if (action === 'force_stop') {
        // 1. Delete VPS
        if (server.hetzner_id) await hetznerDeleteServer(server.hetzner_id);
        
        // 2. Reset DNS to Sleeper
        if (server.subdomain) {
          await deleteCloudflareRecords(server.subdomain);
          await setSleeperDNS(server.subdomain);
        }

        // 3. Update DB
        await supabaseAdmin.from('servers').update({
          status: 'Stopped',
          hetzner_id: null,
          ipv4: null,
          last_billed_at: null,
          runtime_accumulated_seconds: 0,
          current_session_id: null
        }).eq('id', serverId);

        return res.status(200).json({ success: true, message: 'Server Force Stopped' });
      }

      if (action === 'delete') {
        // 1. Delete VPS
        if (server.hetzner_id) await hetznerDeleteServer(server.hetzner_id);
        
        // 2. Delete DNS
        if (server.subdomain) await deleteCloudflareRecords(server.subdomain);

        // 3. Delete S3 Files
        await deleteS3Data(serverId);

        // 4. Delete DB Record
        await supabaseAdmin.from('servers').delete().eq('id', serverId);

        return res.status(200).json({ success: true, message: 'Server Deleted' });
      }

      return res.status(400).json({ error: 'Invalid action' });

    } catch (e) {
      console.error('Admin action error:', e);
      return res.status(500).json({ error: 'Action failed', detail: e.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}