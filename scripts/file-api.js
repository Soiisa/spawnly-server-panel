// scripts/file-api.js
const fsPromises = require('fs').promises;
const fs = require('fs');
const path = require('path');
const express = require('express');
const multer = require('multer');
const archiver = require('archiver');
const cors = require('cors');
const { execFile, exec, spawn } = require('child_process'); 
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const app = express();
const PORT = process.env.FILE_API_PORT || 3005;
const MAX_UPLOAD_SIZE = 50 * 1024 * 1024;
const SERVER_ID = process.env.SERVER_ID;
const S3_BUCKET = process.env.S3_BUCKET;
const S3_ENDPOINT = process.env.S3_ENDPOINT;
const TARGET_URL = process.env.NEXTJS_API_URL || 'http://localhost/api/servers/log';

const BASE_DIR = process.env.BASE_DIR || process.cwd();
const homeDir = process.env.HOME || '/home/spawnly';

// ========================================================================
// --- SECURITY: Forbidden Executable Extensions ---
// ========================================================================
const FORBIDDEN_EXTENSIONS = ['.sh', '.bash', '.exe', '.bat', '.cmd', '.elf', '.pl', '.py', '.rb', '.appimage', '.bin'];

const isForbidden = (filename) => {
    const ext = path.extname(filename).toLowerCase();
    return FORBIDDEN_EXTENSIONS.includes(ext);
};

// ========================================================================
// --- Extended Game Detection ---
// ========================================================================
const isSatisfactory = fs.existsSync(path.join(BASE_DIR, 'FactoryGame'));
const isRust = fs.existsSync(path.join(BASE_DIR, 'RustDedicated'));
const isArma3 = fs.existsSync(path.join(BASE_DIR, 'arma3server'));
const isArmaReforger = fs.existsSync(path.join(BASE_DIR, 'ArmaReforgerServer'));
const isDayZ = fs.existsSync(path.join(BASE_DIR, 'DayZServer'));
const isPalworld = fs.existsSync(path.join(BASE_DIR, 'PalServer.sh'));
const isValheim = fs.existsSync(path.join(BASE_DIR, 'valheim_server.x86_64'));
const isZomboid = fs.existsSync(path.join(BASE_DIR, 'projectzomboid'));
const isCS2 = fs.existsSync(path.join(BASE_DIR, 'game/bin/linuxsteamrt64/cs2'));
const isGmod = fs.existsSync(path.join(BASE_DIR, 'srcds_run')) && fs.existsSync(path.join(BASE_DIR, 'garrysmod'));
const isArkSE = fs.existsSync(path.join(BASE_DIR, 'ShooterGame/Binaries/Linux/ShooterGameServer')) && !fs.existsSync(path.join(BASE_DIR, 'ShooterGame/Binaries/Linux/ArkAscendedServer'));
const isArkSA = fs.existsSync(path.join(BASE_DIR, 'ShooterGame/Binaries/Linux/ArkAscendedServer'));
const isFactorio = fs.existsSync(path.join(BASE_DIR, 'bin/x64/factorio'));
const isSpaceEngineers = fs.existsSync(path.join(BASE_DIR, 'DedicatedServer64/SpaceEngineersDedicated.exe'));
const isConanExiles = fs.existsSync(path.join(BASE_DIR, 'ConanSandboxServer-Win64-Test.exe'));
const isCoreKeeper = fs.existsSync(path.join(BASE_DIR, '_launch.sh'));
const isDST = fs.existsSync(path.join(BASE_DIR, 'bin/dontstarve_dedicated_server_nullrenderer'));

const GAME_TYPE = isSatisfactory ? 'satisfactory' : isRust ? 'rust' : isArma3 ? 'arma3' : isArmaReforger ? 'arma_reforger' : isDayZ ? 'dayz' : isPalworld ? 'palworld' : isValheim ? 'valheim' : isZomboid ? 'project_zomboid' : isCS2 ? 'cs2' : isGmod ? 'gmod' : isArkSE ? 'ark_se' : isArkSA ? 'ark_sa' : isFactorio ? 'factorio' : isSpaceEngineers ? 'space_engineers' : isConanExiles ? 'conan_exiles' : isCoreKeeper ? 'core_keeper' : isDST ? 'dst' : 'unknown';

