// scripts/server-wrapper.js
require('dotenv').config();
const { spawn, exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
// DELETED: const fetch = require('node-fetch');  <-- This line caused the crash

// --- Configuration ---
const PORT = 3006;
const SERVER_ID = process.env.SERVER_ID;
const NEXTJS_API_URL = process.env.NEXTJS_API_URL;
const CRASH_API_URL = process.env.CRASH_API_URL; 
const RCON_PASSWORD = process.env.RCON_PASSWORD; 
const HEAP_GB = process.env.HEAP_GB || '2';
const USE_RUN_SH = fs.existsSync(path.join(process.cwd(), 'run.sh'));

// File to communicate state to status-reporter.js
const STATE_FILE = path.join(process.cwd(), '.server_status');

if (!SERVER_ID || !NEXTJS_API_URL) {
  console.error('[Wrapper] Missing env: SERVER_ID or NEXTJS_API_URL');
  process.exit(1);
}

// --- Helper: Update State File ---
const updateState = (status) => {
  try {
    fs.writeFileSync(STATE_FILE, status);
  } catch (e) {
    console.error('[Wrapper] Failed to write state file:', e.message);
  }
};

// Initialize State as Starting
console.log('[Wrapper] Initializing state: Starting');
updateState('Starting');

// --- Log Buffer Logic ---
const MAX_LOG_LINES = 500;
const UPDATE_INTERVAL = 2000;
let logBuffer = [];

const appendLog = (data) => {
  const line = data.toString().trim();
  if (!line) return;
  console.log(line); 

  // --- Scan for Boot Completion ---
  if (line.includes('Thread RCON Listener started')) {
    console.log('[Wrapper] RCON detected. Setting status to Running.');
    updateState('Running');
  }

  logBuffer.push(line);
  if (logBuffer.length > MAX_LOG_LINES) {
    logBuffer = logBuffer.slice(-MAX_LOG_LINES);
  }
};

const sendUpdate = async (statusOverride = null) => {
  if (logBuffer.length === 0 && !statusOverride) return;
  
  const logsToSend = logBuffer.join('\n');
  logBuffer = []; 
  
  try {
    const resp = await fetch(NEXTJS_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RCON_PASSWORD}`
      },
      body: JSON.stringify({
        serverId: SERVER_ID,
        console_log: logsToSend,
        status: statusOverride,
      }),
    });
    
    if (!resp.ok) {
        console.error(`[Wrapper] Sync failed (${resp.status}):`, await resp.text());
    }
  } catch (err) {
    console.error('[Wrapper] Sync error:', err.message);
  }
};

setInterval(() => sendUpdate(), UPDATE_INTERVAL);

// --- CODEX CRASH HANDLER ---
const handleCrash = (code) => {
  console.log('[Wrapper] Server crashed. Running Codex analysis...');
  const logPath = path.join(process.cwd(), 'logs', 'latest.log');
  
  if (!fs.existsSync('/opt/tools/analyze.php')) {
      console.warn('[Wrapper] Codex analyze.php not found. Skipping analysis.');
      return;
  }

  exec(`php /opt/tools/analyze.php "${logPath}"`, async (error, stdout, stderr) => {
    if (error) {
      console.error(`[Wrapper] Codex execution failed: ${error.message}`);
      return;
    }

    try {
      const analysis = JSON.parse(stdout);
      
      if (analysis.problems && analysis.problems.length > 0) {
        console.log(`[Wrapper] Codex found ${analysis.problems.length} problems. Uploading report...`);
        
        const rawLogContext = logBuffer.join('\n');

        await fetch(CRASH_API_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${RCON_PASSWORD}`
          },
          body: JSON.stringify({
            serverId: SERVER_ID,
            analysis: analysis,
            log: rawLogContext
          })
        });
        console.log('[Wrapper] Crash report uploaded successfully.');
      } else {
        console.log('[Wrapper] Codex found no specific known issues.');
      }
    } catch (e) {
      console.error('[Wrapper] Failed to parse/upload crash report:', e.message);
    }
  });
};

// --- Process Spawning ---
let mcProcess;
console.log(`[Wrapper] Starting server... Mode: ${USE_RUN_SH ? 'run.sh' : 'Direct Java'}`);

if (USE_RUN_SH) {
  try { fs.chmodSync('./run.sh', '755'); } catch (e) {}
  mcProcess = spawn('./run.sh', [], { cwd: process.cwd(), stdio: ['pipe', 'pipe', 'pipe'] });
} else {
  // Standard Flags (Aikar's)
  const args = [
    `-Xmx${HEAP_GB}G`, 
    `-Xms1G`, 
    '-XX:+UseG1GC',
    '-XX:+ExitOnOutOfMemoryError',
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

mcProcess.stdout.on('data', appendLog);
mcProcess.stderr.on('data', appendLog);

mcProcess.on('close', async (code) => {
  console.log(`[Wrapper] Minecraft process exited with code ${code}`);
  
  if (code !== 0 && code !== null) {
      handleCrash(code);
      console.log('[Wrapper] Waiting for crash report upload...');
      await new Promise(r => setTimeout(r, 3000));
  }

  const finalStatus = (code !== 0 && code !== null) ? 'Crashed' : 'Stopped';
  updateState(finalStatus); 
  await sendUpdate(finalStatus).finally(() => process.exit(code || 0));
});

// --- Command API ---
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

app.listen(PORT, () => console.log(`[Wrapper] Command API listening on port ${PORT}`));

process.on('SIGTERM', () => {
  if (mcProcess) mcProcess.kill();
  updateState('Stopped');
  sendUpdate('Stopped').finally(() => process.exit(0));
});