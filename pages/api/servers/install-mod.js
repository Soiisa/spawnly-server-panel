// pages/api/servers/install-mod.js
import { createClient } from '@supabase/supabase-js';
import AWS from 'aws-sdk';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Allowed domains for mod/plugin downloads to prevent SSRF
const ALLOWED_DOMAINS = [
  'cdn.modrinth.com',
  'edge.forgecdn.net',
  'mediafilez.forgecdn.net',
  'github.com',
  'raw.githubusercontent.com',
  'api.papermc.io',
  'cdn.getbukkit.org',
  'buk.kit',
  'spigotmc.org',
  'api.spiget.org'
];

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // --- 1. Authentication ---
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized', detail: 'Missing Authorization header' });
  }
  const token = authHeader.split(' ')[1];
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

  if (authError || !user) return res.status(401).json({ error: 'Unauthorized', detail: 'Invalid token' });

  const { serverId, downloadUrl, filename, folder, modSlug, modVersion } = req.body;
  if (!serverId) return res.status(400).json({ error: 'Missing serverId parameter' });

  // --- 2. Authorization (Ownership Check) ---
  const { data: server, error: serverError } = await supabaseAdmin.from('servers').select('*').eq('id', serverId).single();
  if (serverError || !server) return res.status(404).json({ error: 'Server not found' });
  if (server.user_id !== user.id) return res.status(403).json({ error: 'Forbidden', detail: 'You do not own this server' });

  const isMinecraft = !server.game || server.game === 'minecraft';
  const fileApiPort = 3005;

  // ========================================================================
  // ======================== SATISFACTORY MOD LOGIC ========================
  // ========================================================================
  if (!isMinecraft) {
      if (!modSlug || !modVersion) return res.status(400).json({ error: 'modSlug and modVersion are required for Steam modifications.' });
      if (!server.ipv4) return res.status(400).json({ error: 'Server lacks an assigned public IPv4 address.' });

      const nodeEndpoint = `http://${server.ipv4}:${fileApiPort}/api/install-ficsit`;

      try {
          console.log(`[Install-Mod] Dispatching HTTP POST to Steam VPS: ${nodeEndpoint}`);
          const targetRes = await fetch(nodeEndpoint, {
              method: 'POST',
              headers: { 
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${server.rcon_password}` // FIXED: Pass the password as a Bearer token
              },
              body: JSON.stringify({ modSlug, modVersion })
          });

          if (!targetRes.ok) {
              const errorData = await targetRes.json().catch(() => ({}));
              throw new Error(errorData.error || `VPS Daemon aborted with status: ${targetRes.status}`);
          }

          const resultData = await targetRes.json();
          
          await supabaseAdmin.from('server_audit_logs').insert({
              server_id: serverId,
              user_id: user.id,
              action_type: 'install_mod',
              details: JSON.stringify({ game: server.game, modSlug, modVersion }),
              created_at: new Date().toISOString()
          });

          return res.status(200).json({ success: true, message: 'Mod installed locally via daemon.', log: resultData.log });
      } catch (err) {
          console.error(`[Install-Mod] Steam HTTP failure:`, err.message);
          return res.status(500).json({ error: 'Mod installation command aborted.', detail: err.message });
      }
  }

  // ========================================================================
  // ========================= MINECRAFT MOD LOGIC ==========================
  // ========================================================================
  if (!downloadUrl || !filename || !folder) return res.status(400).json({ error: 'downloadUrl, filename, and folder required for Minecraft.' });

  try {
    const urlObj = new URL(downloadUrl);
    const isAllowed = ALLOWED_DOMAINS.some(domain => urlObj.hostname === domain || urlObj.hostname.endsWith('.' + domain));
    if (!isAllowed) return res.status(400).json({ error: 'Download domain not allowed' });
  } catch (e) { return res.status(400).json({ error: 'Invalid URL format' }); }

  if (filename.includes('..') || filename.includes('/') || filename.includes('\\') || folder.includes('..')) return res.status(400).json({ error: 'Invalid path' });
  
  const allowedFolders = ['mods', 'plugins', 'libraries', 'config'];
  if (!allowedFolders.includes(folder)) return res.status(400).json({ error: 'Invalid target folder' });

  const s3Config = { accessKeyId: process.env.AWS_ACCESS_KEY_ID, secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY, region: process.env.AWS_REGION, endpoint: process.env.S3_ENDPOINT || undefined, s3ForcePathStyle: !!process.env.S3_ENDPOINT };
  const s3 = new AWS.S3(s3Config);

  try {
    console.log(`[Install-Mod] Downloading from: ${downloadUrl}`);
    const fileRes = await fetch(downloadUrl, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': '*/*',
            'Referer': 'https://www.google.com/'
        },
        redirect: 'follow'
    });

    if (!fileRes.ok) throw new Error(`Failed to download file: ${fileRes.statusText} (${fileRes.status})`);
    
    const buffer = Buffer.from(await fileRes.arrayBuffer());
    const key = `servers/${serverId}/${folder}/${filename}`;

    await s3.putObject({ Bucket: process.env.S3_BUCKET, Key: key, Body: buffer, ContentType: 'application/java-archive' }).promise();

    await supabaseAdmin.from('server_audit_logs').insert({ server_id: serverId, user_id: user.id, action_type: 'install_mod', details: JSON.stringify({ folder, filename, url: downloadUrl }), created_at: new Date().toISOString() });

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('[Install-Mod] Error:', err.message);
    return res.status(500).json({ error: 'Failed to install', detail: err.message });
  }
}