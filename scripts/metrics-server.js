const WebSocket = require('ws');
const os = require('os');

const PORT = process.env.METRICS_PORT ? parseInt(process.env.METRICS_PORT, 10) : 3004;
const wss = new WebSocket.Server({ port: PORT }, () => {
  console.log('Metrics WebSocket listening on port', PORT);
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

wss.on('connection', (ws) => {
  console.log('Metrics client connected');
  const interval = setInterval(() => {
    if (ws.readyState === ws.OPEN) {
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