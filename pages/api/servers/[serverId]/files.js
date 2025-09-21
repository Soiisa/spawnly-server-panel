// pages/api/servers/[serverId]/files.js

import { createClient } from '@supabase/supabase-js';
import AWS from 'aws-sdk';
import path from 'path';
import formidable from 'formidable-serverless';

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

// Disable Next.js body parsing to handle multipart/form-data manually
export const config = {
  api: {
    bodyParser: false,
  },
};

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => {
      chunks.push(chunk);
    });
    req.on('end', () => {
      resolve(Buffer.concat(chunks).toString('utf8'));
    });
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  const { serverId } = req.query;
  const s3Prefix = `servers/${serverId}/`;

  // Authenticate using server row
  const { data: server, error } = await supabaseAdmin
    .from('servers')
    .select('rcon_password, subdomain, status')
    .eq('id', serverId)
    .single();

  if (error || !server) {
    return res.status(404).json({ error: 'Server not found' });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ') || authHeader.substring(7) !== server.rcon_password) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Handle GET /files - list files
  if (req.method === 'GET') {
  try {
    let relPath = req.query.path || '';
    relPath = relPath.replace(/^\/+/, '').replace(/\/+$/, '');
    const s3Path = relPath ? path.join(s3Prefix, relPath).replace(/\\/g, '/') + '/' : s3Prefix;

    if (server.status === 'Running' && server.subdomain) {
      try {
        const response = await fetch(`https://${server.subdomain}.spawnly.net/api/files?path=${encodeURIComponent(relPath)}`, {
          headers: {
            'Authorization': `Bearer ${server.rcon_password}`,
          },
          timeout: 5000,
        });

        if (!response.ok) {
          console.warn(`Failed to fetch files from game server: ${response.statusText}`);
          // Continue to S3 fallback instead of throwing
        } else {
          const data = await response.json();
          return res.status(200).json(data);
        }
      } catch (fetchError) {
        console.warn('Failed to fetch from game server, falling back to S3:', fetchError.message);
      }
    }

    const s3Response = await s3
      .listObjectsV2({
        Bucket: S3_BUCKET,
        Prefix: s3Path,
        Delimiter: '/',
      })
      .promise();

    const files = [];
    if (s3Response.CommonPrefixes) {
      for (const prefix of s3Response.CommonPrefixes) {
        const dirName = path.basename(prefix.Prefix);
        if (dirName) {
          files.push({
            name: dirName,
            isDirectory: true,
            size: 0,
            modified: new Date().toISOString(),
          });
        }
      }
    }

    if (s3Response.Contents) {
      for (const obj of s3Response.Contents) {
        if (obj.Key === s3Path) continue;
        const fileName = path.basename(obj.Key);
        if (fileName) {
          files.push({
            name: fileName,
            isDirectory: false,
            size: obj.Size,
            modified: obj.LastModified.toISOString(),
          });
        }
      }
    }

    return res.status(200).json({ path: relPath, files });
  } catch (s3Error) {
    console.error('Error listing S3 files:', s3Error.message, s3Error.stack);
    return res.status(200).json({ path: relPath, files: [] }); // Return empty list instead of error
  }
}

  // Handle POST /files - upload file
  if (req.method === 'POST') {
    const form = new formidable.IncomingForm();
    return new Promise((resolve, reject) => {
      form.parse(req, async (err, fields, files) => {
        if (err) {
          console.error('Error parsing form:', err);
          return resolve(res.status(500).json({ error: 'Failed to parse upload' }));
        }

        const fileName = files.file.originalname;  // Adjust for formidable-serverless
        if (!fileName) {
          return resolve(res.status(400).json({ error: 'Missing fileName' }));
        }

        const fileContent = files.file;
        if (!fileContent || !fileContent.path) {
          return resolve(res.status(400).json({ error: 'Missing file content' }));
        }

        try {
          let relPath = req.query.path || '';
          relPath = relPath.replace(/^\/+/, '').replace(/\/+$/, '');
          const s3Key = path.join(s3Prefix, relPath, fileName).replace(/\\/g, '/');

          // Read file content
          const fs = require('fs').promises;
          const fileBuffer = await fs.readFile(fileContent.path);

          // Removed try to game server
          // Upload to S3
          await s3
            .putObject({
              Bucket: S3_BUCKET,
              Key: s3Key,
              Body: fileBuffer,
              ContentType: fileContent.mimetype || 'application/octet-stream',
            })
            .promise();

          resolve(res.status(200).json({ success: true, path: path.join(relPath, fileName) }));
        } catch (s3Error) {
          console.error('Error uploading to S3:', s3Error.message, s3Error.stack);
          resolve(res.status(500).json({ error: 'Failed to upload file', detail: s3Error.message }));
        }
      });
    });
  }

  // Handle PUT /files - update file content
  if (req.method === 'PUT') {
    try {
      const body = await getRawBody(req);
      console.log('PUT request received for:', req.query.path, 'Body length:', body.length);

      let relPath = req.query.path;
      if (!relPath) return res.status(400).json({ error: 'Missing path' });
      relPath = relPath.replace(/^\/+/, '').replace(/\/+$/, '');
      const s3Key = path.join(s3Prefix, relPath).replace(/\\/g, '/');

      // Removed try to game server
      await s3
        .putObject({
          Bucket: S3_BUCKET,
          Key: s3Key,
          Body: body,
          ContentType: 'text/plain',
        })
        .promise();
      console.log('S3 file updated successfully:', s3Key);

      return res.status(200).json({ success: true });
    } catch (s3Error) {
      console.error('Error updating S3 file:', s3Error.message, s3Error.stack);
      return res.status(500).json({ error: 'Failed to update file', detail: s3Error.message });
    }
  }

  // Handle DELETE /files - delete file or folder
  if (req.method === 'DELETE') {
    try {
      let relPath = req.query.path;
      if (!relPath) return res.status(400).json({ error: 'Missing path' });
      relPath = relPath.replace(/^\/+/, '').replace(/\/+$/, '');
      const s3Key = path.join(s3Prefix, relPath).replace(/\\/g, '/');

      // Removed try to game server

      const s3ListResponse = await s3
        .listObjectsV2({
          Bucket: S3_BUCKET,
          Prefix: s3Key + (s3Key.endsWith('/') ? '' : '/'),
        })
        .promise();

      if (s3ListResponse.Contents && s3ListResponse.Contents.length > 0) {
        const objectsToDelete = s3ListResponse.Contents.map(obj => ({ Key: obj.Key }));
        if (objectsToDelete.length > 0) {
          await s3
            .deleteObjects({
              Bucket: S3_BUCKET,
              Delete: { Objects: objectsToDelete },
            })
            .promise();
        }
      } else {
        await s3
          .deleteObject({
            Bucket: S3_BUCKET,
            Key: s3Key,
          })
          .promise();
      }

      return res.status(200).json({ success: true });
    } catch (s3Error) {
      console.error('Error deleting from S3:', s3Error.message, s3Error.stack);
      if (s3Error.code === 'NoSuchKey') {
        return res.status(404).json({ error: 'File or folder not found' });
      }
      return res.status(500).json({ error: 'Failed to delete', detail: s3Error.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}