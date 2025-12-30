// scripts/file-api.js
const fsPromises = require('fs').promises;
const fs = require('fs');
const path = require('path');
const express = require('express');
const multer = require('multer');
const archiver = require('archiver');
const cors = require('cors');
const { execFile } = require('child_process'); 

const app = express();
const PORT = process.env.FILE_API_PORT || 3005;
const MAX_UPLOAD_SIZE = 50 * 1024 * 1024;
const SERVER_ID = process.env.SERVER_ID;
const S3_BUCKET = process.env.S3_BUCKET;
const S3_ENDPOINT = process.env.S3_ENDPOINT;

app.use(cors());
app.use(express.json());
const upload = multer({ limits: { fileSize: MAX_UPLOAD_SIZE } });

async function getRconPassword() {
  try {
    const props = await fsPromises.readFile(path.join(process.cwd(), 'server.properties'), 'utf8');
    const match = props.match(/^rcon\.password=(.*)$/m);
    return match ? match[1].trim() : null;
  } catch (e) { return null; }
}

const authenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  const token = authHeader.substring(7);
  const rconPass = await getRconPassword();
  if (!rconPass || token !== rconPass) return res.status(403).json({ error: 'Invalid token' });
  next();
};

const validatePath = (reqPath) => {
  const relPath = (reqPath || '').replace(/^(\.\.(\/|\\|$))+/, '').replace(/^\/+/, '');
  if (relPath.includes('..')) throw new Error('Invalid path: Traversal detected');
  const absPath = path.resolve(process.cwd(), relPath);
  if (!absPath.startsWith(process.cwd())) throw new Error('Invalid path: Access denied');
  return { relPath, absPath };
};