// ========================================================================
// --- Symlink Generator for Hidden Save Directories ---
// ========================================================================
const externalPaths = [
    { game: isValheim, src: path.join(homeDir, '.config/unity3d/IronGate/Valheim'), link: path.join(BASE_DIR, 'Valheim_Saves') },
    { game: isZomboid, src: path.join(homeDir, 'Zomboid'), link: path.join(BASE_DIR, 'Zomboid_Data') },
    { game: isSpaceEngineers, src: path.join(homeDir, '.wine/drive_c/users/spawnly/AppData/Roaming/SpaceEngineersDedicated'), link: path.join(BASE_DIR, 'SpaceEngineers_Data') },
    { game: isSatisfactory, src: path.join(homeDir, '.config/Epic/FactoryGame/Saved/SaveGames'), link: path.join(BASE_DIR, 'Satisfactory_Saves') },
    { game: isCoreKeeper, src: path.join(homeDir, '.config/unity3d/Pugstorm/Core Keeper/DedicatedServer'), link: path.join(BASE_DIR, 'CoreKeeper_Saves') },
    { game: isDST, src: path.join(homeDir, '.klei/DoNotStarveTogether'), link: path.join(BASE_DIR, 'DST_Saves') },
    { game: isArma3 || isDayZ, src: path.join(homeDir, '.local/share/Arma 3 - Other Profiles'), link: path.join(BASE_DIR, 'Arma_Profiles') }
];

externalPaths.forEach(({ game, src, link }) => {
    if (game) {
        if (!fs.existsSync(src)) fs.mkdirSync(src, { recursive: true });
        try { if (!fs.existsSync(link)) fs.symlinkSync(src, link, 'dir'); } catch (e) {}
    }
});

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
    const fetchOptions = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${rconPass}` },
        body: JSON.stringify({ command })
    };
    let response = await fetch('http://127.0.0.1:3006/api/command', fetchOptions).catch(() => null);
    if (!response || response.status === 404) response = await fetch('http://127.0.0.1:3006/command', fetchOptions).catch(() => null);
    if (!response || !response.ok) throw new Error(`Wrapper offline or unavailable`);
    return "Command Sent";
};

// --- Remote Log Streaming ---
let logQueue = [];
setInterval(async () => {
    if (logQueue.length === 0) return;
    const logsToSend = logQueue.join('\n');
    logQueue = [];
    const rconPass = await getRconPassword();
    try {
        await fetch(TARGET_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${rconPass}` },
            body: JSON.stringify({ serverId: SERVER_ID, console_log: logsToSend })
        });
    } catch (e) {}
}, 2000);

function pushLog(message) {
    logQueue.push(message);
    console.log(message);
}

// ========================================================================
// --- Arma/DayZ Mod Lowercase Converter ---
// ========================================================================
async function lowercaseModPaths(targetDir) {
    try {
        const entries = await fsPromises.readdir(targetDir, { withFileTypes: true });
        for (const entry of entries) {
            const oldPath = path.join(targetDir, entry.name);
            if (entry.isDirectory()) {
                await lowercaseModPaths(oldPath); 
            }
            const lowerName = entry.name.toLowerCase();
            if (entry.name !== lowerName) {
                const newPath = path.join(targetDir, lowerName);
                await fsPromises.rename(oldPath, newPath);
            }
        }
    } catch (err) {
        console.error(`[Mod Converter] Failed to lowercase ${targetDir}:`, err);
    }
}

// ========================================================================
// --- Mod & Plugin Installers ---
// ========================================================================
app.post('/api/install-oxide', authenticate, (req, res) => {
    if (!isRust) return res.status(400).json({ error: 'Only applicable to Rust' });
    pushLog('[File API] Downloading and installing Oxide/uMod...');
    
    const cmd = 'curl -sL "https://umod.org/games/rust/download?tag=public" -o oxide.zip && unzip -o oxide.zip && rm oxide.zip';
    exec(cmd, { cwd: '/home/spawnly/server' }, (err, stdout, stderr) => {
        if (err) return res.status(500).json({ error: 'Failed to extract Oxide', detail: stderr });
        pushLog('[File API] Oxide Framework installed successfully!');
        res.json({ success: true });
    });
});

