// pages/api/servers/[serverId]/file.js

import { createClient } from '@supabase/supabase-js';
import AWS from 'aws-sdk';
import path from 'path';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const S3_BUCKET = process.env.S3_BUCKET;
const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID;
const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY;
const AWS_REGION = process.env.AWS_REGION || 'eu-central-1';
const S3_ENDPOINT = process.env.S3_ENDPOINT;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing Supabase environment variables');
}

if (!S3_BUCKET || !AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) {
  throw new Error('Missing S3 configuration environment variables');
}

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
  const s3Prefix = `servers/${serverId}/`;

  // Authenticate using server row
  const { data: server, error } = await supabaseAdmin
    .from('servers')
    .select('rcon_password, ipv4, status')
    .eq('id', serverId)
    .single();

  if (error || !server) {
    return res.status(404).json({ error: 'Server not found' });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ') || authHeader.substring(7) !== server.rcon_password) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Handle GET /file - download file
  if (req.method === 'GET') {
    try {
      let relPath = req.query.path;
      if (!relPath) return res.status(400).json({ error: 'Missing path' });
      relPath = relPath.replace(/^\/+/, '');
      const s3Key = path.join(s3Prefix, relPath).replace(/\\/g, '/');

      let content;
      if (server.status === 'Running' && server.ipv4) {
        try {
          const response = await fetch(`https://${server.subdomain}.spawnly.net/files/api/file?path=${encodeURIComponent(relPath)}`, {
            headers: {
              'Authorization': `Bearer ${server.rcon_password}`,
            },
            timeout: 10000,  // Increase timeout to 10s for reliability
          });

          if (!response.ok) {
            throw new Error(`Failed to fetch file from game server: ${response.status} ${await response.text().catch(() => '')}`);
          }

          content = await response.buffer();
          // Async sync to S3 for consistency
          s3.putObject({
            Bucket: S3_BUCKET,
            Key: s3Key,
            Body: content,
            ContentType: 'application/octet-stream',
          }).promise().catch(err => console.error('Failed to sync to S3:', err));

        } catch (fetchError) {
          console.error('Game server fetch failed:', fetchError.message);  // More detailed log
          // Fall back to S3
        }
      }

      if (!content) {
        // Fetch from S3
        const s3Response = await s3.getObject({ Bucket: S3_BUCKET, Key: s3Key }).promise();
        content = s3Response.Body;
      }

      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${path.basename(s3Key)}"`);
      return res.status(200).send(content);
    } catch (error) {
      console.error('Error:', error);
      if (error.code === 'NoSuchKey') return res.status(404).json({ error: 'File not found' });
      return res.status(500).json({ error: 'Failed to download file', detail: error.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}