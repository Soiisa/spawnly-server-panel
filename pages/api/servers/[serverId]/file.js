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
      await s3.putObject({ 
          Bucket: S3_BUCKET, 
          Key: s3Key, 
          Body: body, 
          ContentType: req.headers['content-type'] || 'text/plain' 
      }).promise();
      
      if (server.status === 'Running' && server.ipv4) {
         try { 
             await axios.put(`http://${server.ipv4}:3005/api/file?path=${encodeURIComponent(relPath)}`, body, {
                 headers: { 
                     'Authorization': `Bearer ${server.rcon_password}`,
                     'Content-Type': 'application/octet-stream' 
                 },
                 maxContentLength: Infinity,
                 maxBodyLength: Infinity
             });
         } catch(e) { console.error('[VPS Save Error]', e.message); }
      }
      return res.status(200).json({ success: true });
    } catch (e) { return res.status(500).json({ error: 'Update failed' }); }
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
          } catch(e) { console.error('[VPS Delete Error]', e.message); }
      }
      return res.status(200).json({ success: true });
    } catch (e) { return res.status(500).json({ error: 'Delete failed' }); }
  }

  // ==========================================
  // POST: Smart Routing (Uploads vs Directory Creation)
  // ==========================================
  if (req.method === 'POST') {
    const contentType = req.headers['content-type'] || '';

    if (contentType.includes('multipart/form-data')) {
      const form = new formidable.IncomingForm({
        maxFileSize: 2000 * 1024 * 1024,
        keepExtensions: true,
        preservePath: true // MAGIC FLAG: Tells formidable not to strip the folder structure!
      });

      return new Promise((resolve) => {
        form.parse(req, async (err, fields, files) => {
          if (err) {
            console.error('[Panel Formidable Error]', err);
            return resolve(res.status(500).json({ error: 'Form parsing failed', detail: err.message }));
          }

          const fileKeys = Object.keys(files);
          if (fileKeys.length === 0) return resolve(res.status(400).json({ error: 'Bad Request: No files detected' }));

          const uploadedFiles = [];
          for (const key of fileKeys) {
            const f = files[key];
            if (Array.isArray(f)) uploadedFiles.push(...f);
            else uploadedFiles.push(f);
          }

          try {
            // Support arrays in case frontend loops multiple files with multiple path strings
            const rawPathField = fields.path || fields.dirPath || req.query.path || '';
            const pathArray = Array.isArray(rawPathField) ? rawPathField : [rawPathField];
            
            // Support frontends that explicitly send relativePath as a separate field
            const relPathField = fields.relativePath || fields.webkitRelativePath || '';
            const relPathArray = Array.isArray(relPathField) ? relPathField : [relPathField];

            const uploadedPaths = [];

            for (let i = 0; i < uploadedFiles.length; i++) {
              const uploadedFile = uploadedFiles[i];
              
              // Match base path by array index (fallback to index 0)
              const baseTargetDir = pathArray[i] !== undefined ? pathArray[i] : (pathArray[0] || '');
              
              // Try to grab explicit frontend relative path (if passed)
              const frontendRelPath = relPathArray[i] !== undefined ? relPathArray[i] : (relPathArray[0] || '');
              
              // Use frontendRelPath OR the filename (which preservePath: true keeps intact)
              const rawFileName = frontendRelPath || uploadedFile.originalFilename || uploadedFile.name || 'upload';
              
              const sanitizedRelativePath = rawFileName.replace(/\0/g, '').replace(/(\.\.\/|\.\.\\)/g, '').replace(/^\/+/, '');
              
              const subFolder = path.posix.dirname(sanitizedRelativePath);
              const finalFileName = path.posix.basename(sanitizedRelativePath);
              
              // Combine base target directory with the extracted subfolder
              const finalTargetDir = subFolder !== '.' ? path.posix.join(baseTargetDir, subFolder) : baseTargetDir;
              const uploadS3Key = path.posix.join(s3Prefix, finalTargetDir, finalFileName).replace(/\\/g, '/');
              
              const filePath = uploadedFile.filepath || uploadedFile.path;
              const fileMime = uploadedFile.mimetype || uploadedFile.type || 'application/octet-stream';
              
              if (!filePath) continue;

              const fileBuffer = await fs.promises.readFile(filePath);

              // 1. Upload to S3 Backup preserving the structure
              await s3.putObject({ 
                Bucket: S3_BUCKET, 
                Key: uploadS3Key, 
                Body: fileBuffer, 
                ContentType: fileMime 
              }).promise();
              
              // 2. Upload to the active Game Server
              if (server.status === 'Running' && server.ipv4) {
                  const targetUrl = `http://${server.ipv4}:3005/api/file`;
                  const formData = new FormData();
                  
                  // The VPS file-api.js will automatically `mkdir -p` this subfolder!
                  formData.append('path', finalTargetDir);
                  formData.append('file', fileBuffer, {
                      filename: finalFileName,
                      contentType: fileMime
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
                      console.error(`[VPS Upload Error - ${finalFileName}]`, vpsErr.message);
                  }
              }
              uploadedPaths.push(path.posix.join(finalTargetDir, finalFileName));
            }
            resolve(res.status(200).json({ success: true, paths: uploadedPaths }));
          } catch (error) { 
            console.error('[Panel Upload Error]', error);
            resolve(res.status(500).json({ error: 'Folder upload failed completely', detail: error.message })); 
          }
        });
      });
    } else {
      // JSON Block for creating directories
      try {
        const bodyBuffer = await getRawBody(req);
        const { type, path: newDirName } = JSON.parse(bodyBuffer.toString());
        if (type !== 'directory' || !newDirName) return res.status(400).json({ error: 'Invalid operation' });
        
        const safeRelPath = path.normalize(newDirName || '').replace(/^(\.\.(\/|\\|$))+/, '').replace(/^\/+/, '').replace(/\/+$/, '');
        if (safeRelPath.includes('..')) return res.status(400).json({ error: 'Invalid path' });

        if (server.status === 'Running' && server.ipv4) {
           try {
             await fetch(`http://${server.ipv4}:3005/api/directory`, { 
                 method: 'POST', 
                 headers: { 'Authorization': `Bearer ${server.rcon_password}`, 'Content-Type': 'application/json' }, 
                 body: JSON.stringify({ path: safeRelPath }) 
             });
           } catch(e) { console.error('[VPS Mkdir Error]', e.message); }
        }
        await s3.putObject({ Bucket: S3_BUCKET, Key: path.posix.join(s3Prefix, safeRelPath) + '/', Body: '' }).promise();
        return res.status(200).json({ success: true, path: safeRelPath });
      } catch (err) { 
        console.error('[Mkdir Error]', err);
        return res.status(500).json({ error: 'Failed to create directory' }); 
      }
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