function downloadWorkshopItem(appId, workshopId, attempt = 1) {
    const maxAttempts = 3;
    pushLog(`[Workshop] Attempt ${attempt}/${maxAttempts}: Starting download for Mod ID ${workshopId}...`);

    let steamLogin = "+login anonymous";
    if (isArma3 || isDayZ) steamLogin = "+login spawnlyserverhosting SpawnlyHosting";
    const loginArgs = steamLogin.split(' ');

    const args = [
        '@sSteamCmdForcePlatformType', 'linux',
        '+force_install_dir', '/home/spawnly/server',
        ...loginArgs,
        '+workshop_download_item', appId, workshopId, 'validate',
        '+quit'
    ];

    const child = spawn('/usr/games/steamcmd', args, { cwd: '/home/spawnly/server' });
    let hasError = false;

    child.stdout.on('data', (data) => {
        const lines = data.toString().split('\n');
        lines.forEach(line => {
            const trimmed = line.trim();
            if (trimmed && !trimmed.includes('Checking for available updates') && !trimmed.includes('UpdateUI: skip show logo')) {
                pushLog(`[SteamCMD] ${trimmed}`);
            }
            if (trimmed.includes('ERROR!') || trimmed.includes('failed (Failure)') || trimmed.includes('Timeout')) hasError = true;
        });
    });

    child.on('close', async (code) => {
        if (code !== 0 || hasError) {
            if (attempt < maxAttempts) {
                pushLog(`[Workshop] ⚠️ Download failed/timed out. Retrying in 5 seconds...`);
                setTimeout(() => downloadWorkshopItem(appId, workshopId, attempt + 1), 5000);
            } else {
                pushLog(`[Workshop] ❌ CRITICAL: Failed to download Mod ${workshopId} after 3 attempts.`);
            }
        } else {
            pushLog(`[Workshop] ✅ Download complete for ${workshopId}! Evaluating engine routing requirements...`);
            
            const modDir = `/home/spawnly/server/steamapps/workshop/content/${appId}/${workshopId}`;
            if (!fs.existsSync(modDir)) return pushLog(`[Workshop] ❌ Error: Mod directory not found after download.`);

            // 1. ARMA / DAYZ (Lowercase, _legacy.bin mapping, symlinks)
            if (isArma3 || isDayZ || isArmaReforger) {
                const targetModDir = `/home/spawnly/server/@${workshopId}`;
                const missionsDir = `/home/spawnly/server/mpmissions`;
                
                const files = fs.readdirSync(modDir);
                const legacyBin = files.find(f => f.endsWith('_legacy.bin'));

                if (legacyBin) {
                    pushLog(`[Workshop] Detected Scenario/Mission file! Extracting and moving...`);
                    if (!fs.existsSync(missionsDir)) fs.mkdirSync(missionsDir, { recursive: true });
                    const sourcePath = path.join(modDir, legacyBin);
                    const missionName = `workshop_${workshopId}.pbo`; 
                    const targetPath = path.join(missionsDir, missionName);

                    fs.renameSync(sourcePath, targetPath);
                    fs.rmSync(modDir, { recursive: true, force: true });
                    pushLog(`[Workshop] 🚀 Scenario successfully moved to mpmissions/${missionName}!`);
                } else {
                    pushLog(`[Workshop] Converting Windows mod paths to Linux lowercase...`);
                    await lowercaseModPaths(modDir);

                    const postCmd = `ln -sfn ${modDir} ${targetModDir} && mkdir -p /home/spawnly/server/keys && find ${modDir} -name "*.bikey" -exec cp {} /home/spawnly/server/keys/ \\;`;
                    exec(postCmd, { cwd: '/home/spawnly/server' }, (postErr) => {
                        if (postErr) pushLog(`[Workshop] ❌ Failed to link mod folder or copy keys for ${workshopId}.`);
                        else pushLog(`[Workshop] 🚀 Mod @${workshopId} successfully installed, converted, and keys copied!`);
                    });
                }
            } 
            // 2. SOURCE ENGINE (Move .gma / .vpk / .bsp)
            else if (isGmod || isCS2 || process.env.GAME_TYPE === 'l4d2' || process.env.GAME_TYPE === 'tf2') {
                pushLog(`[Workshop] Source Engine detected. Extracting addons and maps...`);
                let gameFolder = isGmod ? 'garrysmod' : process.env.GAME_TYPE === 'l4d2' ? 'left4dead2' : process.env.GAME_TYPE === 'tf2' ? 'tf' : 'game/csgo';
                const addonsDir = `/home/spawnly/server/${gameFolder}/addons`;
                const mapsDir = `/home/spawnly/server/${gameFolder}/maps`;

                const files = fs.readdirSync(modDir);
                let moved = false;

                for (const f of files) {
                    if (f.endsWith('.gma') || f.endsWith('.vpk')) {
                        if (!fs.existsSync(addonsDir)) fs.mkdirSync(addonsDir, { recursive: true });
                        fs.renameSync(path.join(modDir, f), path.join(addonsDir, f));
                        moved = true;
                    } else if (f.endsWith('.bsp')) {
                        if (!fs.existsSync(mapsDir)) fs.mkdirSync(mapsDir, { recursive: true });
                        fs.renameSync(path.join(modDir, f), path.join(mapsDir, f));
                        moved = true;
                    }
                }

                if (moved) {
                    fs.rmSync(modDir, { recursive: true, force: true });
                    pushLog(`[Workshop] 🚀 Addons/Maps successfully routed to ${gameFolder}!`);
                } else {
                    pushLog(`[Workshop] No .gma, .vpk, or .bsp files found. Left in workshop folder.`);
                }
            } 
            // 3. ARK SURVIVAL (Move .mod and assets)
            else if (isArkSE || isArkSA) {
                pushLog(`[Workshop] ARK detected. Moving .mod and assets...`);
                const targetDir = `/home/spawnly/server/ShooterGame/Content/Mods`;
                if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

                const files = fs.readdirSync(modDir);
                for (const f of files) {
                    fs.renameSync(path.join(modDir, f), path.join(targetDir, f));
                }
                fs.rmSync(modDir, { recursive: true, force: true });
                pushLog(`[Workshop] 🚀 ARK Mod ${workshopId} moved to ShooterGame/Content/Mods!`);
            } 
            // 4. CONAN EXILES (Move .pak and generate modlist)
            else if (isConanExiles) {
                pushLog(`[Workshop] Conan Exiles detected. Moving .pak files...`);
                const targetDir = `/home/spawnly/server/ConanSandbox/Mods`;
                if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

                const files = fs.readdirSync(modDir);
                let pakFiles = [];
                for (const f of files) {
                    if (f.endsWith('.pak')) {
                        fs.renameSync(path.join(modDir, f), path.join(targetDir, f));
                        pakFiles.push(f);
                    }
                }
                
                if (pakFiles.length > 0) {
                    const modlistPath = path.join(targetDir, 'modlist.txt');
                    let modlist = '';
                    if (fs.existsSync(modlistPath)) modlist = fs.readFileSync(modlistPath, 'utf8');
                    pakFiles.forEach(pak => {
                        if (!modlist.includes(pak)) modlist += `\n*${pak}`;
                    });
                    fs.writeFileSync(modlistPath, modlist.trim());
                    pushLog(`[Workshop] 🚀 Conan .pak files moved and modlist.txt auto-updated!`);
                }
                fs.rmSync(modDir, { recursive: true, force: true });
            } 
            // 5. NATIVE / FALLBACK
            else {
                pushLog(`[Workshop] 🚀 Mod ${workshopId} downloaded to content directory successfully.`);
            }
        }
    });
}

