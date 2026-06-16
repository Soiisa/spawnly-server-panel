// scripts/file-api.js
const fsPromises = require('fs').promises;
const fs = require('fs');
const path = require('path');
const express = require('express');
const multer = require('multer');
const archiver = require('archiver');
const cors = require('cors');
const { execFile, exec } = require('child_process'); 

const app = express();
const PORT = process.env.FILE_API_PORT || 3005;
const MAX_UPLOAD_SIZE = 50 * 1024 * 1024;
const SERVER_ID = process.env.SERVER_ID;
const S3_BUCKET = process.env.S3_BUCKET;
const S3_ENDPOINT = process.env.S3_ENDPOINT;

// Use BASE_DIR from environment (SteamCMD = /home/spawnly/server, Minecraft = /opt/minecraft)
const BASE_DIR = process.env.BASE_DIR || process.cwd();

app.use(cors());
app.use(express.json());
const upload = multer({ limits: { fileSize: MAX_UPLOAD_SIZE } });

async function getRconPassword() {
  if (process.env.RCON_PASSWORD) return process.env.RCON_PASSWORD;
  try {
    const props = await fsPromises.readFile(path.join(BASE_DIR, 'server.properties'), 'utf8');
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
  const absPath = path.resolve(BASE_DIR, relPath);
  if (!absPath.startsWith(BASE_DIR)) throw new Error('Invalid path: Access denied');
  return { relPath, absPath };
};

const executeRconCommand = async (command) => {
    const rconPass = await getRconPassword();
    if (!rconPass) throw new Error('RCON not configured');
    const response = await fetch('http://127.0.0.1:3006/api/command', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${rconPass}` }, body: JSON.stringify({ command }) });
    if (!response.ok) throw new Error(`Wrapper API responded with ${response.status}`);
    return "Command Sent";
};

// ========================================================================
// --- Power Management ---
// ========================================================================
app.post('/api/power', authenticate, (req, res) => {
    const { action } = req.body;
    if (!['start', 'stop', 'restart'].includes(action)) return res.status(400).json({ error: 'Invalid power action' });
    exec(`sudo systemctl ${action} game-server`, (error, stdout, stderr) => {
        if (error) return res.status(500).json({ error: 'Power action failed', detail: stderr || error.message });
        res.json({ success: true, log: stdout });
    });
});

// ========================================================================
// --- FICSIT Mod Management ---
// ========================================================================
app.post('/api/install-ficsit', authenticate, async (req, res) => {
    const { modSlug, modVersion } = req.body;
    if (!modSlug || !modVersion) return res.status(400).json({ error: 'Missing modSlug or modVersion' });

    const ficsitDir = path.join(process.env.HOME || '/home/spawnly', '.local', 'share', 'ficsit');
    const profilesPath = path.join(ficsitDir, 'profiles.json');

    try {
        await fsPromises.mkdir(ficsitDir, { recursive: true });
        let profiles = { profiles: { Default: { mods: {}, name: "Default", required_targets: null } }, selected_profile: "Default", version: 0 };
        if (fs.existsSync(profilesPath)) {
            const raw = await fsPromises.readFile(profilesPath, 'utf8');
            try { profiles = JSON.parse(raw); } catch (e) {}
        }
        if (!profiles.profiles) profiles.profiles = {};
        if (!profiles.profiles.Default) profiles.profiles.Default = { mods: {}, name: "Default", required_targets: null };
        if (!profiles.profiles.Default.mods) profiles.profiles.Default.mods = {};

        profiles.profiles.Default.mods[modSlug] = { version: `>=${modVersion.replace(/^v/, '')}`, enabled: true };
        await fsPromises.writeFile(profilesPath, JSON.stringify(profiles, null, 2));

        await new Promise((resolve) => { exec(`/usr/local/bin/ficsit-cli installation add ${BASE_DIR}`, () => resolve()); });
        exec(`/usr/local/bin/ficsit-cli apply`, (error, stdout, stderr) => {
            if (error) return res.status(500).json({ error: 'Installation failed', detail: stderr || error.message });
            res.json({ success: true, log: stdout });
        });
    } catch (err) { res.status(500).json({ error: 'Failed to write profile', detail: err.message }); }
});

app.get('/api/installed-ficsit', authenticate, async (req, res) => {
    const profilesPath = path.join(process.env.HOME || '/home/spawnly', '.local', 'share', 'ficsit', 'profiles.json');
    try {
        if (!fs.existsSync(profilesPath)) return res.json({ mods: {} });
        const profiles = JSON.parse(await fsPromises.readFile(profilesPath, 'utf8'));
        res.json({ mods: profiles.profiles?.Default?.mods || {} });
    } catch (err) { res.status(500).json({ error: 'Failed to read profiles', detail: err.message }); }
});

app.post('/api/uninstall-ficsit', authenticate, async (req, res) => {
    const { modSlug } = req.body;
    if (!modSlug) return res.status(400).json({ error: 'Missing modSlug' });
    const profilesPath = path.join(process.env.HOME || '/home/spawnly', '.local', 'share', 'ficsit', 'profiles.json');
    try {
        if (!fs.existsSync(profilesPath)) return res.status(400).json({ error: 'No mods installed' });
        let profiles = JSON.parse(await fsPromises.readFile(profilesPath, 'utf8'));
        if (profiles.profiles?.Default?.mods?.[modSlug]) {
            delete profiles.profiles.Default.mods[modSlug];
            await fsPromises.writeFile(profilesPath, JSON.stringify(profiles, null, 2));
        }
        exec(`/usr/local/bin/ficsit-cli apply`, (error, stdout, stderr) => {
            if (error) return res.status(500).json({ error: 'Uninstall failed', detail: stderr || error.message });
            res.json({ success: true, log: stdout });
        });
    } catch (err) { res.status(500).json({ error: 'Failed to modify profile', detail: err.message }); }
});

// ========================================================================
// --- File Management (Symlink Supported) ---
// ========================================================================

app.post('/api/directory', authenticate, async (req, res) => {
    try {
        const { path: dirPath } = req.body;
        if (!dirPath) return res.status(400).json({ error: 'Missing path' });
        const { absPath } = validatePath(dirPath);
        await fsPromises.mkdir(absPath, { recursive: true });
        res.json({ success: true, path: dirPath });
    } catch (err) { res.status(500).json({ error: 'Failed to create directory' }); }
});

app.patch('/api/files', authenticate, async (req, res) => {
    try {
        const { oldPath, newPath } = req.body;
        if (!oldPath || !newPath) return res.status(400).json({ error: 'Missing paths' });
        const source = validatePath(oldPath).absPath;
        const dest = validatePath(newPath).absPath;
        await fsPromises.rename(source, dest);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: 'Rename failed', detail: err.message }); }
});

app.get('/api/files', authenticate, async (req, res) => {
  try {
    const { relPath, absPath } = validatePath(req.query.path);
    
    // Use stat (which follows symlinks) instead of lstat
    const stats = await fsPromises.stat(absPath);
    if (!stats.isDirectory()) return res.status(400).json({ error: 'Not a directory' });
    
    const entries = await fsPromises.readdir(absPath);
    const files = await Promise.all(entries.map(async (name) => {
      const entryPath = path.join(absPath, name);
      try {
        // Use stat here too, so symlinks are correctly evaluated as directories or files
        const entryStats = await fsPromises.stat(entryPath);
        return { 
            name: name, 
            isDirectory: entryStats.isDirectory(), 
            size: entryStats.size, 
            modified: entryStats.mtime.toISOString() 
        };
      } catch (e) { 
          // If stat fails (e.g. broken symlink), just skip it
          return null; 
      }
    }));
    res.json({ path: relPath, files: files.filter(f => f) });
  } catch (err) { 
      res.status(500).json({ error: 'Failed to list files', detail: err.message }); 
  }
});

app.get('/api/file', authenticate, async (req, res) => {
  try {
    const { absPath } = validatePath(req.query.path);
    
    // Resolve the symlink to its true hidden path before zipping/downloading
    const realPath = await fsPromises.realpath(absPath);
    const stats = await fsPromises.stat(realPath);

    if (stats.isDirectory()) {
      const archive = archiver('zip', { zlib: { level: 9 } });
      res.attachment(path.basename(absPath) + '.zip');
      archive.pipe(res);
      archive.directory(realPath, false); // Zip the real directory
      archive.finalize();
    } else { 
      res.download(realPath); 
    }
  } catch (err) { 
    res.status(500).json({ error: 'Failed to download' }); 
  }
});

app.post('/api/file', authenticate, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const { absPath: targetDir, relPath } = validatePath(req.body.path);
    const safeFilename = path.basename(req.file.originalname);
    if (safeFilename !== req.file.originalname) return res.status(400).json({ error: 'Invalid filename' });
    
    // Ensure we follow symlinks when saving a file into one
    const resolvedDir = await fsPromises.realpath(targetDir);
    await fsPromises.mkdir(resolvedDir, { recursive: true });
    
    const targetPath = path.join(resolvedDir, safeFilename);
    await fsPromises.writeFile(targetPath, req.file.buffer);
    res.json({ success: true, path: path.join(relPath, safeFilename) });
  } catch (err) { res.status(500).json({ error: 'Failed to upload' }); }
});

app.put('/api/file', authenticate, async (req, res) => {
  try {
    const { absPath } = validatePath(req.query.path);
    // Resolve the real path in case we are modifying a file inside a symlink
    const resolvedPath = await fsPromises.realpath(absPath).catch(() => absPath);
    await fsPromises.mkdir(path.dirname(resolvedPath), { recursive: true });
    const writeStream = fs.createWriteStream(resolvedPath);
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

// ========================================================================
// --- Smart Backups ---
// ========================================================================
app.post('/api/backups', authenticate, async (req, res) => {
  if (!SERVER_ID || !S3_BUCKET) return res.status(500).json({ error: 'Server configuration error' });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `backup-${timestamp}.zip`;
  const tempFilePath = path.join('/tmp', filename);
  const s3Path = `s3://${S3_BUCKET}/backups/${SERVER_ID}/${filename}`;
  
  try {
    try { await executeRconCommand('save-all'); } catch (e) {}
    
    await new Promise((resolve, reject) => {
        const output = fs.createWriteStream(tempFilePath);
        const archive = archiver('zip', { zlib: { level: 9 } });
        output.on('close', resolve);
        archive.on('error', reject);
        archive.pipe(output);

        const isSatisfactory = fs.existsSync(path.join(BASE_DIR, 'FactoryGame'));

        if (isSatisfactory) {
            console.log(`[Backup] Detected Satisfactory. Zipping specific save and config folders.`);
            const homeDir = process.env.HOME || '/home/spawnly';
            const saveDir = path.join(homeDir, '.config/Epic/FactoryGame/Saved/SaveGames');
            const ficsitDir = path.join(homeDir, '.local/share/ficsit');
            const configDir = path.join(BASE_DIR, 'FactoryGame/Saved/Config');

            if (fs.existsSync(saveDir)) archive.directory(saveDir, 'SaveGames');
            if (fs.existsSync(ficsitDir)) archive.directory(ficsitDir, 'ficsit');
            if (fs.existsSync(configDir)) archive.directory(configDir, 'Config');
        } else {
            console.log(`[Backup] Standard Backup. Zipping entire directory.`);
            archive.glob('**/*', { cwd: BASE_DIR, ignore: ['node_modules/**', 'package.json', 'package-lock.json', 'file-api.js', 'metrics-server.js', 'properties-api.js', 'server-wrapper.js', 'status-reporter.js', 'console-server.js', 'mock-api.js', 'test-*.js', 'startup.sh', 'mc-sync.sh', 'mc-sync-from-s3.sh', 'logs/**', 'crash-reports/**', 'debug/**', 'cache/**', 'web/**', 'dynmap/**', 'bluemap/**', 'backups/**', 'simplebackups/**', '*.zip', '*.tar.gz', '*.rar', 'serverinstaller', '*installer*.jar'], dot: true });
        }

        archive.finalize();
    });
    
    const endpointArg = S3_ENDPOINT ? ['--endpoint-url', S3_ENDPOINT] : [];
    await new Promise((resolve, reject) => { execFile('/usr/local/bin/s5cmd', [...endpointArg, 'cp', tempFilePath, s3Path], (error, stdout, stderr) => { if (error) reject(new Error(stderr || error.message)); else resolve(stdout); }); });
    res.json({ success: true, filename, s3Path });
  } catch (err) { 
    res.status(500).json({ error: 'Backup failed', details: err.message }); 
  } finally { 
    if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath); 
  }
});

