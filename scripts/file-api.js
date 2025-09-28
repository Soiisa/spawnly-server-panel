const fs = require('fs').promises;
const path = require('path');
const express = require('express');
const multer = require('multer');
const archiver = require('archiver');
const cors = require('cors');

const app = express();
const PORT = process.env.FILE_API_PORT || 3005;
const MAX_UPLOAD_SIZE = 50 * 1024 * 1024;

app.use(cors());
app.use(express.json());
const upload = multer({ limits: { fileSize: MAX_UPLOAD_SIZE } });

async function getRconPassword() {
  const props = await fs.readFile(path.join(process.cwd(), 'server.properties'), 'utf8');
  const match = props.match(/^rcon\.password=(.*)$/m);
  return match ? match[1].trim() : null;
}

const authenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const token = authHeader.substring(7);
  const rconPass = await getRconPassword();
  if (token !== rconPass) {
    return res.status(403).json({ error: 'Invalid token' });
  }
  next();
};

app.get('/api/files', authenticate, async (req, res) => {
  try {
    let relPath = req.query.path || '';
    relPath = relPath.replace(/^\/+/, '');
    const absPath = path.resolve(process.cwd(), relPath);
    if (!absPath.startsWith(process.cwd())) {
      return res.status(403).json({ error: 'Invalid path' });
    }
    const stats = await fs.stat(absPath);
    if (!stats.isDirectory()) {
      return res.status(400).json({ error: 'Not a directory' });
    }
    const entries = await fs.readdir(absPath, { withFileTypes: true });
    const files = await Promise.all(entries.map(async (entry) => {
      const entryPath = path.join(absPath, entry.name);
      const entryStats = await fs.stat(entryPath);
      return {
        name: entry.name,
        isDirectory: entry.isDirectory(),
        size: entryStats.size,
        modified: entryStats.mtime.toISOString(),
      };
    }));
    res.json({ path: relPath, files });
  } catch (err) {
    console.error('Error listing files:', err.message, err.stack);
    res.status(500).json({ error: 'Failed to list files', detail: err.message });
  }
});

app.get('/api/file', authenticate, async (req, res) => {
  try {
    let relPath = req.query.path;
    if (!relPath) return res.status(400).json({ error: 'Missing path' });
    relPath = relPath.replace(/^\/+/, '');
    const absPath = path.resolve(process.cwd(), relPath);
    if (!absPath.startsWith(process.cwd())) {
      return res.status(403).json({ error: 'Invalid path' });
    }
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
    console.error('Error downloading file:', err.message, err.stack);
    res.status(500).json({ error: 'Failed to download', detail: err.message });
  }
});

app.post('/api/file', authenticate, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    let relPath = req.body.path || '';
    relPath = relPath.replace(/^\/+/, '');
    const targetDir = path.resolve(process.cwd(), relPath);
    if (!targetDir.startsWith(process.cwd())) {
      return res.status(403).json({ error: 'Invalid path' });
    }
    await fs.mkdir(targetDir, { recursive: true });
    const targetPath = path.join(targetDir, req.file.originalname);
    await fs.writeFile(targetPath, req.file.buffer);
    res.json({ success: true, path: path.join(relPath, req.file.originalname) });
  } catch (err) {
    console.error('Error uploading file:', err.message, err.stack);
    res.status(500).json({ error: 'Failed to upload', detail: err.message });
  }
});

app.put('/api/file', authenticate, async (req, res) => {
  try {
    let relPath = req.query.path;
    if (!relPath) return res.status(400).json({ error: 'Missing path' });
    relPath = relPath.replace(/^\/+/, '');
    const absPath = path.resolve(process.cwd(), relPath);
    if (!absPath.startsWith(process.cwd())) {
      return res.status(403).json({ error: 'Invalid path' });
    }
    await fs.mkdir(path.dirname(absPath), { recursive: true });
    await fs.writeFile(absPath, req.body);
    res.json({ success: true });
  } catch (err) {
    console.error('Error updating file:', err.message, err.stack);
    res.status(500).json({ error: 'Failed to update file', detail: err.message });
  }
});

app.post('/api/rcon', authenticate, async (req, res) => {
  const { command } = req.body;
  if (!command) return res.status(400).json({ error: 'Missing command' });
  try {
    const { execSync } = require('child_process');
    const rconPass = await getRconPassword();
    if (!rconPass) return res.status(500).json({ error: 'RCON not configured' });
    const output = execSync(`mcrcon -H 127.0.0.1 -p "${rconPass}" "${command}"`).toString().trim();
    res.json({ output });
  } catch (error) {
    console.error('RCON error:', error.message, error.stack);
    res.status(500).json({ error: 'Failed to execute command', detail: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`File API listening on port ${PORT} (HTTP, proxied by Cloudflare)`);
});