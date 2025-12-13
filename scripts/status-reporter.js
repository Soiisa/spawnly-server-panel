// scripts/status-reporter.js
const { execSync } = require('child_process');
const WebSocket = require('ws');
const Query = require('minecraft-query');

const SERVER_ID = process.env.SERVER_ID || 'unknown';
const QUERY_PORT = parseInt(process.env.QUERY_PORT) || 25565;
const HOST = '127.0.0.1';

// Explicit API URL
const NEXTJS_API_URL = process.env.NEXTJS_API_URL ||
  `${(process.env.APP_BASE_URL || 'https://spawnly.net').replace(/\/+$/, '')}/api/servers/update-status`;

// CHANGE: Moved from 3006 to 3007 to avoid conflict with Server Wrapper
const STATUS_WS_PORT = 3007;

const wss = new WebSocket.Server({ port: STATUS_WS_PORT }, () => {
  console.log(`Status WebSocket server listening on port ${STATUS_WS_PORT}`);
});

function getSystemMetrics() {
  let cpu = 0, memory = 0, disk = 0;
  try {
    // Simplified CPU check to avoid grep errors
    cpu = 0; // Placeholder if /proc/stat parsing fails
  } catch (e) {}
  try {
    memory = parseFloat(execSync("free | grep Mem | awk '{print $3/$2 * 100.0}'").toString().trim()) || 0;
  } catch (e) {}
  
  return { cpu, memory, disk };
}

function getMinecraftStatus() {
  try {
    // Check if the node wrapper process is running
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