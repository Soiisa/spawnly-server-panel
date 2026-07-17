// pages/api/servers/[serverId]/file.js
import { createClient } from '@supabase/supabase-js';
import AWS from 'aws-sdk';
import path from 'path';
import formidable from 'formidable-serverless';
import FormData from 'form-data'; 
import fs from 'fs';
import axios from 'axios';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const S3_BUCKET = process.env.S3_BUCKET;
const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID;
const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY;
const AWS_REGION = process.env.AWS_REGION || 'eu-central-1';
const S3_ENDPOINT = process.env.S3_ENDPOINT;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error('Missing Supabase environment variables');
if (!S3_BUCKET || !AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) throw new Error('Missing S3 configuration environment variables');

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const s3 = new AWS.S3({
  accessKeyId: AWS_ACCESS_KEY_ID,
  secretAccessKey: AWS_SECRET_ACCESS_KEY,
  region: AWS_REGION,
  endpoint: S3_ENDPOINT || undefined,
  s3ForcePathStyle: !!S3_ENDPOINT,
});

export const config = { api: { bodyParser: false } };

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  const { serverId } = req.query;
  const s3Prefix = `servers/${serverId}/`;

  const { data: server, error } = await supabaseAdmin
    .from('servers')
    .select('rcon_password, ipv4, status, subdomain, user_id')
    .eq('id', serverId)
    .single();

  if (error || !server) return res.status(404).json({ error: 'Server not found' });

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });

  const token = authHeader.substring(7);
  let isAuthorized = false;

  if (token === server.rcon_password) {
    isAuthorized = true;
  } else {
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (user && !authError) {
      if (server.user_id === user.id) isAuthorized = true;
      else {
        const { data: profile } = await supabaseAdmin.from('profiles').select('is_admin').eq('id', user.id).single();
        if (profile?.is_admin) isAuthorized = true;
      }
    }
  }

  if (!isAuthorized) return res.status(401).json({ error: 'Unauthorized' });

  let relPath = req.query.path || '';
  if (relPath.indexOf('\0') !== -1) return res.status(400).json({ error: 'Invalid path' });
  let safePath = path.normalize(relPath).replace(/^(\.\.(\/|\\|$))+/, '');
  if (safePath.includes('..')) return res.status(400).json({ error: 'Path traversal detected' });
  relPath = safePath.replace(/^\/+/, '');
  const s3Key = path.join(s3Prefix, relPath).replace(/\\/g, '/');

  // ==========================================
  // GET: Download File
  // ==========================================
  if (req.method === 'GET') {
    try {
      let content;
      if (server.status === 'Running' && server.ipv4) {
        try {
          const response = await fetch(`http://${server.ipv4}:3005/api/file?path=${encodeURIComponent(relPath)}`, {
            headers: { 'Authorization': `Bearer ${server.rcon_password}` },
            timeout: 10000, 
          });
          if (response.ok) {
             const arrayBuffer = await response.arrayBuffer();
             content = Buffer.from(arrayBuffer);
             s3.putObject({ Bucket: S3_BUCKET, Key: s3Key, Body: content, ContentType: 'application/octet-stream' }).promise().catch(()=>{});
          }
        } catch (e) {
            console.error('[VPS Download Error]', e.message);
        }
      }
      if (!content) {
        const s3Response = await s3.getObject({ Bucket: S3_BUCKET, Key: s3Key }).promise();
        content = s3Response.Body;
      }
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${path.basename(s3Key)}"`);
      return res.status(200).send(content);
    } catch (error) { return res.status(500).json({ error: 'Download failed' }); }
  }

  // ==========================================
  // PUT: Save/Edit File
  // ==========================================
  if (req.method === 'PUT') {
    try {
      const body = await getRawBody(req);
      
      // 1. Save to S3 Backup Storage
      await s3.putObject({ 
          Bucket: S3_BUCKET, 
          Key: s3Key, 
          Body: body, 
          ContentType: req.headers['content-type'] || 'text/plain' 
      }).promise();
      
      // 2. Save directly to the running VPS
      if (server.status === 'Running' && server.ipv4) {
         try { 
             // Using Axios to safely transmit raw Buffer objects
             await axios.put(`http://${server.ipv4}:3005/api/file?path=${encodeURIComponent(relPath)}`, body, {
                 headers: { 
                     'Authorization': `Bearer ${server.rcon_password}`,
                     // FORCE octet-stream so the VPS express.json() doesn't swallow the stream!
                     'Content-Type': 'application/octet-stream' 
                 },
                 maxContentLength: Infinity,
                 maxBodyLength: Infinity
             });
         } catch(e) {
             console.error('[VPS Save Error]', e.message);
         }
      }
      return res.status(200).json({ success: true });
    } catch (e) { 
        console.error('[Panel Save Error]', e);
        return res.status(500).json({ error: 'Update failed' }); 
    }
  }

  // ==========================================
  // DELETE: Remove File
  // ==========================================
  if (req.method === 'DELETE') {
    try {
      await s3.deleteObject({ Bucket: S3_BUCKET, Key: s3Key }).promise();
      if (server.status === 'Running' && server.ipv4) {
          try {
              await fetch(`http://${server.ipv4}:3005/api/file?path=${encodeURIComponent(relPath)}`, {
                  method: 'DELETE',
                  headers: { 'Authorization': `Bearer ${server.rcon_password}` }
              });
          } catch(e) {
              console.error('[VPS Delete Error]', e.message);
          }
      }
      return res.status(200).json({ success: true });
    } catch (e) { return res.status(500).json({ error: 'Delete failed' }); }
  }

  // ==========================================
  // POST: Upload File
  // ==========================================
  if (req.method === 'POST') {
    const form = new formidable.IncomingForm();
    return new Promise((resolve) => {
      form.parse(req, async (err, fields, files) => {
        if (err || !files.file) {
            return resolve(res.status(400).json({ error: 'Bad Request' }));
        }

        try {
          const targetDir = fields.path || '';
          const uploadedFile = files.file;
          const safeFileName = path.basename(uploadedFile.name || uploadedFile.originalFilename || 'upload');
          const uploadS3Key = path.posix.join(s3Prefix, targetDir, safeFileName);
          
          const fileBuffer = await fs.promises.readFile(uploadedFile.path);

          // 1. Upload to S3
          await s3.putObject({ 
            Bucket: S3_BUCKET, 
            Key: uploadS3Key, 
            Body: fileBuffer, 
            ContentType: uploadedFile.type || 'application/octet-stream' 
          }).promise();
          
          // 2. Upload to active VPS using IP address
          if (server.status === 'Running' && server.ipv4) {
              const targetUrl = `http://${server.ipv4}:3005/api/file`;
              
              const formData = new FormData();
              formData.append('path', targetDir);
              formData.append('file', fs.createReadStream(uploadedFile.path), {
                  filename: safeFileName,
                  contentType: uploadedFile.type || 'application/octet-stream'
              });
              
              try {
                  await axios.post(targetUrl, formData, {
                      headers: { 
                          'Authorization': `Bearer ${server.rcon_password}`,
                          ...formData.getHeaders()
                      },
                      maxContentLength: Infinity,
                      maxBodyLength: Infinity
                  });
              } catch (vpsErr) { 
                  console.error('[VPS Upload Error]', vpsErr.message);
              }
          }

          resolve(res.status(200).json({ success: true, path: path.posix.join(targetDir, safeFileName) }));

        } catch (error) { 
          console.error('[Panel Upload Error]', error);
          resolve(res.status(500).json({ error: 'Upload failed' })); 
        }
      });
    });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
