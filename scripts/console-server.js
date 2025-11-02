// console-server.js
require('dotenv').config();
const WebSocket = require('ws');
const { spawn } = require('child_process');

const SERVER_ID   = process.env.SERVER_ID;          // UUID from Supabase
const PROXY_URL   = process.env.PROXY_URL;          // wss://spawnly.net/ws/console
const SERVER_TOKEN = process.env.SERVER_TOKEN;      // shared secret
const PORT        = Number(process.env.CONSOLE_PORT) || 3002;

if (!SERVER_ID || !PROXY_URL || !SERVER_TOKEN) {
  console.error('Missing env: SERVER_ID, PROXY_URL, SERVER_TOKEN');
  process.exit(1);
}

const wsUrl = `${PROXY_URL}/${SERVER_ID}?token=${encodeURIComponent(SERVER_TOKEN)}`;
let ws = null;
let reconnectTimer = null;

function connect() {
  ws = new WebSocket(wsUrl);

  ws.on('open', () => {
    console.log('Connected to proxy');
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  });

  ws.on('close', () => {
    console.warn('Proxy WS closed – reconnecting in 3 s');
    if (!reconnectTimer) reconnectTimer = setTimeout(connect, 3000);
  });

  ws.on('error', err => console.error('WS error', err.message));
}
connect();

// ---- journalctl tail -------------------------------------------------
let lineBuffer = '';
const tail = spawn('journalctl', ['-u', 'minecraft', '-f', '-n', '0', '-o', 'cat']);

tail.stdout.on('data', chunk => {
  lineBuffer += chunk.toString();
  const lines = lineBuffer.split('\n');
  lineBuffer = lines.pop() || '';

  lines.filter(l => l.trim()).forEach(line => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'log', line }));
    }
  });
});

tail.stderr.on('data', d => console.error('journalctl stderr:', d.toString()));
tail.on('error', e => console.error('journalctl spawn error', e));