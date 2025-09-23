const WebSocket = require('ws');
const { execSync } = require('child_process');
const fs = require('fs').promises;
const path = require('path');

const SERVER_ID = process.env.SERVER_ID || 'unknown';
const NEXTJS_API_URL = process.env.APP_BASE_URL || 'http://localhost:3000';
const STATUS_WS_URL = `wss://${process.env.SUBDOMAIN}.spawnly.net:3006`;

async function getRconPassword() {
  try {
    const props = await fs.readFile(path.join(process.cwd(), 'server.properties'), 'utf8');
    const match = props.match(/^rcon\.password=(.*)$/m);
    return match ? match[1].trim() : null;
  } catch (error) {
    console.error('Error reading RCON password from server.properties:', error.message);
    return null;
  }
}

let ws = null;
let reconnectInterval = null;

function connect() {
  console.log('Connecting to status WebSocket:', STATUS_WS_URL);
  ws = new WebSocket(STATUS_WS_URL);

  ws.on('open', () => {
    console.log('Status WebSocket connected');
    clearInterval(reconnectInterval);
  });

  ws.on('message', (event) => {
    console.log('Status update received:', event.data);
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error.message);
  });

  ws.on('close', () => {
    console.log('Status WebSocket disconnected, attempting to reconnect...');
    scheduleReconnect();
  });
}

function scheduleReconnect() {
  if (reconnectInterval) clearInterval(reconnectInterval);
  reconnectInterval = setInterval(connect, 5000);
}

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
    const rconPassword = await getRconPassword();
    if (!rconPassword) {
      console.error('No RCON password available, skipping Supabase update');
      return;
    }
    const response = await fetch(NEXTJS_API_URL + '/api/servers/update-status', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + rconPassword
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
    console.error('Error updating status in Supabase:', error.message);
  }
}

function broadcastStatus() {
  const status = getServerStatus();
  
  if (ws && ws.readyState === WebSocket.OPEN) {
    try {
      ws.send(JSON.stringify(status));
    } catch (error) {
      console.error('Error sending status via WebSocket:', error.message);
    }
  }
  
  updateStatusInSupabase(status);
}

const wss = new WebSocket.Server({ port: 3006 }, () => {
  console.log('Status WebSocket server listening on port 3006');
});

wss.on('connection', (clientWs) => {
  console.log('Status client connected');
  clientWs.send(JSON.stringify(getServerStatus()));
  
  clientWs.on('close', () => {
    console.log('Status client disconnected');
  });

  wss.on('error', (err) => {
    console.error('Status WebSocket server error:', err.message);
  });
});

connect();
setInterval(broadcastStatus, 30000);

process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));