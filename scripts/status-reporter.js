// scripts/status-reporter.js
const { execSync } = require('child_process');
const WebSocket = require('ws');
const Query = require('minecraft-query');
const os = require('os'); // Import built-in OS module

const SERVER_ID = process.env.SERVER_ID || 'unknown';
const QUERY_PORT = parseInt(process.env.QUERY_PORT) || 25565;
const HOST = '127.0.0.1';

// Explicit API URL
const NEXTJS_API_URL = process.env.NEXTJS_API_URL ||
  `${(process.env.APP_BASE_URL || 'https://spawnly.net').replace(/\/+$/, '')}/api/servers/update-status`;

// Port 3007 (Moved from 3006 to avoid conflict with Wrapper)
const STATUS_WS_PORT = 3007;

const wss = new WebSocket.Server({ port: STATUS_WS_PORT }, () => {
  console.log(`Status WebSocket server listening on port ${STATUS_WS_PORT}`);
});

// --- Precise CPU & RAM Calculation ---
let previousCpus = os.cpus();

function getSystemMetrics() {
  // 1. Memory Usage (Reliable OS check)
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const memory = (usedMem / totalMem) * 100;

  // 2. CPU Usage (Diff between ticks)
  const currentCpus = os.cpus();
  let idleDiff = 0;
  let totalDiff = 0;

  for (let i = 0; i < currentCpus.length; i++) {
    const prev = previousCpus[i];
    const curr = currentCpus[i];

    // Sum changes in all time categories (user, nice, sys, idle, irq)
    let coreTotalDiff = 0;
    for (const type in curr.times) {
      coreTotalDiff += curr.times[type] - prev.times[type];
    }
    
    const coreIdleDiff = curr.times.idle - prev.times.idle;

    totalDiff += coreTotalDiff;
    idleDiff += coreIdleDiff;
  }
  
  // Update previous state for next run
  previousCpus = currentCpus;

  const cpu = totalDiff > 0 ? ((totalDiff - idleDiff) / totalDiff) * 100 : 0;

  // 3. Disk Usage (Keep shell command as fallback, or use 0)
  let disk = 0;
  try {
    disk = parseFloat(execSync("df / | awk 'END{print $5}' | sed 's/%//'").toString().trim()) || 0;
  } catch (e) {}
  
  return { 
    cpu: Math.min(100, Math.max(0, cpu)), 
    memory: Math.min(100, Math.max(0, memory)), 
    disk 
  };
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
  
  // Get metrics (this updates the CPU "previous" state every tick)
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
    ...metrics, // Spreads { cpu, memory, disk }
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
    // Silent fail logs to keep console clean
  }
}

// Start loop (8s interval)
setInterval(broadcastStatus, 8000);
broadcastStatus();

process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));