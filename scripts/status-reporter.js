// scripts/status-reporter.js
const WebSocket = require('ws');
const { execSync } = require('child_process');

const SERVER_ID = process.env.SERVER_ID || 'unknown';
const RCON_PASSWORD = process.env.RCON_PASSWORD || '';
const RCON_PORT = 25575;

// Use explicit API URL if provided, otherwise fallback
const NEXTJS_API_URL = process.env.NEXTJS_API_URL ||
  `${(process.env.APP_BASE_URL || 'https://spawnly.net').replace(/\/+$/, '')}/api/servers/update-status`;

const STATUS_WS_PORT = 3006;

// Create WebSocket server for live dashboard updates
const wss = new WebSocket.Server({ port: STATUS_WS_PORT }, () => {
  console.log(`Status WebSocket server listening on port ${STATUS_WS_PORT}`);
  console.log('STATUS-REPORTER: SERVER_ID =', SERVER_ID);
  console.log('STATUS-REPORTER: NEXTJS_API_URL =', NEXTJS_API_URL);
});

// Simple RCON command executor using mcrcon
function rcon(command) {
  try {
    // -w 5 = wait up to 5 seconds for response
    const result = execSync(
      `echo "${command}" | /usr/local/bin/mcrcon -H 127.0.0.1 -P ${RCON_PORT} -p "${RCON_PASSWORD}" -w 5`,
      { timeout: 9000, encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }
    ).toString().trim();

    // mcrcon sometimes adds ">" at the end — clean it
    return result.replace(/^>\s*$/, '').trim();
  } catch (err) {
    console.warn(`[RCON] Failed: "${command}" →`, err.message || err);
    return null;
  }
}

// Get player count and list using /list
function getPlayerData() {
  const output = rcon('list');
  if (!output || output.includes('Unknown command') || output.includes('No players online')) {
    return { count: 0, list: [], online_text: 'None' };
  }

  // Examples:
  // "There are 3 of a max 20 players online: Steve, Alex, Herobrine"
  // "There are 0 of a max of 20 players online."
  const match = output.match(/There are (\d+) of a max(?: of)? \d+ players online[:.]?\s*(.*)$/i);

  if (!match) {
    console.warn('[PlayerData] Could not parse /list:', output);
    return { count: 0, list: [], online_text: 'Error' };
  }

  const count = parseInt(match[1], 10);
  const listText = match[2].trim();

  let players = [];
  if (listText && !listText.toLowerCase().includes('none')) {
    players = listText.split(',').map(p => p.trim()).filter(Boolean);
  }

  return {
    count,
    list: players,
    online_text: players.length > 0 ? players.join(', ') : 'None'
  };
}

// Get TPS from Paper/Purpur servers
function getTPS() {
  const output = rcon('tps');
  if (!output) return null;

  // Example: "MSPT: 12.34, 11.11, 15.67 | TPS: 20.00*, 20.00*, 19.98*"
  const tpsMatch = output.match(/TPS[^\d]*([\d.]+)\*?[^,]*,\s*([\d.]+)\*?[^,]*,\s*([\d.]+)/i);
  if (!tpsMatch) return null;

  const tps1 = Math.min(20.0, parseFloat(tpsMatch[1])).toFixed(2);
  const tps5 = Math.min(20.0, parseFloat(tpsMatch[2])).toFixed(2);
  const tps15 = Math.min(20.0, parseFloat(tpsMatch[3])).toFixed(2);

  const avg = ((parseFloat(tps1) + parseFloat(tps5) + parseFloat(tps15)) / 3).toFixed(2);

  return {
    tps_1m: tps1,
    tps_5m: tps5,
    tps_15m: tps15,
    average: avg
  };
}

