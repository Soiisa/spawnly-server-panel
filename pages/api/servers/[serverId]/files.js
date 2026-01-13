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

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error('Missing Supabase environment variables');
if (!S3_BUCKET || !AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) throw new Error('Missing S3 configuration environment variables');

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const s3 = new AWS.S3({ 
  accessKeyId: AWS_ACCESS_KEY_ID, 
  secretAccessKey: AWS_SECRET_ACCESS_KEY, 
  region: AWS_REGION, 
  endpoint: S3_ENDPOINT || undefined, 
  s3ForcePathStyle: !!S3_ENDPOINT 
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

const sanitizePath = (inputPath) => {
  if (inputPath.indexOf('\0') !== -1) throw new Error('Invalid path');
  let safePath = path.normalize(inputPath || '').replace(/^(\.\.(\/|\\|$))+/, '');
  if (safePath.includes('..')) throw new Error('Path traversal detected');
  safePath = safePath.replace(/^\/+/, '').replace(/\/+$/, '');
  return safePath;
};

export default async function handler(req, res) {
  const { serverId } = req.query;
  const s3Prefix = `servers/${serverId}/`;

  // --- MODIFICATION: Select user_id instead of owner_id ---
  const { data: server, error } = await supabaseAdmin
    .from('servers')
    .select('rcon_password, ipv4, status, subdomain, user_id') 
    .eq('id', serverId)
    .single();

  if (error || !server) {
      console.error("Server lookup error:", error);
      return res.status(404).json({ error: 'Server not found' });
  }

  // --- MODIFICATION: Dual Authentication ---
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });

  const token = authHeader.substring(7);
  let isAuthorized = false;

  // 1. RCON Check (Agent/Game Panel)
  if (token === server.rcon_password) {
    isAuthorized = true;
  } else {
    // 2. User Session Check (Admin Dashboard)
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    
    if (user && !authError) {
      // Check Owner using 'user_id'
      if (server.user_id === user.id) {
        isAuthorized = true;
      } else {
        // Check Admin using 'is_admin'
        const { data: profile } = await supabaseAdmin
            .from('profiles')
            .select('is_admin')
            .eq('id', user.id)
            .single();
            
        if (profile?.is_admin) {
          isAuthorized = true;
        }
      }
    }
  }

  if (!isAuthorized) return res.status(401).json({ error: 'Unauthorized' });
  // --- END MODIFICATION ---

  let relPath = '';
  try { relPath = sanitizePath(req.query.path || ''); } catch (e) { return res.status(400).json({ error: 'Invalid path' }); }
  
  const s3Path = relPath ? path.join(s3Prefix, relPath).replace(/\\/g, '/') + '/' : s3Prefix;
  if (!s3Path.startsWith(s3Prefix)) return res.status(400).json({ error: 'Access denied: Invalid path scope' });

  // GET: List Files
  if (req.method === 'GET') {
    try {
      if (server.status === 'Running' && server.ipv4) {
        try {
          // Note: Use server.rcon_password to talk to the agent
          const response = await fetch(`http://${server.subdomain}.spawnly.net:3005/api/files?path=${encodeURIComponent(relPath)}`, { headers: { 'Authorization': `Bearer ${server.rcon_password}` }, timeout: 5000 });
          if (response.ok) return res.status(200).json(await response.json());
        } catch (fetchError) { console.warn('Agent fetch failed, S3 fallback'); }
      }
      const s3Response = await s3.listObjectsV2({ Bucket: S3_BUCKET, Prefix: s3Path, Delimiter: '/' }).promise();
      const files = [];
      if (s3Response.CommonPrefixes) s3Response.CommonPrefixes.forEach(p => files.push({ name: path.basename(p.Prefix), isDirectory: true, size: 0, modified: new Date().toISOString() }));
      if (s3Response.Contents) s3Response.Contents.forEach(o => { if(o.Key !== s3Path) files.push({ name: path.basename(o.Key), isDirectory: false, size: o.Size, modified: o.LastModified.toISOString() }); });
      return res.status(200).json({ path: relPath, files });
    } catch (s3Error) { return res.status(200).json({ path: relPath, files: [] }); }
  }

  // POST: Upload or Create Directory
  if (req.method === 'POST') {
    const contentType = req.headers['content-type'] || '';
    if (contentType.includes('application/json')) {
      try {
        const bodyBuffer = await getRawBody(req);
        const { type, path: newDirName } = JSON.parse(bodyBuffer.toString());
        if (type !== 'directory' || !newDirName) return res.status(400).json({ error: 'Invalid operation' });
        
        let safeRelPath;
        try { safeRelPath = sanitizePath(newDirName); } catch (e) { return res.status(400).json({ error: 'Invalid directory path' }); }

        if (server.status === 'Running' && server.ipv4) {
           try {
             const response = await fetch(`http://${server.subdomain}.spawnly.net:3005/api/directory`, { method: 'POST', headers: { 'Authorization': `Bearer ${server.rcon_password}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ path: safeRelPath }) });
             if (!response.ok) throw new Error(await response.text());
             return res.status(200).json({ success: true });
           } catch(e) {}
        }
        await s3.putObject({ Bucket: S3_BUCKET, Key: path.join(s3Prefix, safeRelPath).replace(/\\/g, '/') + '/', Body: '' }).promise();
        return res.status(200).json({ success: true, path: safeRelPath });
      } catch (err) { return res.status(500).json({ error: 'Failed' }); }
    }
    const form = new formidable.IncomingForm();
    return new Promise((resolve, reject) => {
      form.parse(req, async (err, fields, files) => {
        if (err || !fields.fileName || !files.fileContent) return resolve(res.status(400).json({ error: 'Bad Request' }));
        try {
          const s3Key = path.join(s3Prefix, relPath, fields.fileName).replace(/\\/g, '/');
          const fs = require('fs').promises;
          const fileBuffer = await fs.readFile(files.fileContent.path);
          await s3.putObject({ Bucket: S3_BUCKET, Key: s3Key, Body: fileBuffer, ContentType: files.fileContent.mimetype || 'application/octet-stream' }).promise();
          resolve(res.status(200).json({ success: true, path: path.join(relPath, fields.fileName) }));
        } catch (s3Error) { resolve(res.status(500).json({ error: 'Upload failed' })); }
      });
    });
  }

  // PATCH: Rename File
  if (req.method === 'PATCH') {
      try {
          const bodyBuffer = await getRawBody(req);
          const { oldPath, newPath } = JSON.parse(bodyBuffer.toString());
          
          const safeOld = sanitizePath(oldPath);
          const safeNew = sanitizePath(newPath);

          // Agent Rename
          if (server.status === 'Running' && server.ipv4) {
             const response = await fetch(`http://${server.subdomain}.spawnly.net:3005/api/files`, {
                method: 'PATCH',
                headers: { 'Authorization': `Bearer ${server.rcon_password}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ oldPath: safeOld, newPath: safeNew })
             });
             if (!response.ok) throw new Error(await response.text());
             // Sync to S3 later or rely on restart
          } else {
             // S3 Rename (Copy + Delete)
             const oldKey = path.join(s3Prefix, safeOld).replace(/\\/g, '/');
             const newKey = path.join(s3Prefix, safeNew).replace(/\\/g, '/');
             
             await s3.copyObject({ Bucket: S3_BUCKET, CopySource: `${S3_BUCKET}/${oldKey}`, Key: newKey }).promise();
             await s3.deleteObject({ Bucket: S3_BUCKET, Key: oldKey }).promise();
          }
          return res.status(200).json({ success: true });
      } catch (e) {
          console.error(e);
          return res.status(500).json({ error: 'Rename failed', detail: e.message });
      }
  }

  // PUT: Update Content (Create File)
  if (req.method === 'PUT') {
    try {
      const body = await getRawBody(req);
      const s3Key = path.join(s3Prefix, relPath).replace(/\\/g, '/');
      await s3.putObject({ Bucket: S3_BUCKET, Key: s3Key, Body: body, ContentType: req.headers['content-type'] }).promise();
      if (server.status === 'Running' && server.ipv4) {
         try { await fetch(`http://${server.subdomain}.spawnly.net:3005/api/file?path=${encodeURIComponent(relPath)}`, { method: 'PUT', headers: { 'Authorization': `Bearer ${server.rcon_password}`, 'Content-Type': req.headers['content-type'] }, body: body }); } catch(e) {}
      }
      return res.status(200).json({ success: true });
    } catch (e) { return res.status(500).json({ error: 'Update failed' }); }
  }

  // DELETE
  if (req.method === 'DELETE') {
    try {
      const s3Key = path.join(s3Prefix, relPath).replace(/\\/g, '/');
      const list = await s3.listObjectsV2({ Bucket: S3_BUCKET, Prefix: s3Key + (s3Key.endsWith('/') ? '' : '/') }).promise();
      if (list.Contents?.length > 0) await s3.deleteObjects({ Bucket: S3_BUCKET, Delete: { Objects: list.Contents.map(o => ({ Key: o.Key })) } }).promise();
      else await s3.deleteObject({ Bucket: S3_BUCKET, Key: s3Key }).promise();
      return res.status(200).json({ success: true });
    } catch (e) { return res.status(500).json({ error: 'Delete failed' }); }
  }
  return res.status(405).json({ error: 'Method not allowed' });
}