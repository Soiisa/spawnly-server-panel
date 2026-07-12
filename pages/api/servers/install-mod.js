// pages/api/servers/install-mod.js
import { createClient } from '@supabase/supabase-js';
import AWS from 'aws-sdk';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

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
  'api.spiget.org',
  'umod.org'
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
  const isRust = server.game === 'rust';
  const isSatisfactory = server.game === 'satisfactory';
  const fileApiPort = 3005;

  // ========================================================================
  // ============================ RUST MOD LOGIC ============================
  // ========================================================================
  if (isRust) {
      if (!downloadUrl || !folder) return res.status(400).json({ error: 'downloadUrl and folder required for Rust.' });
      if (!server.ipv4) return res.status(400).json({ error: 'Server lacks an assigned public IPv4 address.' });

      try {
          const urlObj = new URL(downloadUrl);
          if (!ALLOWED_DOMAINS.some(domain => urlObj.hostname === domain || urlObj.hostname.endsWith('.' + domain))) {
              return res.status(400).json({ error: 'Download domain not allowed' });
          }

          console.log(`[Install-Mod] Downloading Rust Plugin from: ${downloadUrl}`);
          const fileRes = await fetch(downloadUrl, { redirect: 'follow' });
          if (!fileRes.ok) throw new Error(`Failed to download plugin from uMod: ${fileRes.status}`);

          // Extract filename from uMod headers, fallback to slug.cs
          let finalFilename = filename || `${modSlug}.cs`;
          const disposition = fileRes.headers.get('content-disposition');
          if (disposition && disposition.includes('filename=')) {
              finalFilename = disposition.split('filename=')[1].replace(/"/g, '');
          }

          const buffer = Buffer.from(await fileRes.arrayBuffer());
          const nodeEndpoint = `http://${server.ipv4}:${fileApiPort}/api/file?path=${folder}/${finalFilename}`;
          
          console.log(`[Install-Mod] Uploading ${finalFilename} directly to VPS Daemon`);
          const targetRes = await fetch(nodeEndpoint, {
              method: 'PUT',
              headers: { 
                  'Authorization': `Bearer ${server.rcon_password}`,
                  'Content-Type': 'application/octet-stream'
              },
              body: buffer
          });

          if (!targetRes.ok) throw new Error(`VPS Daemon rejected upload: ${targetRes.status}`);

          await supabaseAdmin.from('server_audit_logs').insert({
              server_id: serverId, user_id: user.id, action_type: 'install_mod',
              details: JSON.stringify({ game: 'rust', plugin: finalFilename }),
              created_at: new Date().toISOString()
          });

          return res.status(200).json({ success: true, message: 'Plugin installed. Oxide will auto-compile it instantly.' });
      } catch (err) {
          console.error(`[Install-Mod] Rust failure:`, err.message);
          return res.status(500).json({ error: 'Plugin installation failed.', detail: err.message });
      }
  }

  // ========================================================================
  // ======================== SATISFACTORY MOD LOGIC ========================
  // ========================================================================
  if (isSatisfactory) {
      if (!modSlug || !modVersion) return res.status(400).json({ error: 'modSlug and modVersion are required.' });
      if (!server.ipv4) return res.status(400).json({ error: 'Server lacks an assigned public IPv4 address.' });

      try {
          const targetRes = await fetch(`http://${server.ipv4}:${fileApiPort}/api/install-ficsit`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${server.rcon_password}` },
              body: JSON.stringify({ modSlug, modVersion })
          });

          if (!targetRes.ok) throw new Error(`VPS Daemon aborted with status: ${targetRes.status}`);
          
          await supabaseAdmin.from('server_audit_logs').insert({
              server_id: serverId, user_id: user.id, action_type: 'install_mod',
              details: JSON.stringify({ game: 'satisfactory', modSlug, modVersion }),
              created_at: new Date().toISOString()
          });

          return res.status(200).json({ success: true, message: 'Mod installed locally via daemon.', log: (await targetRes.json()).log });
      } catch (err) {
          return res.status(500).json({ error: 'Mod installation command aborted.', detail: err.message });
      }
  }

  // ========================================================================
  // ========================= MINECRAFT MOD LOGIC ==========================
  // ========================================================================
  if (isMinecraft) {
      if (!downloadUrl || !filename || !folder) return res.status(400).json({ error: 'downloadUrl, filename, and folder required.' });

      try {
        const urlObj = new URL(downloadUrl);
        const isAllowed = ALLOWED_DOMAINS.some(domain => urlObj.hostname === domain || urlObj.hostname.endsWith('.' + domain));
        if (!isAllowed) return res.status(400).json({ error: 'Download domain not allowed' });
      } catch (e) { return res.status(400).json({ error: 'Invalid URL format' }); }

      if (filename.includes('..') || filename.includes('/') || filename.includes('\\') || folder.includes('..')) return res.status(400).json({ error: 'Invalid path' });
      const allowedFolders = ['mods', 'plugins', 'libraries', 'config'];
      if (!allowedFolders.includes(folder)) return res.status(400).json({ error: 'Invalid target folder' });

      const s3 = new AWS.S3({ accessKeyId: process.env.AWS_ACCESS_KEY_ID, secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY, region: process.env.AWS_REGION, endpoint: process.env.S3_ENDPOINT || undefined, s3ForcePathStyle: !!process.env.S3_ENDPOINT });

      try {
        const fileRes = await fetch(downloadUrl, { headers: { 'User-Agent': 'Mozilla/5.0' }, redirect: 'follow' });
        if (!fileRes.ok) throw new Error(`Failed to download file: ${fileRes.statusText}`);
        
        const buffer = Buffer.from(await fileRes.arrayBuffer());
        await s3.putObject({ Bucket: process.env.S3_BUCKET, Key: `servers/${serverId}/${folder}/${filename}`, Body: buffer, ContentType: 'application/java-archive' }).promise();
        await supabaseAdmin.from('server_audit_logs').insert({ server_id: serverId, user_id: user.id, action_type: 'install_mod', details: JSON.stringify({ folder, filename, url: downloadUrl }), created_at: new Date().toISOString() });
        return res.status(200).json({ success: true });
      } catch (err) {
        return res.status(500).json({ error: 'Failed to install', detail: err.message });
      }
  }

  return res.status(400).json({ error: 'Mod installation is not supported for this game type via this endpoint.' });
}