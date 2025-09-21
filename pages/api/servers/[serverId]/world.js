// pages/api/servers/[serverId]/world.js

import { createClient } from '@supabase/supabase-js';
import AWS from 'aws-sdk';
import path from 'path';
import formidable from 'formidable-serverless';
import archiver from 'archiver';
import AdmZip from 'adm-zip';

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

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  const { serverId } = req.query;
  const s3Prefix = `servers/${serverId}/`;

  // Authenticate
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

  if (server.status !== 'Stopped') {
    return res.status(403).json({ error: 'Server must be stopped for world operations' });
  }

  const worldPrefix = path.join(s3Prefix, 'world/').replace(/\\/g, '/');

  if (req.method === 'GET') {
    // Download world as zip
    try {
      const listRes = await s3.listObjectsV2({
        Bucket: S3_BUCKET,
        Prefix: worldPrefix,
      }).promise();

      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', 'attachment; filename=world.zip');

      const archive = archiver('zip', { zlib: { level: 9 } });
      archive.pipe(res);

      for (const obj of listRes.Contents || []) {
        const fileName = obj.Key.replace(worldPrefix, '');
        if (fileName) {
          const stream = s3.getObject({ Bucket: S3_BUCKET, Key: obj.Key }).createReadStream();
          archive.append(stream, { name: fileName });
        }
      }

      await archive.finalize();
    } catch (err) {
      console.error('Error downloading world:', err);
      res.status(500).json({ error: 'Failed to download world' });
    }
  } else if (req.method === 'POST' && req.query.action === 'generate') {
    // Generate new world
    try {
      const body = await new Promise((resolve) => {
        let data = '';
        req.on('data', chunk => data += chunk);
        req.on('end', () => resolve(JSON.parse(data)));
      });

      const { levelName, seed, generatorSettings, worldType, generateStructures, datapacks, hardcore } = body;

      // Delete existing world
      let listRes = await s3.listObjectsV2({ Bucket: S3_BUCKET, Prefix: worldPrefix }).promise();
      let objects = listRes.Contents.map(obj => ({ Key: obj.Key }));
      if (objects.length > 0) {
        await s3.deleteObjects({
          Bucket: S3_BUCKET,
          Delete: { Objects: objects },
        }).promise();
      }

      // Handle more if truncated
      while (listRes.IsTruncated) {
        listRes = await s3.listObjectsV2({
          Bucket: S3_BUCKET,
          Prefix: worldPrefix,
          ContinuationToken: listRes.NextContinuationToken,
        }).promise();
        objects = listRes.Contents.map(obj => ({ Key: obj.Key }));
        if (objects.length > 0) {
          await s3.deleteObjects({
            Bucket: S3_BUCKET,
            Delete: { Objects: objects },
          }).promise();
        }
      }

      // Update server.properties with only necessary fields
      const propsKey = path.join(s3Prefix, 'server.properties').replace(/\\/g, '/');
      let propsText = '';
      try {
        const propsObj = await s3.getObject({ Bucket: S3_BUCKET, Key: propsKey }).promise();
        propsText = propsObj.Body.toString('utf8');
      } catch (e) {
        if (e.code !== 'NoSuchKey') throw e;
      }

      const propsMap = parseProperties(propsText);
      // Update only the specific world generation properties
      propsMap['level-name'] = levelName || propsMap['level-name'] || 'world';
      propsMap['level-seed'] = seed || propsMap['level-seed'] || '';
      propsMap['generator-settings'] = generatorSettings || propsMap['generator-settings'] || '';
      propsMap['level-type'] = {
        default: 'minecraft\\:normal',
        superflat: 'minecraft\\:flat',
        amplified: 'minecraft\\:amplified',
        large_biomes: 'minecraft\\:large_biomes',
        single_biome: 'minecraft\\:single_biome',
      }[worldType] || propsMap['level-type'] || 'minecraft\\:normal';
      propsMap['generate-structures'] = generateStructures !== undefined ? (generateStructures ? 'true' : 'false') : propsMap['generate-structures'] || 'true';
      propsMap['hardcore'] = hardcore !== undefined ? (hardcore ? 'true' : 'false') : propsMap['hardcore'] || 'false';

      const newPropsText = serializeProperties(propsMap);
      await s3.putObject({
        Bucket: S3_BUCKET,
        Key: propsKey,
        Body: newPropsText,
        ContentType: 'text/plain',
      }).promise();

      // Install datapacks if provided
      if (datapacks) {
        const dpUrls = datapacks.split(',').map(url => url.trim());
        for (const url of dpUrls) {
          if (url) {
            const dpRes = await fetch(url);
            if (!dpRes.ok) continue;
            const buffer = await dpRes.buffer();
            const dpName = url.split('/').pop() || 'datapack.zip';
            const dpKey = path.join(worldPrefix, 'datapacks', dpName).replace(/\\/g, '/');
            await s3.putObject({
              Bucket: S3_BUCKET,
              Key: dpKey,
              Body: buffer,
              ContentType: 'application/zip',
            }).promise();
          }
        }
      }

      res.status(200).json({ success: true });
    } catch (err) {
      console.error('Error generating world:', err);
      res.status(500).json({ error: 'Failed to generate world' });
    }
  } else if (req.method === 'POST') {
    // Upload world zip
    const form = new formidable.IncomingForm();
    return new Promise((resolve) => {
      form.parse(req, async (err, fields, files) => {
        if (err) {
          resolve(res.status(500).json({ error: 'Failed to parse upload' }));
          return;
        }

        const worldZip = files.worldZip;
        if (!worldZip || !worldZip.path) {
          resolve(res.status(400).json({ error: 'Missing world zip' }));
          return;
        }

        try {
          const fs = require('fs').promises;
          const zipBuffer = await fs.readFile(worldZip.path);
          const zip = new AdmZip(zipBuffer);

          // Delete existing world first
          let listRes = await s3.listObjectsV2({ Bucket: S3_BUCKET, Prefix: worldPrefix }).promise();
          let objects = listRes.Contents.map(obj => ({ Key: obj.Key }));
          if (objects.length > 0) {
            await s3.deleteObjects({
              Bucket: S3_BUCKET,
              Delete: { Objects: objects },
            }).promise();
          }
          while (listRes.IsTruncated) {
            listRes = await s3.listObjectsV2({
              Bucket: S3_BUCKET,
              Prefix: worldPrefix,
              ContinuationToken: listRes.NextContinuationToken,
            }).promise();
            objects = listRes.Contents.map(obj => ({ Key: obj.Key }));
            if (objects.length > 0) {
              await s3.deleteObjects({
                Bucket: S3_BUCKET,
                Delete: { Objects: objects },
              }).promise();
            }
          }

          // Extract and upload
          const entries = zip.getEntries();
          for (const entry of entries) {
            if (!entry.isDirectory) {
              const key = path.join(worldPrefix, entry.entryName).replace(/\\/g, '/');
              await s3.putObject({
                Bucket: S3_BUCKET,
                Key: key,
                Body: entry.getData(),
                ContentType: 'application/octet-stream',
              }).promise();
            }
          }

          resolve(res.status(200).json({ success: true }));
        } catch (e) {
          console.error('Error uploading world:', e);
          resolve(res.status(500).json({ error: 'Failed to upload world' }));
        }
      });
    });
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
}

function parseProperties(text) {
  const lines = text.split(/\r?\n/);
  const map = {};
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    map[key] = value;
  }
  return map;
}

function serializeProperties(map) {
  return Object.entries(map).map(([k, v]) => `${k}=${v}`).join('\n');
}