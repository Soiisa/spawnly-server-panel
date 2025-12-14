// scripts/server-wrapper.js
require('dotenv').config();
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');

// --- Configuration ---
const PORT = 3006;
const SERVER_ID = process.env.SERVER_ID;
const NEXTJS_API_URL = process.env.NEXTJS_API_URL;
const RCON_PASSWORD = process.env.RCON_PASSWORD; // Required for log auth
const HEAP_GB = process.env.HEAP_GB || '2';
const USE_RUN_SH = fs.existsSync(path.join(process.cwd(), 'run.sh'));

if (!SERVER_ID || !NEXTJS_API_URL) {
  console.error('[Wrapper] Missing env: SERVER_ID or NEXTJS_API_URL');
  process.exit(1);
}

// --- Log Buffer Logic ---
const MAX_LOG_LINES = 500;
const UPDATE_INTERVAL = 2000;
let logBuffer = [];

const appendLog = (data) => {
  const line = data.toString().trim();
  if (!line) return;
  
  // Print to system journal
  console.log(line); 

  logBuffer.push(line);
  if (logBuffer.length > MAX_LOG_LINES) {
    logBuffer = logBuffer.slice(-MAX_LOG_LINES);
  }
};

const sendUpdate = async () => {
  if (logBuffer.length === 0) return;
  
  const logsToSend = logBuffer.join('\n');
  logBuffer = []; // Clear buffer
  
  try {
    const resp = await fetch(NEXTJS_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RCON_PASSWORD}` // --- FIXED: Added Auth ---
      },
      body: JSON.stringify({
        serverId: SERVER_ID,
        console_log: logsToSend, // --- FIXED: Changed 'log' to 'console_log' ---
      }),
    });
    
    if (!resp.ok) {
        console.error(`[Wrapper] Log sync failed (${resp.status}):`, await resp.text());
    }
  } catch (err) {
    console.error('[Wrapper] Log sync error:', err.message);
  }
};

// Start Log Syncer
setInterval(sendUpdate, UPDATE_INTERVAL);

// --- Process Spawning ---
let mcProcess;

console.log(`[Wrapper] Starting server... Mode: ${USE_RUN_SH ? 'run.sh' : 'Direct Java'}`);

if (USE_RUN_SH) {
  // Fix permissions just in case
  try { fs.chmodSync('./run.sh', '755'); } catch (e) {}
  
  mcProcess = spawn('./run.sh', [], {
    cwd: process.cwd(),
    stdio: ['pipe', 'pipe', 'pipe'] // Pipe STDIN, STDOUT, STDERR
  });
} else {
  const args = [
    `-Xmx${HEAP_GB}G`,
    `-Xms${Math.min(1, HEAP_GB)}G`,
    '-jar', 'server.jar', 
    'nogui'
  ];
  mcProcess = spawn('java', args, {
    cwd: process.cwd(),
    stdio: ['pipe', 'pipe', 'pipe']
  });
}

// Capture Output
mcProcess.stdout.on('data', appendLog);
mcProcess.stderr.on('data', appendLog);

mcProcess.on('close', (code) => {
  console.log(`[Wrapper] Minecraft process exited with code ${code}`);
  sendUpdate().finally(() => process.exit(code || 0));
});

// --- Command API (Replaces RCON) ---
const app = express();
app.use(cors());
app.use(bodyParser.json());

// Helper to read password from properties file
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
  
  if (!mcProcess || mcProcess.killed) {
    return res.status(503).json({ error: 'Server is not running' });
  }

  try {
    // Write to STDIN
    mcProcess.stdin.write(command + '\n');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to write to process', detail: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`[Wrapper] Command API listening on port ${PORT}`);
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
  if (mcProcess) mcProcess.kill();
  sendUpdate().finally(() => process.exit(0));
});