// pages/api/servers/[serverId]/files.js

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

  const { data: server, error } = await supabaseAdmin
    .from('servers')
    .select('rcon_password, ipv4, status, subdomain, user_id') 
    .eq('id', serverId)
    .single();

  if (error || !server) return res.status(404).json({ error: 'Server not found' });

  // Dual Auth
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

  let relPath = '';
  try { relPath = sanitizePath(req.query.path || ''); } catch (e) { return res.status(400).json({ error: 'Invalid path' }); }
  const s3Path = relPath ? path.posix.join(s3Prefix, relPath) + '/' : s3Prefix;
  if (!s3Path.startsWith(s3Prefix)) return res.status(400).json({ error: 'Access denied' });

  // ==========================================
  // GET: List Files
  // ==========================================
  if (req.method === 'GET') {
    try {
      if (server.status === 'Running' && server.ipv4) {
        try {
          const response = await fetch(`http://${server.subdomain}.spawnly.net:3005/api/files?path=${encodeURIComponent(relPath)}`, { headers: { 'Authorization': `Bearer ${server.rcon_password}` }, timeout: 5000 });
          if (response.ok) return res.status(200).json(await response.json());
        } catch (fetchError) {}
      }
      const s3Response = await s3.listObjectsV2({ Bucket: S3_BUCKET, Prefix: s3Path, Delimiter: '/' }).promise();
      const files = [];
      if (s3Response.CommonPrefixes) s3Response.CommonPrefixes.forEach(p => files.push({ name: path.basename(p.Prefix), isDirectory: true, size: 0, modified: new Date().toISOString() }));
      if (s3Response.Contents) s3Response.Contents.forEach(o => { if(o.Key !== s3Path) files.push({ name: path.basename(o.Key), isDirectory: false, size: o.Size, modified: o.LastModified.toISOString() }); });
      return res.status(200).json({ path: relPath, files });
    } catch (s3Error) { return res.status(200).json({ path: relPath, files: [] }); }
  }

  // ==========================================
  // POST: Create Directory
  // ==========================================
  if (req.method === 'POST') {
      try {
        const bodyBuffer = await getRawBody(req);
        const { type, path: newDirName } = JSON.parse(bodyBuffer.toString());
        if (type !== 'directory' || !newDirName) return res.status(400).json({ error: 'Invalid operation' });
        
        let safeRelPath;
        try { safeRelPath = sanitizePath(newDirName); } catch (e) { return res.status(400).json({ error: 'Invalid path' }); }

        if (server.status === 'Running' && server.ipv4) {
           try {
             await fetch(`http://${server.subdomain}.spawnly.net:3005/api/directory`, { 
                 method: 'POST', 
                 headers: { 'Authorization': `Bearer ${server.rcon_password}`, 'Content-Type': 'application/json' }, 
                 body: JSON.stringify({ path: safeRelPath }) 
             });
           } catch(e) {}
        }
        await s3.putObject({ Bucket: S3_BUCKET, Key: path.posix.join(s3Prefix, safeRelPath) + '/', Body: '' }).promise();
        return res.status(200).json({ success: true, path: safeRelPath });
      } catch (err) { return res.status(500).json({ error: 'Failed' }); }
  }

  // ==========================================
  // PATCH: Rename File
  // ==========================================
  if (req.method === 'PATCH') {
      try {
          const bodyBuffer = await getRawBody(req);
          const { oldPath, newPath } = JSON.parse(bodyBuffer.toString());
          
          const safeOld = sanitizePath(oldPath);
          const safeNew = sanitizePath(newPath);

          if (server.status === 'Running' && server.ipv4) {
             try {
                 await fetch(`http://${server.subdomain}.spawnly.net:3005/api/files`, {
                    method: 'PATCH',
                    headers: { 'Authorization': `Bearer ${server.rcon_password}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ oldPath: safeOld, newPath: safeNew })
                 });
             } catch(e) {}
          } else {
             const oldKey = path.posix.join(s3Prefix, safeOld);
             const newKey = path.posix.join(s3Prefix, safeNew);
             await s3.copyObject({ Bucket: S3_BUCKET, CopySource: `${S3_BUCKET}/${oldKey}`, Key: newKey }).promise();
             await s3.deleteObject({ Bucket: S3_BUCKET, Key: oldKey }).promise();
          }
          return res.status(200).json({ success: true });
      } catch (e) { return res.status(500).json({ error: 'Rename failed' }); }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}