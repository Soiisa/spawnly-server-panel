// scripts/console-server.js
require('dotenv').config();
const { spawn } = require('child_process');
const fetch = globalThis.fetch; // Node 18+ native fetch

// --- CONFIGURATION ---
// SECURITY FIX: Removed SUPABASE_KEY. Uses API endpoint instead.
const API_URL = process.env.NEXTJS_API_URL || 'https://spawnly.net/api/servers/log';
const SERVER_ID = process.env.SERVER_ID;
const RCON_PASSWORD = process.env.RCON_PASSWORD; // Safe to exist on VPS

if (!SERVER_ID || !RCON_PASSWORD) {
  console.error('Missing env: SERVER_ID or RCON_PASSWORD');
  process.exit(1);
}

const HEADERS = {
  'Authorization': `Bearer ${RCON_PASSWORD}`,
  'Content-Type': 'application/json',
};

// --- BUFFER LOGIC ---
const MAX_LOG_LINES = 500;        // Max lines to keep
const UPDATE_INTERVAL = 3000;     // Send update every 3s
let logBuffer = [];

// Append new lines and truncate
const appendLog = (line) => {
  const cleanLine = line.toString().trim();
  if (!cleanLine) return;
  
  logBuffer.push(cleanLine);
  if (logBuffer.length > MAX_LOG_LINES) {
    logBuffer = logBuffer.slice(-MAX_LOG_LINES);
  }
};

// Send current buffer to API
const sendUpdate = async () => {
  if (logBuffer.length === 0) return;

  const fullLog = logBuffer.join('\n');

  try {
    const resp = await fetch(API_URL, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({
        serverId: SERVER_ID,
        console_log: fullLog,
      }),
    });

    if (!resp.ok) {
      console.warn(`[Console Sync] Upload failed: ${resp.status} ${resp.statusText}`);
    }
  } catch (err) {
    console.error('[Console Sync] Network error:', err.message);
  }
};

// Start Loop
setInterval(sendUpdate, UPDATE_INTERVAL);

console.log('Starting secure log streamer...');

// --- PROCESS SPAWNER ---
const journalctl = spawn('journalctl', ['-u', 'minecraft.service', '-f', '-o', 'cat']);

let buffer = '';
journalctl.stdout.on('data', (chunk) => {
  buffer += chunk.toString();
  const lines = buffer.split('\n');
  buffer = lines.pop(); // Keep incomplete line

  lines.forEach(appendLog);
});

journalctl.stderr.on('data', d => console.error('journalctl stderr:', d.toString()));

journalctl.on('close', code => {
  console.error(`journalctl exited with code ${code}`);
  process.exit(1);
});

// Graceful Shutdown
process.on('SIGTERM', () => {
  journalctl.kill();
  sendUpdate().finally(() => process.exit(0));
});