app.post('/api/install-workshop', authenticate, (req, res) => {
    const { workshopId, appId } = req.body;
    if (!workshopId || !appId) return res.status(400).json({ error: 'Missing parameters' });
    if (!/^\d+$/.test(workshopId) || !/^\d+$/.test(appId)) return res.status(400).json({ error: 'Invalid ID format' });

    res.json({ success: true, message: 'Download queued in background.' });
    downloadWorkshopItem(appId, workshopId, 1);
});

// ========================================================================
// --- Power Management & Deferred OTA Updates ---
// ========================================================================
app.post('/api/power', authenticate, (req, res) => {
    const { action } = req.body;
    if (!['start', 'stop', 'restart'].includes(action)) return res.status(400).json({ error: 'Invalid power action' });

    const updateDir = path.join(homeDir, '.updates');
    let hasUpdates = false;

    // Check if we are starting/restarting and if staged updates exist
    if ((action === 'start' || action === 'restart') && fs.existsSync(updateDir)) {
        try {
            const files = fs.readdirSync(updateDir).filter(f => f.endsWith('.js'));
            if (files.length > 0) hasUpdates = true;
        } catch (e) {}
    }

    if (hasUpdates) {
        pushLog(`[System] 🛠️ Applying staged OTA updates before ${action}...`);
        
        // Return immediately so the Next.js panel doesn't hang waiting for the service to restart
        res.json({ success: true, log: 'Applying updates and performing power action...' });

        // Detached script: Move files, clean staging, restart game-server, and finally restart this API
        const applyScript = `
            sleep 1
            cp -f ${updateDir}/*.js /home/spawnly/
            rm -f ${updateDir}/*.js
            sudo systemctl ${action} game-server
            sudo systemctl restart steam-file-api
        `;

        const child = spawn('bash', ['-c', applyScript], {
            detached: true,
            stdio: 'ignore'
        });
        child.unref();
    } else {
        // Standard power action (No updates pending)
        exec(`sudo systemctl ${action} game-server`, (error, stdout, stderr) => {
            if (error) return res.status(500).json({ error: 'Power action failed', detail: stderr || error.message });
            res.json({ success: true, log: stdout });
        });
    }
});

// ========================================================================
// --- FICSIT Mod Management (Satisfactory Only) ---
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
// --- File Management ---
// ========================================================================
app.post(['/api/directory', '/api/files'], authenticate, async (req, res) => {
    try {
        // Accept either property mapping from the frontend
        const dirPath = req.body.path || req.body.dirPath;
        if (!dirPath) return res.status(400).json({ error: 'Missing path' });
        const { absPath } = validatePath(dirPath);
        await fsPromises.mkdir(absPath, { recursive: true });
        res.json({ success: true, path: dirPath });
    } catch (err) { res.status(500).json({ error: 'Failed to create directory' }); }
});

app.delete(['/api/file', '/api/files'], authenticate, async (req, res) => {
    try {
        const { absPath } = validatePath(req.query.path);
        const stats = await fsPromises.stat(absPath);
        
        if (stats.isDirectory()) {
            await fsPromises.rm(absPath, { recursive: true, force: true });
        } else {
            await fsPromises.unlink(absPath);
        }
        res.json({ success: true });
    } catch (err) { 
        res.status(500).json({ error: 'Failed to delete item', detail: err.message }); 
    }
});

