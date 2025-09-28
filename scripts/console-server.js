const { spawn } = require('child_process');
const WebSocket = require('ws');

const PORT = process.env.CONSOLE_PORT ? parseInt(process.env.CONSOLE_PORT, 10) : 3002;
const MAX_HISTORY_LINES = 2000;

const wss = new WebSocket.Server({ port: PORT }, () => {
  console.log(`Console WebSocket listening on port ${PORT} (HTTP, proxied by Cloudflare)`);
});

let history = [];
let lineBuffer = '';

try {
  const pastLogs = require('child_process').execSync('journalctl -u minecraft -n ' + MAX_HISTORY_LINES + ' -o cat').toString().trim();
  history = pastLogs.split('\n').filter(line => line.trim());
} catch (e) {
  console.error('Failed to load historical logs:', e.message);
}

const tail = spawn('journalctl', ['-u', 'minecraft', '-f', '-n', '0', '-o', 'cat'], { stdio: ['ignore', 'pipe', 'pipe'] });

tail.on('error', (err) => {
  console.error('journalctl spawn error', err);
});

tail.stderr.on('data', (d) => {
  console.error('journalctl stderr:', d.toString());
});

tail.stdout.on('data', (chunk) => {
  lineBuffer += chunk.toString();
  let lines = lineBuffer.split('\n');
  lineBuffer = lines.pop() || '';
  lines = lines.filter(line => line.trim());

  if (lines.length > 0) {
    history.push(...lines);
    if (history.length > MAX_HISTORY_LINES) {
      history = history.slice(-MAX_HISTORY_LINES);
    }

    const message = lines.join('\n') + '\n';
    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(message);
        } catch (e) {
          console.error('Send error:', e);
        }
      }
    });
  }
});

tail.on('close', () => {
  if (lineBuffer.trim()) {
    history.push(lineBuffer);
    if (history.length > MAX_HISTORY_LINES) {
      history = history.slice(-MAX_HISTORY_LINES);
    }
    const message = lineBuffer + '\n';
    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }
});

wss.on('connection', (ws) => {
  console.log('Console client connected');
  if (ws.readyState === WebSocket.OPEN) {
    const historyMessage = history.join('\n') + (history.length ? '\n' : '');
    ws.send(historyMessage);
    ws.send('[server] Connected to console stream\n');
  }

  ws.on('close', () => {
    console.log('Console client disconnected');
  });

  ws.on('error', (err) => {
    console.log('WebSocket client error', err && err.message);
  });
});

process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));