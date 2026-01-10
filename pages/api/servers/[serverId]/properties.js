// pages/api/servers/[serverId]/properties.js
import { createClient } from '@supabase/supabase-js';
import AWS from 'aws-sdk';
import { verifyServerAccess } from '../../../../lib/accessControl';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const S3_BUCKET = process.env.S3_BUCKET;
const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID;
const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY;
const AWS_REGION = process.env.AWS_REGION || 'eu-central-1';
const S3_ENDPOINT = process.env.S3_ENDPOINT;

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const s3 = new AWS.S3({
  accessKeyId: AWS_ACCESS_KEY_ID,
  secretAccessKey: AWS_SECRET_ACCESS_KEY,
  region: AWS_REGION,
  endpoint: S3_ENDPOINT || undefined,
  s3ForcePathStyle: !!S3_ENDPOINT,
});

export default async function handler(req, res) {
  const { serverId } = req.query;

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const token = authHeader.split(' ')[1];
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

  if (authError || !user) return res.status(401).json({ error: 'Unauthorized' });

  // --- NEW ACCESS CHECK (Requires 'settings' permission) ---
  const access = await verifyServerAccess(supabaseAdmin, serverId, user.id, 'settings');
  
  if (!access.allowed) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  // Fetch full details needed for S3/API
  const { data: server } = await supabaseAdmin
    .from('servers')
    .select('subdomain, rcon_password, status')
    .eq('id', serverId)
    .single();

  if (!server) return res.status(404).json({ error: 'Server not found' });

  const s3Key = `servers/${serverId}/server.properties`;

  // GET
  if (req.method === 'GET') {
    try {
      if (server.status === 'Running' && server.subdomain) {
        try {
          const response = await fetch(`http://${server.subdomain}.spawnly.net:3003/api/properties`, {
            headers: { 'Authorization': `Bearer ${server.rcon_password}` },
            timeout: 5000,
          });
          if (response.ok) return res.status(200).send(await response.text());
        } catch (e) { /* Fallback */ }
      }

      // Fallback to S3
      const s3Response = await s3.getObject({ Bucket: S3_BUCKET, Key: s3Key }).promise();
      return res.status(200).send(s3Response.Body.toString('utf-8'));
    } catch (error) {
      return res.status(200).send('# No properties found\n');
    }
  }

  // POST
  if (req.method === 'POST') {
    try {
      // If running, push to live server
      if (server.status === 'Running' && server.subdomain) {
        try {
          await fetch(`http://${server.subdomain}.spawnly.net:3003/api/properties`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${server.rcon_password}`, 'Content-Type': 'text/plain' },
            body: req.body,
            timeout: 5000,
          });
        } catch (e) { console.warn('Failed to push to live server, saving to S3 only'); }
      }

      // Always save to S3
      await s3.putObject({
        Bucket: S3_BUCKET,
        Key: s3Key,
        Body: req.body,
        ContentType: 'text/plain',
      }).promise();

      // [AUDIT LOG]
      await supabaseAdmin.from('server_audit_logs').insert({
        server_id: serverId,
        user_id: user.id,
        action_type: 'update_properties',
        details: 'Updated server.properties file',
        created_at: new Date().toISOString()
      });

      return res.status(200).json({ success: true });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}