// --- SECURITY FIX: Prevent renaming to executable ---
app.patch('/api/files', authenticate, async (req, res) => {
    try {
        const { oldPath, newPath } = req.body;
        if (!oldPath || !newPath) return res.status(400).json({ error: 'Missing paths' });
        
        if (isForbidden(path.basename(newPath))) {
            return res.status(403).json({ error: 'Forbidden: Cannot rename to a restricted executable format.' });
        }

        const source = validatePath(oldPath).absPath;
        const dest = validatePath(newPath).absPath;
        await fsPromises.rename(source, dest);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: 'Rename failed', detail: err.message }); }
});

// --- SECURITY FIX: Hide executables at API level ---
app.get('/api/files', authenticate, async (req, res) => {
  try {
    const { relPath, absPath } = validatePath(req.query.path);
    const stats = await fsPromises.stat(absPath);
    if (!stats.isDirectory()) return res.status(400).json({ error: 'Not a directory' });
    
    const entries = await fsPromises.readdir(absPath);
    const files = await Promise.all(entries.map(async (name) => {
      // API-LEVEL HIDE: If the file is an executable, don't even return it in the JSON array
      if (isForbidden(name)) return null;
      
      const entryPath = path.join(absPath, name);
      try {
        const entryStats = await fsPromises.lstat(entryPath);
        let isDir = entryStats.isDirectory();
        if (entryStats.isSymbolicLink()) {
            try { isDir = (await fsPromises.stat(entryPath)).isDirectory(); } 
            catch (e) { isDir = true; }
        }
        return { name: name, isDirectory: isDir, size: entryStats.size, modified: entryStats.mtime.toISOString(), isSymlink: entryStats.isSymbolicLink() };
      } catch (e) { return null; }
    }));
    res.json({ path: relPath, files: files.filter(f => f) });
  } catch (err) { res.status(500).json({ error: 'Failed to list files' }); }
});

app.get('/api/file', authenticate, async (req, res) => {
  try {
    const { absPath } = validatePath(req.query.path);
    const realPath = await fsPromises.realpath(absPath);
    const stats = await fsPromises.stat(realPath);

    if (stats.isDirectory()) {
      const archive = archiver('zip', { zlib: { level: 9 } });
      res.attachment(path.basename(absPath) + '.zip');
      archive.pipe(res);
      archive.directory(realPath, false);
      archive.finalize();
    } else res.download(realPath); 
  } catch (err) { res.status(500).json({ error: 'Failed to download' }); }
});

// ==========================================
// POST: Upload File
// ==========================================
app.post('/api/file', authenticate, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const safeFilename = path.basename(req.file.originalname);
    
    // --- SECURITY FIX: Block malicious extensions ---
    if (isForbidden(safeFilename)) {
        return res.status(403).json({ error: 'Forbidden: Executable file uploads are blocked by the AUP.' });
    }

    const targetDir = req.body.path || req.body.dirPath || '';
    const { absPath: targetAbsDir, relPath } = validatePath(targetDir);
    
    const resolvedDir = await fsPromises.realpath(targetAbsDir).catch(() => targetAbsDir);
    await fsPromises.mkdir(resolvedDir, { recursive: true });
    
    const targetPath = path.join(resolvedDir, safeFilename);
    await fsPromises.writeFile(targetPath, req.file.buffer);

    // --- SECURITY FIX: Strip execution bit (0644) ---
    await fsPromises.chmod(targetPath, 0o644);

    res.json({ success: true, path: path.join(relPath, safeFilename) });
  } catch (err) { 
    res.status(500).json({ error: 'Failed to upload' }); 
  }
});

