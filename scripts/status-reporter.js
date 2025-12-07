// scripts/status-reporter.js
const { execSync } = require('child_process');
const WebSocket = require('ws');
const Query = require('minecraft-query'); // Import the library

const SERVER_ID = process.env.SERVER_ID || 'unknown';
const QUERY_PORT = parseInt(process.env.QUERY_PORT) || 25565;
const HOST = '127.0.0.1';

// Explicit API URL
const NEXTJS_API_URL = process.env.NEXTJS_API_URL ||
  `${(process.env.APP_BASE_URL || 'https://spawnly.net').replace(/\/+$/, '')}/api/servers/update-status`;

const STATUS_WS_PORT = 3006;

const wss = new WebSocket.Server({ port: STATUS_WS_PORT }, () => {
  console.log(`Status WebSocket server listening on port ${STATUS_WS_PORT}`);
});

// System Metrics Helper (Keep this as is)
function getSystemMetrics() {
  let cpu = 0, memory = 0, disk = 0;
  try {
    cpu = parseFloat(execSync("grep 'cpu ' /proc/stat | awk '{usage=($2+$4)*100/($2+$4+$5)} END {print usage}'").toString().trim()) || 0;
  } catch (e) {}
  try {
    memory = parseFloat(execSync("free | grep Mem | awk '{print $3/$2 * 100.0}'").toString().trim()) || 0;
  } catch (e) {}
  try {
    disk = parseFloat(execSync("df / | awk 'END{print $5}' | sed 's/%//'").toString().trim()) || 0;
  } catch (e) {}
  
  return { cpu, memory, disk };
}

function getMinecraftStatus() {
  try {
    const status = execSync('systemctl is-active minecraft', { 
      encoding: 'utf8', 
      stdio: ['pipe', 'pipe', 'ignore'] 
    }).toString().trim();
    return status === 'active' ? 'Running' : 'Stopped';
  } catch (e) {
    return 'Unknown';
  }
}

// Main Status Loop
async function broadcastStatus() {
  const statusStr = getMinecraftStatus();
  const metrics = getSystemMetrics();
  
  let playerData = { count: 0, max: 0, list: [], online_text: 'Offline', motd: '', map: '' };
  
  if (statusStr === 'Running') {
    try {
      // Use the library to query
      const q = new Query({ host: HOST, port: QUERY_PORT, timeout: 2000 });
      const stats = await q.fullStat();
      
      // Close the internal socket if the library keeps it open (depends on implementation, usually safe to let GC handle or check docs)
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
      console.warn(`[Query] Failed: ${error.message}`);
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

  // Broadcast to WebSockets (Dashboard)
  wss.clients.forEach(c => {
    if (c.readyState === WebSocket.OPEN) c.send(JSON.stringify(statusData));
  });

  // Push to Supabase via API
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
    console.error('Supabase update failed:', err.message);
  }
}

// Start loop (8s interval)
setInterval(broadcastStatus, 8000);
broadcastStatus();

// Graceful shutdown
process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));