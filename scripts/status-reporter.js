// scripts/status-reporter.js
const { execSync } = require('child_process');
const WebSocket = require('ws');
const Query = require('minecraft-query');
const url = require('url');
const os = require('os'); // Added OS module

const SERVER_ID = process.env.SERVER_ID || 'unknown';
const QUERY_PORT = parseInt(process.env.QUERY_PORT) || 25565;
const HOST = '127.0.0.1';

// Explicit API URL
const NEXTJS_API_URL = process.env.NEXTJS_API_URL ||
  `${(process.env.APP_BASE_URL || 'https://spawnly.net').replace(/\/+$/, '')}/api/servers/update-status`;

// Port configuration
const STATUS_WS_PORT = 3007;
const AUTH_TOKEN = process.env.RCON_PASSWORD; 

const wss = new WebSocket.Server({ port: STATUS_WS_PORT }, () => {
  console.log(`Status WebSocket server listening on port ${STATUS_WS_PORT}`);
});

// Authenticate Clients
wss.on('connection', (ws, req) => {
  const parameters = url.parse(req.url, true);
  const token = parameters.query.token;

  if (!AUTH_TOKEN || token !== AUTH_TOKEN) {
    ws.close(1008, 'Unauthorized');
    return;
  }
});

// --- CPU Calculation Helper ---
let prevCpus = os.cpus();

function getCpuUsage() {
  const currCpus = os.cpus();
  let totalIdle = 0;
  let totalTick = 0;

  for (let i = 0; i < currCpus.length; i++) {
    const prev = prevCpus[i];
    const curr = currCpus[i];

    let idle = curr.times.idle - prev.times.idle;
    let tick = 
      (curr.times.user + curr.times.nice + curr.times.sys + curr.times.irq + curr.times.idle) - 
      (prev.times.user + prev.times.nice + prev.times.sys + prev.times.irq + prev.times.idle);

    totalIdle += idle;
    totalTick += tick;
  }

  prevCpus = currCpus;
  
  if (totalTick === 0) return 0;
  const percentage = 100 - ((totalIdle / totalTick) * 100);
  return percentage > 0 ? percentage.toFixed(1) : 0;
}
// -----------------------------

function getSystemMetrics() {
  let cpu = 0, memory = 0, disk = 0;
  
  try {
    cpu = parseFloat(getCpuUsage());
  } catch (e) {
    console.error('CPU calc error:', e);
  }

  try {
    memory = parseFloat(execSync("free | grep Mem | awk '{print $3/$2 * 100.0}'").toString().trim()) || 0;
  } catch (e) {}
  
  return { cpu, memory, disk };
}

function getMinecraftStatus() {
  try {
    const status = execSync('ps aux | grep server-wrapper.js | grep -v grep | wc -l', { encoding: 'utf8' }).trim();
    return parseInt(status) > 0 ? 'Running' : 'Stopped';
  } catch (e) {
    return 'Stopped';
  }
}

async function broadcastStatus() {
  const statusStr = getMinecraftStatus();
  const metrics = getSystemMetrics();
  
  let playerData = { count: 0, max: 0, list: [], online_text: 'Offline', motd: '', map: '' };
  
  if (statusStr === 'Running') {
    try {
      const q = new Query({ host: HOST, port: QUERY_PORT, timeout: 2000 });
      const stats = await q.fullStat();
      q.close(); 

      playerData = {
        count: parseInt(stats.online_players || 0),
        max: parseInt(stats.max_players || 0),
        list: stats.players || [],
        online_text: (stats.players && stats.players.length > 0) ? stats.players.join(', ') : 'None',
        motd: stats.motd || '',
        map: stats.map || ''
      };
    } catch (error) {
      playerData.online_text = 'Online (Querying...)';
    }
  }
  
  const statusData = {
    type: 'status_update',
    status: statusStr,
    ...metrics,
    player_count: playerData.count,
    max_players: playerData.max,
    players_online: playerData.online_text,
    motd: playerData.motd,
    map: playerData.map,
    timestamp: new Date().toISOString()
  };

  // Broadcast only to authenticated clients
  wss.clients.forEach(c => {
    if (c.readyState === WebSocket.OPEN) c.send(JSON.stringify(statusData));
  });

  try {
    await fetch(NEXTJS_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.RCON_PASSWORD || ''}`
      },
      body: JSON.stringify({
        serverId: SERVER_ID,
        ...statusData
      })
    });
  } catch (err) {
    // Silent fail
  }
}

setInterval(broadcastStatus, 8000);
broadcastStatus();

process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));