// --- SECURITY FIX: Edit File ---
app.put('/api/file', authenticate, async (req, res) => {
  try {
    const { absPath } = validatePath(req.query.path);
    
    // Prevent saving as an executable via the code editor
    if (isForbidden(path.basename(absPath))) {
        return res.status(403).json({ error: 'Forbidden: Cannot save file as a restricted executable format.' });
    }

    const resolvedPath = await fsPromises.realpath(absPath).catch(() => absPath);
    await fsPromises.mkdir(path.dirname(resolvedPath), { recursive: true });
    const writeStream = fs.createWriteStream(resolvedPath);
    req.pipe(writeStream);
    
    writeStream.on('finish', async () => {
        // Strip execution bit after edit
        try { await fsPromises.chmod(resolvedPath, 0o644); } catch(e) {}
        res.json({ success: true });
    });
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
    try { 
        if (isRust) await executeRconCommand('server.save');
        else if (isPalworld) await executeRconCommand('Save');
        else if (isValheim || isZomboid) await executeRconCommand('save'); 
        else if (isFactorio) await executeRconCommand('/save');
        else if (isArkSA || isArkSE) await executeRconCommand('SaveWorld');
        else if (!isSatisfactory && !isArma3 && !isArmaReforger && !isSpaceEngineers && !isCS2 && !isGmod) await executeRconCommand('save-all'); 
    } catch (e) {}
    
    await new Promise((resolve, reject) => {
        const output = fs.createWriteStream(tempFilePath);
        const archive = archiver('zip', { zlib: { level: 9 } });
        output.on('close', resolve);
        archive.on('error', reject);
        archive.pipe(output);

        if (isSatisfactory) {
            const saveDir = path.join(homeDir, '.config/Epic/FactoryGame/Saved/SaveGames');
            const ficsitDir = path.join(homeDir, '.local/share/ficsit');
            const configDir = path.join(BASE_DIR, 'FactoryGame/Saved/Config');
            if (fs.existsSync(saveDir)) archive.directory(saveDir, 'SaveGames');
            if (fs.existsSync(ficsitDir)) archive.directory(ficsitDir, 'ficsit');
            if (fs.existsSync(configDir)) archive.directory(configDir, 'Config');
        } else if (isRust) {
            const identityDir = path.join(BASE_DIR, 'server');
            const oxideDir = path.join(BASE_DIR, 'oxide');
            const carbonDir = path.join(BASE_DIR, 'carbon');
            if (fs.existsSync(identityDir)) archive.directory(identityDir, 'server');
            if (fs.existsSync(oxideDir)) archive.directory(oxideDir, 'oxide');
            if (fs.existsSync(carbonDir)) archive.directory(carbonDir, 'carbon');
            archive.glob('*.cfg', { cwd: BASE_DIR }); 
            archive.glob('*.json', { cwd: BASE_DIR }); 
        } else if (isArma3 || isDayZ) {
            const mpmissionsDir = path.join(BASE_DIR, 'mpmissions');
            const keysDir = path.join(BASE_DIR, 'keys');
            const profileDir = path.join(homeDir, '.local/share/Arma 3 - Other Profiles');
            if (fs.existsSync(mpmissionsDir)) archive.directory(mpmissionsDir, 'mpmissions');
            if (fs.existsSync(keysDir)) archive.directory(keysDir, 'keys');
            if (fs.existsSync(profileDir)) archive.directory(profileDir, 'profiles');
            archive.glob('*.cfg', { cwd: BASE_DIR }); 
            archive.glob('*.json', { cwd: BASE_DIR }); 
        } else if (isArmaReforger) {
            const profileDir = path.join(BASE_DIR, 'profile');
            if (fs.existsSync(profileDir)) archive.directory(profileDir, 'profile');
            archive.glob('*.json', { cwd: BASE_DIR }); 
        } else if (isPalworld) {
            const saveDir = path.join(BASE_DIR, 'Pal/Saved');
            if (fs.existsSync(saveDir)) archive.directory(saveDir, 'Pal/Saved');
        } else if (isValheim) {
            const saveDir = path.join(homeDir, '.config/unity3d/IronGate/Valheim');
            if (fs.existsSync(saveDir)) archive.directory(saveDir, 'Valheim_Saves');
        } else if (isZomboid) {
            const saveDir = path.join(homeDir, 'Zomboid');
            if (fs.existsSync(saveDir)) archive.directory(saveDir, 'Zomboid_Saves');
        } else if (isArkSE || isArkSA) {
            const saveDir = path.join(BASE_DIR, 'ShooterGame/Saved');
            if (fs.existsSync(saveDir)) archive.directory(saveDir, 'ShooterGame/Saved');
        } else if (isFactorio) {
            const saveDir = path.join(BASE_DIR, 'saves');
            if (fs.existsSync(saveDir)) archive.directory(saveDir, 'saves');
        } else if (isGmod) {
            const dataDir = path.join(BASE_DIR, 'garrysmod/data');
            const cfgDir = path.join(BASE_DIR, 'garrysmod/cfg');
            const addonsDir = path.join(BASE_DIR, 'garrysmod/addons');
            if (fs.existsSync(dataDir)) archive.directory(dataDir, 'garrysmod/data');
            if (fs.existsSync(cfgDir)) archive.directory(cfgDir, 'garrysmod/cfg');
            if (fs.existsSync(addonsDir)) archive.directory(addonsDir, 'garrysmod/addons');
        } else if (isCS2) {
            const cfgDir = path.join(BASE_DIR, 'game/csgo/cfg');
            if (fs.existsSync(cfgDir)) archive.directory(cfgDir, 'game/csgo/cfg');
        } else if (isSpaceEngineers) {
            const saveDir = path.join(homeDir, '.wine/drive_c/users/spawnly/AppData/Roaming/SpaceEngineersDedicated');
            if (fs.existsSync(saveDir)) archive.directory(saveDir, 'SE_Data');
        } else if (isCoreKeeper) {
            const saveDir = path.join(homeDir, '.config/unity3d/Pugstorm/Core Keeper/DedicatedServer');
            if (fs.existsSync(saveDir)) archive.directory(saveDir, 'CoreKeeper_Saves');
        } else if (isDST) {
            const saveDir = path.join(homeDir, '.klei/DoNotStarveTogether');
            if (fs.existsSync(saveDir)) archive.directory(saveDir, 'DST_Saves');
        } else {
            archive.glob('**/*', { cwd: BASE_DIR, ignore: ['node_modules/**', 'package.json', 'package-lock.json', 'file-api.js', 'server-wrapper.js', 'logs/**', 'crash-reports/**', 'backups/**', '*.zip', '*.tar.gz'], dot: true });
        }
        archive.finalize();
    });
    
    const endpointArg = S3_ENDPOINT ? ['--endpoint-url', S3_ENDPOINT] : [];
    await new Promise((resolve, reject) => { execFile('/usr/local/bin/s5cmd', [...endpointArg, 'cp', tempFilePath, s3Path], (error, stdout, stderr) => { if (error) reject(new Error(stderr || error.message)); else resolve(stdout); }); });
    res.json({ success: true, filename, s3Path });
  } catch (err) { res.status(500).json({ error: 'Backup failed', details: err.message }); 
  } finally { if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath); }
});

