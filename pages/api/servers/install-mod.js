// pages/api/servers/install-mod.js
import { createClient } from '@supabase/supabase-js';
import AWS from 'aws-sdk';
import path from 'path';

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
  'spigotmc.org'
];

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // --- 1. Authentication ---
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized', detail: 'Missing Authorization header' });
  }
  const token = authHeader.split(' ')[1];
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

  if (authError || !user) {
    return res.status(401).json({ error: 'Unauthorized', detail: 'Invalid token' });
  }

  const { serverId, downloadUrl, filename, folder } = req.body;
  if (!serverId || !downloadUrl || !filename || !folder) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }

  // --- 2. Authorization (Ownership Check) ---
  const { data: server, error: serverError } = await supabaseAdmin
    .from('servers')
    .select('user_id')
    .eq('id', serverId)
    .single();
  
  if (serverError || !server) {
    return res.status(404).json({ error: 'Server not found' });
  }
  
  if (server.user_id !== user.id) {
    return res.status(403).json({ error: 'Forbidden', detail: 'You do not own this server' });
  }

  // --- 3. SSRF Protection ---
  try {
    const urlObj = new URL(downloadUrl);
    // Check if the hostname ends with any of the allowed domains
    const isAllowed = ALLOWED_DOMAINS.some(domain => urlObj.hostname === domain || urlObj.hostname.endsWith('.' + domain));
    
    if (!isAllowed) {
       console.warn(`[Security] Blocked download from disallowed domain: ${urlObj.hostname}`);
       return res.status(400).json({ error: 'Download domain not allowed' });
    }
  } catch (e) {
    return res.status(400).json({ error: 'Invalid URL format' });
  }

  // --- 4. Path Traversal Protection ---
  // Ensure filename and folder do not contain ".." or "/"
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    return res.status(400).json({ error: 'Invalid filename' });
  }
  if (folder.includes('..')) {
     return res.status(400).json({ error: 'Invalid folder path' });
  }
  
  // Validate allowed folders to prevent arbitrary writes
  const allowedFolders = ['mods', 'plugins', 'libraries', 'config'];
  if (!allowedFolders.includes(folder)) {
      return res.status(400).json({ error: 'Invalid target folder' });
  }

  const s3Config = {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION,
    endpoint: process.env.S3_ENDPOINT || undefined,
    s3ForcePathStyle: !!process.env.S3_ENDPOINT,
  };

  const s3 = new AWS.S3(s3Config);

  try {
    const fileRes = await fetch(downloadUrl);
    if (!fileRes.ok) {
      throw new Error(`Failed to download file: ${fileRes.statusText}`);
    }
    const arrayBuffer = await fileRes.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const key = `servers/${serverId}/${folder}/${filename}`;

    await s3.putObject({
      Bucket: process.env.S3_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: 'application/java-archive',
    }).promise();

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Error installing mod/plugin:', err.message, err.stack);
    return res.status(500).json({ error: 'Failed to install', detail: err.message });
  }
}