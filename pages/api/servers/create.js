// pages/api/servers/create.js

import { createClient } from '@supabase/supabase-js';
import AWS from 'aws-sdk';
import crypto from 'crypto';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const S3_BUCKET = process.env.S3_BUCKET;
const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID;
const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY;
const AWS_REGION = process.env.AWS_REGION || 'eu-central-1';
const S3_ENDPOINT = process.env.S3_ENDPOINT;

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Configure AWS SDK for S3
const s3 = new AWS.S3({
  accessKeyId: AWS_ACCESS_KEY_ID,
  secretAccessKey: AWS_SECRET_ACCESS_KEY,
  region: AWS_REGION,
  endpoint: S3_ENDPOINT || undefined,
  s3ForcePathStyle: !!S3_ENDPOINT,
});

// Sanitize subdomain to be DNS-friendly
const sanitizeSubdomain = (name) => {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-') // Replace invalid chars with hyphens
    .replace(/-+/g, '-') // Collapse multiple hyphens
    .replace(/^-|-$/g, '') // Trim leading/trailing hyphens
    .slice(0, 63); // Ensure max length
};

const DEFAULT_PROPERTIES = `#Minecraft server properties
spawn-protection=16
max-tick-time=60000
query.port=25565
generator-settings=
force-gamemode=false
allow-nether=true
enforce-whitelist=false
gamemode=survival
broadcast-console-to-ops=true
enable-query=false
player-idle-timeout=0
difficulty=easy
spawn-monsters=true
op-permission-level=4
pvp=true
snooper-enabled=true
level-type=default
hardcore=false
enable-command-block=false
max-players=20
network-compression-threshold=256
resource-pack-sha1=
max-world-size=29999984
rcon.port=25575
server-port=25565
server-ip=
spawn-npcs=true
allow-flight=false
level-name=world
view-distance=10
resource-pack=
spawn-animals=true
white-list=false
rcon.password=
generate-structures=true
online-mode=true
max-build-height=256
level-seed=
prevent-proxy-connections=false
use-native-transport=true
motd=A Spawnly Server
enable-rcon=true
`;

const EULA_TXT = `#By changing the setting below to TRUE you are indicating your agreement to our EULA (https://account.mojang.com/documents/minecraft_eula).
eula=true
`;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  
  // Validate Env Vars
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'Missing Supabase server env vars' });
  }
  if (!S3_BUCKET || !AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) {
    return res.status(500).json({ error: 'Missing S3 configuration env vars' });
  }

  const { name, game = 'minecraft', software = 'paper', version = null, ram = 4, costPerHour = 0, userId, subdomain } = req.body;
  if (!name || !userId) return res.status(400).json({ error: 'Missing required fields: name, userId' });

  // Use provided subdomain or derive from name
  const finalSubdomain = subdomain ? sanitizeSubdomain(subdomain) : sanitizeSubdomain(name);

  // Validate subdomain
  if (!finalSubdomain || finalSubdomain.length < 1 || finalSubdomain.length > 63) {
    return res.status(400).json({ error: 'Invalid subdomain', detail: 'Subdomain must be 1-63 chars, alphanumeric with hyphens' });
  }

  try {
    // Check for subdomain conflict
    const { data: existing } = await supabaseAdmin
      .from('servers')
      .select('id')
      .eq('subdomain', finalSubdomain)
      .single();

    if (existing) {
      return res.status(400).json({ error: 'Subdomain already taken', detail: `Subdomain ${finalSubdomain} is already in use` });
    }

    // Generate secure RCON password
    const rconPassword = crypto.randomBytes(12).toString('hex');

    const insertPayload = {
      user_id: userId,
      name,
      game,
      type: software,
      version,
      ram,
      status: 'Stopped',
      cost_per_hour: costPerHour,
      hetzner_id: null,
      ipv4: null,
      subdomain: finalSubdomain,
      rcon_password: rconPassword, // Store generated password
    };

    const { data, error } = await supabaseAdmin
      .from('servers')
      .insert([insertPayload])
      .select()
      .single();

    if (error) {
      console.error('Supabase insert error:', error);
      return res.status(500).json({ error: 'Failed to insert server into Supabase', detail: error.message });
    }

    // Initialize S3 Files (server.properties & eula.txt)
    // This allows the user to edit settings before the first launch.
    if (game === 'minecraft') {
      const s3Prefix = `servers/${data.id}/`;
      
      try {
        await Promise.all([
          s3.putObject({
            Bucket: S3_BUCKET,
            Key: `${s3Prefix}server.properties`,
            Body: DEFAULT_PROPERTIES,
            ContentType: 'text/plain'
          }).promise(),
          s3.putObject({
            Bucket: S3_BUCKET,
            Key: `${s3Prefix}eula.txt`,
            Body: EULA_TXT,
            ContentType: 'text/plain'
          }).promise()
        ]);
      } catch (s3Err) {
        console.error('Failed to initialize S3 files:', s3Err);
        // We don't fail the request here, as the server record was created successfully.
        // The user might just see an empty file list initially.
      }
    }

    return res.status(200).json({ server: data });
  } catch (err) {
    console.error('create handler error:', err);
    return res.status(500).json({ error: 'Internal server error', detail: err.message });
  }
}