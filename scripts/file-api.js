// scripts/file-api.js
const fs = require('fs').promises;
const path = require('path');
const express = require('express');
const multer = require('multer');
const archiver = require('archiver');
const cors = require('cors');
// --- FIX: Include exec for shell piping commands ---
const { execFile, exec } = require('child_process'); 

const app = express();
const PORT = process.env.FILE_API_PORT || 3005;
const MAX_UPLOAD_SIZE = 50 * 1024 * 1024;

// --- ADDED: Constants from provision.js for backup ---
const SERVER_ID = process.env.SERVER_ID;
const S3_BUCKET = process.env.S3_BUCKET;
const S3_ENDPOINT = process.env.S3_ENDPOINT;
// -----------------------------------------------------

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

// --- NEW HELPER: Execute RCON command and wait for result ---
const executeRconCommand = (command) => {
    return new Promise(async (resolve, reject) => {
        const rconPass = await getRconPassword();
        if (!rconPass) return reject(new Error('RCON not configured'));

        // Use execFile to securely run mcrcon and wait for result
        execFile('mcrcon', ['-H', '127.0.0.1', '-p', rconPass, command], (error, stdout, stderr) => {
            if (error) {
                console.error(`RCON Command '${command}' Failed:`, error.message);
                reject(new Error(`RCON command failed: ${error.message}`));
            }
            console.log(`RCON Command '${command}' Output: ${stdout.toString().trim()}`);
            resolve(stdout.toString().trim());
        });
    });
};
// -----------------------------------------------------------

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
    // Re-use the secure RCON helper
    const output = await executeRconCommand(command);
    res.json({ output });
  } catch (error) {
    console.error('RCON error:', error.message);
    res.status(500).json({ error: 'Internal server error', detail: error.message });
  }
});

// --- NEW BACKUP ENDPOINT ---
app.post('/api/backups', authenticate, async (req, res) => {
  if (!SERVER_ID || !S3_BUCKET) {
    return res.status(500).json({ error: 'Server configuration error (Missing ID/Bucket)' });
  }
  
  try {
    // 1. Execute save-all RCON command (CRITICAL STEP)
    console.log('[Backups] Executing /save-all command to flush data to disk...');
    // We await this command to ensure world data is persisted before zipping
    const saveOutput = await executeRconCommand('save-all');
    console.log(`[Backups] Save command complete: ${saveOutput}`);

    // 2. Proceed with backup
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `backup-${timestamp}.zip`;
    const s3Path = `s3://${S3_BUCKET}/backups/${SERVER_ID}/${filename}`;
    const endpointFlag = S3_ENDPOINT ? `--endpoint-url "${S3_ENDPOINT}"` : '';

    // Selective Backup Command
    const cmd = `zip -r - . -i "world/*" "world_nether/*" "world_the_end/*" "mods/*" "plugins/*" "server.properties" "*.json" | aws s3 cp - "${s3Path}" ${endpointFlag}`;

    console.log(`[Backups] Starting zip and upload: ${cmd}`);
    
    // Using exec to run shell pipeline
    const { stdout, stderr } = await new Promise((resolve, reject) => {
        exec(cmd, { cwd: process.cwd() }, (error, stdout, stderr) => {
            if (error) {
                reject({ error, stderr });
            } else {
                resolve({ stdout, stderr });
            }
        });
    });

    console.log(`[Backups] Upload Success: ${stdout}`);
    res.json({ success: true, filename, s3Path });

  } catch (err) {
    console.error('[Backups] Critical Error:', err.message);
    const details = err.stderr || err.message;
    res.status(500).json({ error: 'Backup failed', details: details });
  }
});
// ---------------------------

// --- NEW RESTORE ENDPOINT ---
app.post('/api/backups/restore', authenticate, (req, res) => {
  const { s3Key } = req.body;
  
  if (!SERVER_ID || !S3_BUCKET) return res.status(500).json({ error: 'Server configuration error' });
  if (!s3Key || !s3Key.startsWith(`backups/${SERVER_ID}/`)) return res.status(400).json({ error: 'Invalid backup key' });

  const s3Url = `s3://${S3_BUCKET}/${s3Key}`;
  const localZip = 'restore-temp.zip';
  
  const endpointFlag = S3_ENDPOINT ? `--endpoint-url "${S3_ENDPOINT}"` : '';

  // Use exec for shell piping/chaining commands
  const cmd = `aws s3 cp "${s3Url}" "${localZip}" ${endpointFlag} && unzip -o "${localZip}" && rm "${localZip}"`;

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
// ----------------------------

app.listen(PORT, () => {
  console.log(`File API listening on port ${PORT} (HTTP, proxied by Cloudflare)`);
});