app.post('/api/backups/restore', authenticate, (req, res) => {
  const { s3Key } = req.body;
  if (!SERVER_ID || !S3_BUCKET || !s3Key) return res.status(400).json({ error: 'Invalid Request' });
  const s3Url = `s3://${S3_BUCKET}/${s3Key}`;
  const localZip = '/tmp/restore-temp.zip';
  const extractDir = '/tmp/restore-extract';
  const endpointArg = S3_ENDPOINT ? `--endpoint-url "${S3_ENDPOINT}"` : '';

  const isSatisfactory = fs.existsSync(path.join(BASE_DIR, 'FactoryGame'));
  let restoreCmd = '';

  if (isSatisfactory) {
      console.log(`[Restore] Performing Satisfactory specific structure restore.`);
      const homeDir = process.env.HOME || '/home/spawnly';
      restoreCmd = `
          /usr/local/bin/s5cmd ${endpointArg} cp "${s3Url}" "${localZip}" &&
          rm -rf "${extractDir}" && mkdir -p "${extractDir}" &&
          unzip -o "${localZip}" -d "${extractDir}" &&
          ( [ -d "${extractDir}/SaveGames" ] && mkdir -p "${homeDir}/.config/Epic/FactoryGame/Saved/SaveGames" && cp -a "${extractDir}/SaveGames/." "${homeDir}/.config/Epic/FactoryGame/Saved/SaveGames/" || true ) &&
          ( [ -d "${extractDir}/ficsit" ] && mkdir -p "${homeDir}/.local/share/ficsit" && cp -a "${extractDir}/ficsit/." "${homeDir}/.local/share/ficsit/" || true ) &&
          ( [ -d "${extractDir}/Config" ] && mkdir -p "${BASE_DIR}/FactoryGame/Saved/Config" && cp -a "${extractDir}/Config/." "${BASE_DIR}/FactoryGame/Saved/Config/" || true ) &&
          rm -rf "${extractDir}" "${localZip}" &&
          /usr/local/bin/ficsit-cli apply
      `;
  } else {
      console.log(`[Restore] Performing generic base directory restore.`);
      restoreCmd = `/usr/local/bin/s5cmd ${endpointArg} cp "${s3Url}" "${localZip}" && unzip -o "${localZip}" -d "${BASE_DIR}" && rm "${localZip}"`;
  }
  
  exec(restoreCmd, (error, stdout, stderr) => { 
      if (error) return res.status(500).json({ error: 'Restore failed', details: stderr }); 
      res.json({ success: true }); 
  });
});

app.listen(PORT, () => { console.log(`File API listening on port ${PORT} serving directory ${BASE_DIR}`); });