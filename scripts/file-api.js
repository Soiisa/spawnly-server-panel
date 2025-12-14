// scripts/file-api.js
const fs = require('fs').promises;
const path = require('path');
const express = require('express');
const multer = require('multer');
const archiver = require('archiver');
const cors = require('cors');
const { execFile, exec } = require('child_process'); // Added exec for pipe operations

const app = express();
const PORT = process.env.FILE_API_PORT || 3005;
const MAX_UPLOAD_SIZE = 50 * 1024 * 1024;
const SERVER_ID = process.env.SERVER_ID;
const S3_BUCKET = process.env.S3_BUCKET;

app.use(cors());
app.use(express.json());
const upload = multer({ limits: { fileSize: MAX_UPLOAD_SIZE } });

async function getRconPassword() {
  try {
    const props = await fs.readFile(path.join(process.cwd(), 'server.properties'), 'utf8');
    const match = props.match(/^rcon\.password=(.*)$/m);
    return match ? match[1].trim() : null;
  } catch (e) { return null; }
}

const authenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const token = authHeader.substring(7);
  const rconPass = await getRconPassword();
  
  if (!rconPass || token !== rconPass) {
    return res.status(403).json({ error: 'Invalid token' });
  }
  next();
};

// Helper to validate paths securely
const validatePath = (reqPath) => {
  // Normalize and prevent traversal
  const relPath = (reqPath || '').replace(/^(\.\.(\/|\\|$))+/, '').replace(/^\/+/, '');
  
  if (relPath.includes('..')) {
      throw new Error('Invalid path: Traversal detected');
  }

  const absPath = path.resolve(process.cwd(), relPath);
  
  // Strict scope check
  if (!absPath.startsWith(process.cwd())) {
      throw new Error('Invalid path: Access denied');
  }
  
  return { relPath, absPath };
};

app.get('/api/files', authenticate, async (req, res) => {
  try {
    const { relPath, absPath } = validatePath(req.query.path);
    
    const stats = await fs.stat(absPath);
    if (!stats.isDirectory()) {
      return res.status(400).json({ error: 'Not a directory' });
    }
    
    const entries = await fs.readdir(absPath, { withFileTypes: true });
    const files = await Promise.all(entries.map(async (entry) => {
      const entryPath = path.join(absPath, entry.name);
      try {
        const entryStats = await fs.stat(entryPath);
        return {
          name: entry.name,
          isDirectory: entry.isDirectory(),
          size: entryStats.size,
          modified: entryStats.mtime.toISOString(),
        };
      } catch (e) { return null; }
    }));
    
    res.json({ path: relPath, files: files.filter(f => f) });
  } catch (err) {
    console.error('List files error:', err.message);
    res.status(500).json({ error: 'Failed to list files' });
  }
});

app.get('/api/file', authenticate, async (req, res) => {
  try {
    const { absPath } = validatePath(req.query.path);
    
    const stats = await fs.stat(absPath);
    if (stats.isDirectory()) {
      const archive = archiver('zip', { zlib: { level: 9 } });
      res.attachment(path.basename(absPath) + '.zip');
      archive.pipe(res);
      archive.directory(absPath, false);
      archive.finalize();
    } else {
      res.download(absPath);
    }
  } catch (err) {
    console.error('Download error:', err.message);
    res.status(500).json({ error: 'Failed to download' });
  }
});

app.post('/api/file', authenticate, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    
    const { absPath: targetDir, relPath } = validatePath(req.body.path);
    
    // Ensure filename is safe
    const safeFilename = path.basename(req.file.originalname);
    if (safeFilename !== req.file.originalname) {
        return res.status(400).json({ error: 'Invalid filename' });
    }

    await fs.mkdir(targetDir, { recursive: true });
    const targetPath = path.join(targetDir, safeFilename);
    
    await fs.writeFile(targetPath, req.file.buffer);
    res.json({ success: true, path: path.join(relPath, safeFilename) });
  } catch (err) {
    console.error('Upload error:', err.message);
    res.status(500).json({ error: 'Failed to upload' });
  }
});

app.put('/api/file', authenticate, async (req, res) => {
  try {
    const { absPath } = validatePath(req.query.path);
    
    await fs.mkdir(path.dirname(absPath), { recursive: true });
    await fs.writeFile(absPath, req.body);
    res.json({ success: true });
  } catch (err) {
    console.error('Update error:', err.message);
    res.status(500).json({ error: 'Failed to update file' });
  }
});

app.post('/api/rcon', authenticate, async (req, res) => {
  const { command } = req.body;
  if (!command) return res.status(400).json({ error: 'Missing command' });
  
  try {
    const rconPass = await getRconPassword();
    if (!rconPass) return res.status(500).json({ error: 'RCON not configured' });
    
    // SECURITY FIX: Use execFile to prevent shell injection.
    execFile('mcrcon', ['-H', '127.0.0.1', '-p', rconPass, command], (error, stdout, stderr) => {
      if (error) {
        console.error('RCON exec error:', error);
        return res.status(500).json({ error: 'Command execution failed' });
      }
      res.json({ output: stdout.toString().trim() });
    });
  } catch (error) {
    console.error('RCON error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --- BACKUP ENDPOINTS ---

app.post('/api/backups', authenticate, (req, res) => {
  if (!SERVER_ID || !S3_BUCKET) {
    return res.status(500).json({ error: 'Server configuration error (Missing ID/Bucket)' });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `backup-${timestamp}.zip`;
  const s3Path = `s3://${S3_BUCKET}/backups/${SERVER_ID}/${filename}`;

  // Use zip to stream directly to AWS CLI
  // Excludes node_modules, backups folder, zip files, and the server jar (optional, but saves space)
  const cmd = `zip -r - . -x "node_modules/*" "backups/*" "*.zip" "server.jar" | aws s3 cp - "${s3Path}"`;

  console.log(`[Backups] Starting backup: ${cmd}`);
  
  exec(cmd, { cwd: process.cwd() }, (error, stdout, stderr) => {
    if (error) {
      console.error(`[Backups] Error: ${error.message}`);
      return res.status(500).json({ error: 'Backup failed', details: stderr });
    }
    console.log(`[Backups] Success: ${stdout}`);
    res.json({ success: true, filename, s3Path });
  });
});

app.post('/api/backups/restore', authenticate, (req, res) => {
  const { s3Key } = req.body;
  
  if (!SERVER_ID || !S3_BUCKET) {
    return res.status(500).json({ error: 'Server configuration error' });
  }
  if (!s3Key || !s3Key.startsWith(`backups/${SERVER_ID}/`)) {
    return res.status(400).json({ error: 'Invalid backup key' });
  }

  const s3Url = `s3://${S3_BUCKET}/${s3Key}`;
  const localZip = 'restore-temp.zip';

  // Download -> Unzip -> Clean
  const cmd = `aws s3 cp "${s3Url}" "${localZip}" && unzip -o "${localZip}" && rm "${localZip}"`;

  console.log(`[Backups] Restoring from: ${s3Url}`);

  exec(cmd, { cwd: process.cwd() }, (error, stdout, stderr) => {
    if (error) {
      console.error(`[Backups] Restore error: ${error.message}`);
      return res.status(500).json({ error: 'Restore failed', details: stderr });
    }
    console.log(`[Backups] Restore success`);
    res.json({ success: true });
  });
});

app.listen(PORT, () => {
  console.log(`File API listening on port ${PORT} (HTTP, proxied by Cloudflare)`);
});