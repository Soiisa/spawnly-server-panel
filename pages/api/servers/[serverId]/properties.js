// pages/api/servers/[serverId]/properties.js
import { createClient } from '@supabase/supabase-js';
import AWS from 'aws-sdk';

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

// Configure AWS SDK for S3
const s3 = new AWS.S3({
  accessKeyId: AWS_ACCESS_KEY_ID,
  secretAccessKey: AWS_SECRET_ACCESS_KEY,
  region: AWS_REGION,
  endpoint: S3_ENDPOINT || undefined,
  s3ForcePathStyle: !!S3_ENDPOINT,
});

export default async function handler(req, res) {
  const { serverId } = req.query;

  // Initialize S3 key for server.properties
  const s3Key = `servers/${serverId}/server.properties`;

  // Handle GET request - fetch server properties
  if (req.method === 'GET') {
    try {
      // Get server info from database
      const { data: server, error } = await supabaseAdmin
        .from('servers')
        .select('subdomain, rcon_password, status')
        .eq('id', serverId)
        .single();

      if (error || !server) {
        return res.status(404).json({ error: 'Server not found' });
      }

      // If server is running and has an subdomain, try to fetch from game server
      if (server.status === 'Running' && server.subdomain) {
        try {
          const response = await fetch(`https://${server.subdomain}.spawnly.net/api/properties`, {
            headers: {
              'Authorization': `Bearer ${server.rcon_password}`,
            },
            timeout: 5000,
          });

          if (!response.ok) {
            throw new Error(`Failed to fetch properties from game server: ${response.statusText}`);
          }

          const properties = await response.text();
          return res.status(200).send(properties);
        } catch (fetchError) {
          console.warn('Failed to fetch from game server, falling back to S3:', fetchError.message);
          // Fall back to S3 if game server fetch fails
        }
      }

      // Server is offline or no subdomain, fetch from S3
      try {
        const s3Response = await s3
          .getObject({
            Bucket: S3_BUCKET,
            Key: s3Key,
          })
          .promise();

        const properties = s3Response.Body.toString('utf-8');
        return res.status(200).send(properties);
      } catch (s3Error) {
        console.error('Error fetching from S3:', s3Error.message);
        // If file doesn't exist in S3, return default properties or empty
        return res.status(200).send('# No properties found in storage\n');
      }
    } catch (error) {
      console.error('Error fetching server properties:', error);
      return res.status(500).json({ error: error.message });
    }
  }

  // Handle POST request - update server properties
  if (req.method === 'POST') {
    try {
      // Get server info from database
      const { data: server, error } = await supabaseAdmin
        .from('servers')
        .select('subdomain, rcon_password, status')
        .eq('id', serverId)
        .single();

      if (error || !server) {
        return res.status(404).json({ error: 'Server not found' });
      }

      // If server is running and has an subdomain, try to save to game server
      if (server.status === 'Running' && server.subdomain) {
        try {
          const response = await fetch(`https://${server.subdomain}.spawnly.net/api/properties`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${server.rcon_password}`,
              'Content-Type': 'text/plain',
            },
            body: req.body,
            timeout: 5000,
          });

          if (!response.ok) {
            throw new Error(`Failed to save properties to game server: ${response.statusText}`);
          }

          // Also save to S3 to keep in sync
          await s3
            .putObject({
              Bucket: S3_BUCKET,
              Key: s3Key,
              Body: req.body,
              ContentType: 'text/plain',
            })
            .promise();

          return res.status(200).json({ success: true });
        } catch (fetchError) {
          console.warn('Failed to save to game server, saving to S3 only:', fetchError.message);
          // Fall back to saving to S3 if game server save fails
        }
      }

      // Server is offline or no subdomain, save to S3
      try {
        await s3
          .putObject({
            Bucket: S3_BUCKET,
            Key: s3Key,
            Body: req.body,
            ContentType: 'text/plain',
          })
          .promise();

        return res.status(200).json({ success: true });
      } catch (s3Error) {
        console.error('Error saving to S3:', s3Error.message);
        return res.status(500).json({ error: 'Failed to save properties to storage', details: s3Error.message });
      }
    } catch (error) {
      console.error('Error saving server properties:', error);
      return res.status(500).json({ error: error.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}