app.post('/api/backups/restore', authenticate, (req, res) => {
  const { s3Key } = req.body;
  if (!SERVER_ID || !S3_BUCKET || !s3Key) return res.status(400).json({ error: 'Invalid Request' });
  const s3Url = `s3://${S3_BUCKET}/${s3Key}`;
  const localZip = '/tmp/restore-temp.zip';
  const extractDir = '/tmp/restore-extract';
  const endpointArg = S3_ENDPOINT ? `--endpoint-url "${S3_ENDPOINT}"` : '';

  let restoreCmd = '';
  
  if (isSatisfactory) {
      restoreCmd = `/usr/local/bin/s5cmd ${endpointArg} cp "${s3Url}" "${localZip}" && rm -rf "${extractDir}" && mkdir -p "${extractDir}" && unzip -o "${localZip}" -d "${extractDir}" && ( [ -d "${extractDir}/SaveGames" ] && mkdir -p "${homeDir}/.config/Epic/FactoryGame/Saved/SaveGames" && cp -a "${extractDir}/SaveGames/." "${homeDir}/.config/Epic/FactoryGame/Saved/SaveGames/" || true ) && ( [ -d "${extractDir}/ficsit" ] && mkdir -p "${homeDir}/.local/share/ficsit" && cp -a "${extractDir}/ficsit/." "${homeDir}/.local/share/ficsit/" || true ) && ( [ -d "${extractDir}/Config" ] && mkdir -p "${BASE_DIR}/FactoryGame/Saved/Config" && cp -a "${extractDir}/Config/." "${BASE_DIR}/FactoryGame/Saved/Config/" || true ) && rm -rf "${extractDir}" "${localZip}" && /usr/local/bin/ficsit-cli apply`;
  } else if (isArma3 || isDayZ) {
      restoreCmd = `/usr/local/bin/s5cmd ${endpointArg} cp "${s3Url}" "${localZip}" && rm -rf "${extractDir}" && mkdir -p "${extractDir}" && unzip -o "${localZip}" -d "${extractDir}" && ( [ -d "${extractDir}/mpmissions" ] && cp -a "${extractDir}/mpmissions/." "${BASE_DIR}/mpmissions/" || true ) && ( [ -d "${extractDir}/keys" ] && cp -a "${extractDir}/keys/." "${BASE_DIR}/keys/" || true ) && ( [ -d "${extractDir}/profiles" ] && mkdir -p "${homeDir}/.local/share/Arma 3 - Other Profiles" && cp -a "${extractDir}/profiles/." "${homeDir}/.local/share/Arma 3 - Other Profiles/" || true ) && ( cp "${extractDir}"/*.cfg "${BASE_DIR}/" 2>/dev/null || true ) && ( cp "${extractDir}"/*.json "${BASE_DIR}/" 2>/dev/null || true ) && rm -rf "${extractDir}" "${localZip}"`;
  } else if (isArmaReforger) {
      restoreCmd = `/usr/local/bin/s5cmd ${endpointArg} cp "${s3Url}" "${localZip}" && rm -rf "${extractDir}" && mkdir -p "${extractDir}" && unzip -o "${localZip}" -d "${extractDir}" && ( [ -d "${extractDir}/profile" ] && cp -a "${extractDir}/profile/." "${BASE_DIR}/profile/" || true ) && ( cp "${extractDir}"/*.json "${BASE_DIR}/" 2>/dev/null || true ) && rm -rf "${extractDir}" "${localZip}"`;
  } else if (isValheim) {
      restoreCmd = `/usr/local/bin/s5cmd ${endpointArg} cp "${s3Url}" "${localZip}" && rm -rf "${extractDir}" && mkdir -p "${extractDir}" && unzip -o "${localZip}" -d "${extractDir}" && mkdir -p "${homeDir}/.config/unity3d/IronGate/Valheim" && cp -a "${extractDir}/Valheim_Saves/." "${homeDir}/.config/unity3d/IronGate/Valheim/" || true && rm -rf "${extractDir}" "${localZip}"`;
  } else if (isZomboid) {
      restoreCmd = `/usr/local/bin/s5cmd ${endpointArg} cp "${s3Url}" "${localZip}" && rm -rf "${extractDir}" && mkdir -p "${extractDir}" && unzip -o "${localZip}" -d "${extractDir}" && mkdir -p "${homeDir}/Zomboid" && cp -a "${extractDir}/Zomboid_Saves/." "${homeDir}/Zomboid/" || true && rm -rf "${extractDir}" "${localZip}"`;
  } else if (isSpaceEngineers) {
      restoreCmd = `/usr/local/bin/s5cmd ${endpointArg} cp "${s3Url}" "${localZip}" && rm -rf "${extractDir}" && mkdir -p "${extractDir}" && unzip -o "${localZip}" -d "${extractDir}" && mkdir -p "${homeDir}/.wine/drive_c/users/spawnly/AppData/Roaming/SpaceEngineersDedicated" && cp -a "${extractDir}/SE_Data/." "${homeDir}/.wine/drive_c/users/spawnly/AppData/Roaming/SpaceEngineersDedicated/" || true && rm -rf "${extractDir}" "${localZip}"`;
  } else if (isCoreKeeper) {
      restoreCmd = `/usr/local/bin/s5cmd ${endpointArg} cp "${s3Url}" "${localZip}" && rm -rf "${extractDir}" && mkdir -p "${extractDir}" && unzip -o "${localZip}" -d "${extractDir}" && mkdir -p "${homeDir}/.config/unity3d/Pugstorm/Core Keeper/DedicatedServer" && cp -a "${extractDir}/CoreKeeper_Saves/." "${homeDir}/.config/unity3d/Pugstorm/Core Keeper/DedicatedServer/" || true && rm -rf "${extractDir}" "${localZip}"`;
  } else if (isDST) {
      restoreCmd = `/usr/local/bin/s5cmd ${endpointArg} cp "${s3Url}" "${localZip}" && rm -rf "${extractDir}" && mkdir -p "${extractDir}" && unzip -o "${localZip}" -d "${extractDir}" && mkdir -p "${homeDir}/.klei/DoNotStarveTogether" && cp -a "${extractDir}/DST_Saves/." "${homeDir}/.klei/DoNotStarveTogether/" || true && rm -rf "${extractDir}" "${localZip}"`;
  } else {
      restoreCmd = `/usr/local/bin/s5cmd ${endpointArg} cp "${s3Url}" "${localZip}" && unzip -o "${localZip}" -d "${BASE_DIR}" && rm "${localZip}"`;
  }
  
  exec(restoreCmd, (error, stdout, stderr) => { 
      if (error) return res.status(500).json({ error: 'Restore failed', details: stderr }); 
      res.json({ success: true }); 
  });
});