const executeRconCommand = async (command) => {
    const rconPass = await getRconPassword();
    if (!rconPass) throw new Error('RCON not configured');
    const response = await fetch('http://127.0.0.1:3006/api/command', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${rconPass}` }, body: JSON.stringify({ command }) });
    if (!response.ok) throw new Error(`Wrapper API responded with ${response.status}`);
    return "Command Sent";
};

// --- Routes ---

app.post('/api/directory', authenticate, async (req, res) => {
    try {
        const { path: dirPath } = req.body;
        if (!dirPath) return res.status(400).json({ error: 'Missing path' });
        const { absPath } = validatePath(dirPath);
        await fsPromises.mkdir(absPath, { recursive: true });
        res.json({ success: true, path: dirPath });
    } catch (err) { res.status(500).json({ error: 'Failed to create directory' }); }
});

// NEW: Rename Endpoint
app.patch('/api/files', authenticate, async (req, res) => {
    try {
        const { oldPath, newPath } = req.body;
        if (!oldPath || !newPath) return res.status(400).json({ error: 'Missing paths' });
        
        const source = validatePath(oldPath).absPath;
        const dest = validatePath(newPath).absPath;
        
        await fsPromises.rename(source, dest);
        res.json({ success: true });
    } catch (err) {
        console.error('Rename error:', err);
        res.status(500).json({ error: 'Rename failed', detail: err.message });
    }
});

app.get('/api/files', authenticate, async (req, res) => {
  try {
    const { relPath, absPath } = validatePath(req.query.path);
    const stats = await fsPromises.stat(absPath);
    if (!stats.isDirectory()) return res.status(400).json({ error: 'Not a directory' });
    const entries = await fsPromises.readdir(absPath, { withFileTypes: true });
    const files = await Promise.all(entries.map(async (entry) => {
      const entryPath = path.join(absPath, entry.name);
      try {
        const entryStats = await fsPromises.stat(entryPath);
        return { name: entry.name, isDirectory: entry.isDirectory(), size: entryStats.size, modified: entryStats.mtime.toISOString() };
      } catch (e) { return null; }
    }));
    res.json({ path: relPath, files: files.filter(f => f) });
  } catch (err) { res.status(500).json({ error: 'Failed to list files' }); }
});

app.get('/api/file', authenticate, async (req, res) => {
  try {
    const { absPath } = validatePath(req.query.path);
    const stats = await fsPromises.stat(absPath);
    if (stats.isDirectory()) {
      const archive = archiver('zip', { zlib: { level: 9 } });
      res.attachment(path.basename(absPath) + '.zip');
      archive.pipe(res);
      archive.directory(absPath, false);
      archive.finalize();
    } else { res.download(absPath); }
  } catch (err) { res.status(500).json({ error: 'Failed to download' }); }
});

app.post('/api/file', authenticate, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const { absPath: targetDir, relPath } = validatePath(req.body.path);
    const safeFilename = path.basename(req.file.originalname);
    if (safeFilename !== req.file.originalname) return res.status(400).json({ error: 'Invalid filename' });
    await fsPromises.mkdir(targetDir, { recursive: true });
    const targetPath = path.join(targetDir, safeFilename);
    await fsPromises.writeFile(targetPath, req.file.buffer);
    res.json({ success: true, path: path.join(relPath, safeFilename) });
  } catch (err) { res.status(500).json({ error: 'Failed to upload' }); }
});

app.put('/api/file', authenticate, async (req, res) => {
  try {
    const { absPath } = validatePath(req.query.path);
    await fsPromises.mkdir(path.dirname(absPath), { recursive: true });
    const writeStream = fs.createWriteStream(absPath);
    req.pipe(writeStream);
    writeStream.on('finish', () => res.json({ success: true }));
    writeStream.on('error', (err) => res.status(500).json({ error: 'Failed to write file' }));
  } catch (err) { res.status(500).json({ error: 'Failed to update file' }); }
});

app.post('/api/rcon', authenticate, async (req, res) => {
  const { command } = req.body;
  if (!command) return res.status(400).json({ error: 'Missing command' });
  try { const output = await executeRconCommand(command); res.json({ output }); } 
  catch (error) { res.status(500).json({ error: 'Internal server error', detail: error.message }); }
});

app.post('/api/backups', authenticate, async (req, res) => {
  if (!SERVER_ID || !S3_BUCKET) return res.status(500).json({ error: 'Server configuration error' });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `backup-${timestamp}.zip`;
  const tempFilePath = path.join(process.cwd(), filename);
  const s3Path = `s3://${S3_BUCKET}/backups/${SERVER_ID}/${filename}`;
  try {
    await executeRconCommand('save-all');
    await new Promise((resolve, reject) => {
        const output = fs.createWriteStream(tempFilePath);
        const archive = archiver('zip', { zlib: { level: 9 } });
        output.on('close', resolve);
        archive.on('error', reject);
        archive.pipe(output);
        archive.glob('**/*', { cwd: process.cwd(), ignore: ['node_modules/**', 'package.json', 'package-lock.json', 'file-api.js', 'metrics-server.js', 'properties-api.js', 'server-wrapper.js', 'status-reporter.js', 'console-server.js', 'mock-api.js', 'test-*.js', 'startup.sh', 'mc-sync.sh', 'mc-sync-from-s3.sh', 'logs/**', 'crash-reports/**', 'debug/**', 'cache/**', 'web/**', 'dynmap/**', 'bluemap/**', 'backups/**', 'simplebackups/**', '*.zip', '*.tar.gz', '*.rar', 'serverinstaller', '*installer*.jar'], dot: true });
        archive.finalize();
    });
    const endpointArg = S3_ENDPOINT ? ['--endpoint-url', S3_ENDPOINT] : [];
    await new Promise((resolve, reject) => { execFile('/usr/local/bin/s5cmd', [...endpointArg, 'cp', tempFilePath, s3Path], (error, stdout, stderr) => { if (error) reject(new Error(stderr || error.message)); else resolve(stdout); }); });
    res.json({ success: true, filename, s3Path });
  } catch (err) { res.status(500).json({ error: 'Backup failed', details: err.message }); } 
  finally { if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath); }
});

app.post('/api/backups/restore', authenticate, (req, res) => {
  const { s3Key } = req.body;
  if (!SERVER_ID || !S3_BUCKET || !s3Key) return res.status(400).json({ error: 'Invalid Request' });
  const s3Url = `s3://${S3_BUCKET}/${s3Key}`;
  const localZip = 'restore-temp.zip';
  const endpointArg = S3_ENDPOINT ? `--endpoint-url "${S3_ENDPOINT}"` : '';
  const cmd = `/usr/local/bin/s5cmd ${endpointArg} cp "${s3Url}" "${localZip}" && unzip -o "${localZip}" && rm "${localZip}"`;
  const { exec } = require('child_process');
  exec(cmd, { cwd: process.cwd() }, (error, stdout, stderr) => { if (error) return res.status(500).json({ error: 'Restore failed', details: stderr }); res.json({ success: true }); });
});

app.listen(PORT, () => { console.log(`File API listening on port ${PORT}`); });