// Main status collector
function getServerStatus() {
  let minecraftStatus = 'Stopped';
  let cpu = 0, memory = 0, disk = 0;

  try {
    minecraftStatus = execSync('systemctl is-active minecraft').toString().trim() === 'active' ? 'Running' : 'Stopped';
  } catch (e) { /* ignore */ }

  try {
    cpu = parseFloat(execSync("grep 'cpu ' /proc/stat | awk '{usage=($2+$4)*100/($2+$4+$5)} END {print usage}'").toString().trim()) || 0;
  } catch (e) { /* ignore */ }

  try {
    memory = parseFloat(execSync("free | grep Mem | awk '{print $3/$2 * 100.0}'").toString().trim()) || 0;
  } catch (e) { /* ignore */ }

  try {
    disk = parseFloat(execSync("df / | awk 'END{print $5}' | sed 's/%//'").toString().trim()) || 0;
  } catch (e) { /* ignore */ }

  const playerData = getPlayerData();
  const tpsData = getTPS();

  return {
    type: 'status_update',
    status: minecraftStatus,
    cpu: Number(cpu.toFixed(1)),
    memory: Number(memory.toFixed(1)),
    disk: Number(disk),
    player_count: playerData.count,
    players_online: playerData.online_text,
    tps: tpsData ? Number(tpsData.average) : null,
    tps_1m: tpsData ? Number(tpsData.tps_1m) : null,
    tps_5m: tpsData ? Number(tpsData.tps_5m) : null,
    tps_15m: tpsData ? Number(tpsData.tps_15m) : null,
    timestamp: new Date().toISOString()
  };
}

// Send status to Supabase via your API
async function updateStatusInSupabase(statusData) {
  try {
    const payload = {
      serverId: SERVER_ID,
      status: statusData.status,
      cpu: statusData.cpu,
      memory: statusData.memory,
      disk: statusData.disk,
      player_count: statusData.player_count,
      players_online: statusData.players_online,
      tps: statusData.tps,
      tps_1m: statusData.tps_1m,
      tps_5m: statusData.tps_5m,
      tps_15m: statusData.tps_15m,
      error: statusData.error || null
    };

    console.log('STATUS-REPORTER: posting →', JSON.stringify({ ...payload, rcon: '[hidden]' }));

    const response = await fetch(NEXTJS_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RCON_PASSWORD}`
      },
      body: JSON.stringify(payload)
    });

    const text = await response.text().catch(() => '');
    if (!response.ok) {
      console.error('Failed to update status:', response.status, text);
      // Fallback attempt (in case of domain change)
      if (response.status === 404 && process.env.APP_BASE_URL) {
        const alt = `${process.env.APP_BASE_URL.replace(/\/+$/, '')}/api/servers/update-status`;
        if (alt !== NEXTJS_API_URL) {
          console.log('Trying fallback URL:', alt);
          const resp2 = await fetch(alt, { method: 'POST', headers: { ... }, body: JSON.stringify(payload) });
          if (!resp2.ok) console.error('Fallback failed too:', await resp2.text());
        }
      }
    } else {
      console.log('Status updated in Supabase:', text.substring(0, 100));
    }
  } catch (error) {
    console.error('Exception updating Supabase:', error.message);
  }
}

// Broadcast to WebSocket clients + send to Supabase
function broadcastStatus() {
  const status = getServerStatus();

  // Send via WebSocket to any connected dashboard
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(JSON.stringify(status));
      } catch (e) {
        console.error('WS send error:', e.message);
      }
    }
  });

  // Send to Supabase
  updateStatusInSupabase(status);
}

// Initial status on startup
(async () => {
  console.log('STATUS-REPORTER: Sending initial status...');
  const initial = getServerStatus();
  await updateStatusInSupabase(initial);
  broadcastStatus(); // also send via WS immediately
})();

// WebSocket connection handling
wss.on('connection', (ws) => {
  console.log('Status client connected (WebSocket)');
  ws.send(JSON.stringify(getServerStatus())); // immediate send

  ws.on('close', () => console.log('Status client disconnected'));
  ws.on('error', (err) => console.log('WS client error:', err.message));
});

// Broadcast every 8 seconds (more responsive than 10s)
setInterval(broadcastStatus, 8000);

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down...');
  process.exit(0);
});
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down...');
  process.exit(0);
});