// ========================================================================
// --- Fleet Management (Stage OTA Updates via Hetzner S3) ---
// ========================================================================
app.post('/api/system/update-daemon', authenticate, async (req, res) => {
    const { s3Prefix, filesToUpdate } = req.body;
    if (!s3Prefix) return res.status(400).json({ error: 'Missing S3 Prefix' });

    pushLog(`[Fleet Manager] 📥 OTA Update staged. Will be applied seamlessly on the next server restart.`);
    
    res.json({ success: true, message: 'Update downloaded and staged.' });

    const endpointArg = S3_ENDPOINT ? `--endpoint-url "${S3_ENDPOINT}"` : '';
    let downloadCommands = '';
    
    const targetFiles = filesToUpdate || ['file-api.js', 'steam-wrapper.js', 'server-wrapper.js', 'status-reporter.js'];

    targetFiles.forEach(file => {
        // Download directly into the hidden .updates staging directory
        downloadCommands += `/usr/local/bin/s5cmd ${endpointArg} cp "${s3Prefix}/${file}" "/home/spawnly/.updates/${file}"\n`;
    });

    const updaterScript = `
        mkdir -p /home/spawnly/.updates
        ${downloadCommands}
    `;

    // Run the download in the background without restarting any services
    const child = spawn('bash', ['-c', updaterScript], {
        detached: true,
        stdio: 'ignore'
    });
    
    child.unref(); 
});

app.listen(PORT, () => { 
    console.log(`File API listening on port ${PORT} serving directory ${BASE_DIR}`);
    console.log("🚀 [SYSTEM] RUNNING OTA VERSION 2.0.0");
});