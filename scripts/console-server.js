// console-server.js
require('dotenv').config();
const { spawn } = require('child_process');
const fetch = globalThis.fetch;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SERVER_ID = process.env.SERVER_ID;

if (!SUPABASE_URL || !SUPABASE_KEY || !SERVER_ID) {
  console.error('Missing env: SUPABASE_URL, SUPABASE_KEY, SERVER_ID');
  process.exit(1);
}

const SUPABASE_API = `${SUPABASE_URL}/rest/v1/server_console`;
const HEADERS = {
  'apikey': SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
  'Prefer': 'resolution=merge-duplicates',
};

// Config
const MAX_LOG_LINES = 500;        // Max lines to keep
const UPDATE_INTERVAL = 3000;     // Send update every 3s
let logBuffer = [];

// Append new lines and truncate
const appendLog = (line) => {
  logBuffer.push(line.trim());
  if (logBuffer.length > MAX_LOG_LINES) {
    logBuffer = logBuffer.slice(-MAX_LOG_LINES);
  }
};

// Send current buffer to Supabase (UPSERT via POST)
const sendUpdate = async () => {
  if (logBuffer.length === 0) return;

  const fullLog = logBuffer.join('\n');

  try {
    const resp = await fetch(SUPABASE_API, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({
        server_id: SERVER_ID,
        console_log: fullLog,
        updated_at: new Date().toISOString(),
      }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`HTTP ${resp.status}: ${text}`);
    }

    console.log(`Updated console log for server ${SERVER_ID} (${logBuffer.length} lines)`);
  } catch (err) {
    console.error('Failed to update console:', err.message);
  }
};

setInterval(sendUpdate, UPDATE_INTERVAL);

console.log('Streaming console to single Supabase row (per server)');

const journalctl = spawn('journalctl', ['-u', 'minecraft.service', '-f', '-o', 'cat']);

let buffer = '';
journalctl.stdout.on('data', (chunk) => {
  buffer += chunk.toString();
  const lines = buffer.split('\n');
  buffer = lines.pop(); // incomplete line

  lines
    .filter(Boolean)
    .map(l => l.trim())
    .filter(l => l)
    .forEach(appendLog);
});

journalctl.stderr.on('data', d => console.error('journalctl stderr:', d.toString()));
journalctl.on('close', code => {
  console.error(`journalctl exited with code ${code}`);
  process.exit(1);
});

process.on('SIGTERM', () => {
  journalctl.kill();
  sendUpdate().finally(() => process.exit(0));
});