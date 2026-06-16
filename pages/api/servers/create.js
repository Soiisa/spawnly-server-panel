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

// --- NEW: Backend Game Registry Verification ---
const GAME_REGISTRY = {
  minecraft: { defaultSoftware: 'vanilla', defaultVersion: null },
  satisfactory: { defaultSoftware: 'steamcmd', defaultVersion: 'public' }
};

// Sanitize subdomain to be DNS-friendly
const sanitizeSubdomain = (name) => {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-') // Replace invalid chars with hyphens
    .replace(/-+/g, '-') // Collapse multiple hyphens
    .replace(/^-|-$/g, '') // Trim leading/trailing hyphens
    .slice(0, 63); // Ensure max length
};

// --- Helper to auto-detect latest version (Minecraft Only) ---
const getLatestVersion = async (software) => {
  try {
    const s = software.toLowerCase();
    
    // Vanilla
    if (s === 'vanilla') {
      const res = await fetch('https://launchermeta.mojang.com/mc/game/version_manifest.json');
      if (res.ok) {
        const data = await res.json();
        return data.latest.release;
      }
    }
    // Paper Ecosystem
    if (['paper', 'folia', 'velocity', 'waterfall'].includes(s)) {
      const res = await fetch(`https://api.papermc.io/v2/projects/${s}`);
      if (res.ok) {
        const data = await res.json();
        const v = data.versions;
        return v[v.length - 1]; // Last is latest
      }
    }
    // Purpur
    if (s === 'purpur') {
      const res = await fetch('https://api.purpurmc.org/v2/purpur');
      if (res.ok) {
        const data = await res.json();
        const v = data.versions;
        return v[v.length - 1];
      }
    }
    // Fabric
    if (s === 'fabric') {
        const res = await fetch('https://meta.fabricmc.net/v2/versions/game');
        if (res.ok) {
            const data = await res.json();
            const stable = data.find(v => v.stable);
            return stable ? stable.version : data[0].version;
        }
    }
    
    return null; 
  } catch (e) {
    console.warn('Failed to fetch latest version for', software, e.message);
    return null;
  }
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  
  // Validate Env Vars
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'Missing Supabase server env vars' });
  }
  if (!S3_BUCKET || !AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) {
    return res.status(500).json({ error: 'Missing S3 configuration env vars' });
  }

  // Authenticate User
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized', detail: 'Missing Authorization header' });
  }
  const token = authHeader.split(' ')[1];
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

  if (authError || !user) {
    return res.status(401).json({ error: 'Unauthorized', detail: 'Invalid token' });
  }
  const authenticatedUserId = user.id;

  let { name, game = 'minecraft', software, version, ram = 4, costPerHour = 0, subdomain, billing_type = 'hourly', location = 'nbg1' } = req.body;
  
  if (!name) return res.status(400).json({ error: 'Missing required fields: name' });

  // --- NEW: Validate against Game Registry ---
  const validGame = GAME_REGISTRY[game] ? game : 'minecraft';
  const finalSoftware = software || GAME_REGISTRY[validGame].defaultSoftware;
  let finalVersion = version || GAME_REGISTRY[validGame].defaultVersion;

  // Auto-fill version if missing and game is Minecraft
  if (!finalVersion && validGame === 'minecraft') {
    finalVersion = await getLatestVersion(finalSoftware);
    console.log(`[Create] Auto-detected latest version for ${finalSoftware}: ${finalVersion}`);
  }

  const finalSubdomain = subdomain ? sanitizeSubdomain(subdomain) : sanitizeSubdomain(name);

  if (!finalSubdomain || finalSubdomain.length < 1 || finalSubdomain.length > 63) {
    return res.status(400).json({ error: 'Invalid subdomain', detail: 'Subdomain must be 1-63 chars, alphanumeric with hyphens' });
  }

  const finalBillingType = ['hourly', 'monthly'].includes(billing_type) ? billing_type : 'hourly';
  let finalLocation = location;
  if (finalBillingType === 'hourly') {
    finalLocation = 'nbg1'; 
  }

  let instanceType = 'cx23';
  if (finalBillingType === 'monthly') {
    if (ram <= 3) instanceType = 'cx22';
    else if (ram <= 7) instanceType = 'cx32';
    else if (ram <= 15) instanceType = 'cx42';
    else instanceType = 'cx52'; 
  } else {
    if (ram <= 3) instanceType = 'cx23';
    else if (ram <= 7) instanceType = 'cx33';
    else if (ram <= 15) instanceType = 'cx43';
    else instanceType = 'cx53'; 
  }

  try {
    const { data: existing } = await supabaseAdmin
      .from('servers')
      .select('id')
      .eq('subdomain', finalSubdomain)
      .single();

    if (existing) {
      return res.status(400).json({ error: 'Subdomain already taken', detail: `Subdomain ${finalSubdomain} is already in use` });
    }

    const rconPassword = crypto.randomBytes(12).toString('hex');

    const insertPayload = {
      user_id: authenticatedUserId,
      name,
      game: validGame,
      type: finalSoftware,
      version: finalVersion,
      ram,
      status: 'Stopped',
      cost_per_hour: costPerHour,
      hetzner_id: null,
      ipv4: null,
      subdomain: finalSubdomain,
      rcon_password: rconPassword, // Still generated for Admin API auth, even if no RCON
      billing_type: finalBillingType,
      location: finalLocation,
      instance_type: instanceType
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

    await supabaseAdmin.from('server_audit_logs').insert({
      server_id: data.id,
      user_id: authenticatedUserId,
      action_type: 'server_create',
      details: `Created server "${name}" (${finalSoftware} ${finalVersion || 'N/A'}) [Billing: ${finalBillingType} / Region: ${finalLocation}]`,
      created_at: new Date().toISOString()
    });

    // --- NON-BREAKING FORK: Initialize S3 Files ONLY if game is Minecraft ---
    // For Satisfactory (SteamCMD), we skip this completely. The new provisioner will handle config files natively on the disk.
    if (validGame === 'minecraft') {
      const s3Prefix = `servers/${data.id}/`;
      
      const defaultProperties = [
        'enable-rcon=true',
        'rcon.port=25575',
        `rcon.password=${rconPassword}`,
        'broadcast-rcon-to-ops=true',
        'server-port=25565',
        'enable-query=true',
        'query.port=25565',
        'online-mode=false',
        'max-players=20',
        'difficulty=easy',
        'gamemode=survival',
        'spawn-protection=16',
        'view-distance=10',
        'simulation-distance=10',
        'motd=A Spawnly Server',
        'pvp=true',
        'generate-structures=true',
        'max-world-size=29999984'
      ].join('\n');

      const eulaTxt = 'eula=true\n';
      const emptyJson = '[]';

      try {
        await Promise.all([
          s3.putObject({ Bucket: S3_BUCKET, Key: `${s3Prefix}server.properties`, Body: defaultProperties, ContentType: 'text/plain' }).promise(),
          s3.putObject({ Bucket: S3_BUCKET, Key: `${s3Prefix}eula.txt`, Body: eulaTxt, ContentType: 'text/plain' }).promise(),
          s3.putObject({ Bucket: S3_BUCKET, Key: `${s3Prefix}banned-ips.json`, Body: emptyJson, ContentType: 'application/json' }).promise(),
          s3.putObject({ Bucket: S3_BUCKET, Key: `${s3Prefix}banned-players.json`, Body: emptyJson, ContentType: 'application/json' }).promise(),
          s3.putObject({ Bucket: S3_BUCKET, Key: `${s3Prefix}ops.json`, Body: emptyJson, ContentType: 'application/json' }).promise(),
          s3.putObject({ Bucket: S3_BUCKET, Key: `${s3Prefix}usercache.json`, Body: emptyJson, ContentType: 'application/json' }).promise(),
          s3.putObject({ Bucket: S3_BUCKET, Key: `${s3Prefix}whitelist.json`, Body: emptyJson, ContentType: 'application/json' }).promise()
        ]);
        console.log(`Initialized S3 files for Minecraft server ${data.id}`);
      } catch (s3Err) {
        console.error('Failed to initialize S3 files:', s3Err);
      }
    }

    return res.status(200).json({ server: data });
  } catch (err) {
    console.error('create handler error:', err);
    return res.status(500).json({ error: 'Internal server error', detail: err.message });
  }
}