// scripts/metrics-server.js
const WebSocket = require('ws');
const os = require('os');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = process.env.METRICS_PORT ? parseInt(process.env.METRICS_PORT, 10) : 3004;

const wss = new WebSocket.Server({ port: PORT }, () => {
  console.log(`Metrics WebSocket listening on port ${PORT} (HTTP, proxied by Cloudflare)`);
});

function getSystemMetrics() {
  const load = os.loadavg()[0];
  const cpuCount = os.cpus().length;
  const cpuUsage = (load / cpuCount) * 100;
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const ramUsage = (usedMem / totalMem) * 100;
  return {
    cpu: Math.min(100, Math.max(0, cpuUsage.toFixed(2))),
    ram: ramUsage.toFixed(2),
    timestamp: new Date().toISOString(),
  };
}

// Helper to read RCON password for auth
function getRconPassword() {
  try {
    const props = fs.readFileSync(path.join(process.cwd(), 'server.properties'), 'utf8');
    const match = props.match(/^rcon\.password=(.*)$/m);
    return match ? match[1].trim() : null;
  } catch (e) { return null; }
}

wss.on('connection', (ws, req) => {
  // --- SECURITY FIX: Authenticate Client ---
  const parameters = url.parse(req.url, true);
  const token = parameters.query.token;
  const rconPass = getRconPassword();

  if (!rconPass || token !== rconPass) {
    console.log('Metrics connection rejected: Invalid or missing token');
    ws.close(1008, 'Unauthorized');
    return;
  }
  // ----------------------------------------

  console.log('Metrics client connected');
  const interval = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify(getSystemMetrics()));
      } catch (e) {
        console.error('Error sending metrics:', e);
      }
    }
  }, 2000);

  ws.on('close', () => {
    console.log('Metrics client disconnected');
    clearInterval(interval);
  });
  ws.on('error', (err) => {
    console.log('WebSocket client error', err && err.message);
  });
});

process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));