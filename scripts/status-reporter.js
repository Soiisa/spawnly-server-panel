const WebSocket = require('ws');
const { execSync } = require('child_process');

const SERVER_ID = process.env.SERVER_ID || 'unknown';
const RCON_PASSWORD = process.env.RCON_PASSWORD || '';
const NEXTJS_API_URL = process.env.APP_BASE_URL ? `${process.env.APP_BASE_URL}/spawnly/api/servers/update-status` : 'https://spawnly.net/spawnly/api/servers/update-status';
const STATUS_WS_PORT = 3006;

const wss = new WebSocket.Server({ port: STATUS_WS_PORT }, () => {
  console.log(`Status WebSocket server listening on port ${STATUS_WS_PORT} (HTTP, proxied by Cloudflare)`);
});

function getServerStatus() {
  try {
    const minecraftStatus = execSync('systemctl is-active minecraft').toString().trim();
    const cpuUsage = execSync("grep 'cpu ' /proc/stat | awk '{usage=($2+$4)*100/($2+$4+$5)} END {print usage}'").toString().trim();
    const memInfo = execSync("free | grep Mem | awk '{print $3/$2 * 100.0}'").toString().trim();
    const diskUsage = execSync("df / | awk 'END{print $5}' | sed 's/%//'").toString().trim();
    
    return {
      type: 'status_update',
      status: minecraftStatus === 'active' ? 'Running' : 'Stopped',
      cpu: parseFloat(cpuUsage) || 0,
      memory: parseFloat(memInfo) || 0,
      disk: parseFloat(diskUsage) || 0,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    return {
      type: 'status_update',
      status: 'Error',
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
}

async function updateStatusInSupabase(statusData) {
  try {
    const response = await fetch(NEXTJS_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RCON_PASSWORD}`
      },
      body: JSON.stringify({
        serverId: SERVER_ID,
        status: statusData.status,
        cpu: statusData.cpu,
        memory: statusData.memory,
        disk: statusData.disk,
        error: statusData.error
      })
    });

    if (!response.ok) {
      console.error('Failed to update status in Supabase:', response.statusText);
    } else {
      console.log('Status updated in Supabase successfully');
    }
  } catch (error) {
    console.error('Error updating status in Supabase:', error);
  }
}

function broadcastStatus() {
  const status = getServerStatus();
  
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(JSON.stringify(status));
      } catch (error) {
        console.error('Error sending status via WebSocket:', error);
      }
    }
  });
  
  updateStatusInSupabase(status);
}

wss.on('connection', (clientWs) => {
  console.log('Status client connected');
  clientWs.send(JSON.stringify(getServerStatus()));
  
  clientWs.on('close', () => {
    console.log('Status client disconnected');
  });

  clientWs.on('error', (err) => {
    console.log('Status WebSocket client error', err && err.message);
  });
});

setInterval(broadcastStatus, 30000);

process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));