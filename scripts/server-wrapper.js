require('dotenv').config();
const { spawn, exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');

// --- Configuration ---
const PORT = 3006;
const SERVER_ID = process.env.SERVER_ID;
const NEXTJS_API_URL = process.env.NEXTJS_API_URL;
const RCON_PASSWORD = process.env.RCON_PASSWORD;
const HEAP_GB = process.env.HEAP_GB || '2';
const USE_RUN_SH = fs.existsSync(path.join(process.cwd(), 'run.sh'));

const STATE_FILE = path.join(process.cwd(), '.server_status');

// --- State Management ---
let currentState = 'Starting';
let isShuttingDown = false;

const updateState = (status) => {
  if (currentState === status) return;
  currentState = status;
  try {
    fs.writeFileSync(STATE_FILE, status);
  } catch (e) {
    console.error('[Wrapper] Failed to write state file:', e.message);
  }
};

console.log('[Wrapper] Initializing...');
updateState('Starting');

// --- Log Buffer & Sync ---
const MAX_LOG_LINES = 500;
const SYNC_INTERVAL = 2000;
let logBuffer = [];
let lastSyncTime = Date.now();

const sendUpdate = async (statusOverride = null) => {
  const logsToSend = logBuffer.join('\n');
  logBuffer = []; 
  lastSyncTime = Date.now();

  if (!logsToSend && !statusOverride && Date.now() - lastSyncTime < 10000) return;

  try {
    const payload = {
      serverId: SERVER_ID,
      console_log: logsToSend,
      status: statusOverride || currentState,
    };

    await fetch(NEXTJS_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RCON_PASSWORD}`
      },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.error('[Wrapper] Sync error (network):', err.message);
  }
};

setInterval(() => sendUpdate(), SYNC_INTERVAL);

// --- Minecraft Process ---
let mcProcess;

const startServer = () => {
  console.log(`[Wrapper] Launching server...`);

  if (USE_RUN_SH) {
    try { fs.chmodSync('./run.sh', '755'); } catch (e) {}
    mcProcess = spawn('./run.sh', [], { cwd: process.cwd(), stdio: ['pipe', 'pipe', 'pipe'] });
  } else {
    const args = [
      `-Xmx${HEAP_GB}G`,
      `-Xms1G`,
      '-XX:+ExitOnOutOfMemoryError',
      '-XX:+UseG1GC',
      '-XX:+ParallelRefProcEnabled',
      '-XX:MaxGCPauseMillis=200',
      '-XX:+UnlockExperimentalVMOptions',
      '-XX:+DisableExplicitGC',
      '-XX:+AlwaysPreTouch',
      '-XX:G1NewSizePercent=30',
      '-XX:G1MaxNewSizePercent=40',
      '-XX:G1HeapRegionSize=8M',
      '-XX:G1ReservePercent=20',
      '-XX:G1HeapWastePercent=5',
      '-XX:G1MixedGCCountTarget=4',
      '-XX:InitiatingHeapOccupancyPercent=15',
      '-XX:G1MixedGCLiveThresholdPercent=90',
      '-XX:G1RSetUpdatingPauseTimePercent=5',
      '-XX:SurvivorRatio=32',
      '-XX:+PerfDisableSharedMem',
      '-XX:MaxTenuringThreshold=1',
      '-jar', 'server.jar', 'nogui'
    ];
    mcProcess = spawn('java', args, { cwd: process.cwd(), stdio: ['pipe', 'pipe', 'pipe'] });
  }

  mcProcess.stdout.on('data', (data) => processLog(data, false));
  mcProcess.stderr.on('data', (data) => processLog(data, true));

  mcProcess.on('close', async (code) => {
    console.log(`[Wrapper] Process exited with code ${code}`);
    
    // If exit was clean or we asked for it, stay 'Stopped'. 
    // If random crash (non-zero code), marked as 'Crashed'.
    const finalStatus = (code !== 0 && code !== null && !isShuttingDown) ? 'Crashed' : 'Stopped';

    updateState(finalStatus);
    await sendUpdate(finalStatus);
    process.exit(code || 0);
  });
};

const processLog = (data, isError) => {
  const line = data.toString().trim();
  if (!line) return;
  
  console.log(line); 
  logBuffer.push(line);
  if (logBuffer.length > MAX_LOG_LINES) logBuffer.shift();

  // --- OOM DETECTION & AGGRESSIVE KILL ---
  if (line.includes('java.lang.OutOfMemoryError')) {
    console.error('[Wrapper] CRITICAL: OutOfMemoryError detected. Executing aggressive kill...');
    
    // 1. Kill the shell wrapper immediately
    if (mcProcess) mcProcess.kill('SIGKILL');

    // 2. Kill the Java process specifically (to prevent zombies)
    // We use 'pkill -9' matching the 'java' process name owned by the current user
    exec('pkill -9 -u minecraft java', (err) => {
        if (err) console.error('[Wrapper] pkill failed (might already be dead):', err.message);
    });
    
    return;
  }
  // ---------------------------------------

  if (currentState === 'Starting') {
    if (line.includes('Done (') || line.includes('RCON running on') || line.includes('Thread RCON Listener started') || line.includes('Listening on')) {
      updateState('Running');
    }
  }

  if (line.includes('Stopping server') || line.includes('Saving chunks')) {
    updateState('Stopping');
  }
};

const app = express();
app.use(cors());
app.use(bodyParser.json());

const getRconPasswordFromFile = async () => {
  try {
    const props = await fs.promises.readFile(path.join(process.cwd(), 'server.properties'), 'utf8');
    const match = props.match(/^rcon\.password=(.*)$/m);
    return match ? match[1].trim() : null;
  } catch (e) { return null; }
};

const authenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  const token = authHeader.substring(7);
  const correctPass = await getRconPasswordFromFile();
  if (!correctPass || token !== correctPass) return res.status(403).json({ error: 'Invalid token' });
  next();
};

app.post('/api/command', authenticate, (req, res) => {
  const { command } = req.body;
  if (!command) return res.status(400).json({ error: 'Missing command' });
  if (!mcProcess || mcProcess.killed) return res.status(503).json({ error: 'Server is not running' });
  try {
    mcProcess.stdin.write(command + '\n');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to write to process', detail: err.message });
  }
});

app.listen(PORT, () => console.log(`[Wrapper] API listening on port ${PORT}`));

process.on('SIGTERM', () => {
  isShuttingDown = true;
  updateState('Stopping');
  sendUpdate('Stopping');
  if (mcProcess && !mcProcess.killed) {
    mcProcess.stdin.write('stop\n');
    setTimeout(() => {
      if (mcProcess && !mcProcess.killed) {
          mcProcess.kill('SIGKILL');
          exec('pkill -9 -u minecraft java'); // Aggressive cleanup on timeout too
      }
    }, 30000);
  } else {
    process.exit(0);
  }
});

startServer();