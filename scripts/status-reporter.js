// scripts/status-reporter.js
const dgram = require('dgram');
const { execSync } = require('child_process');

const SERVER_ID = process.env.SERVER_ID || 'unknown';
const QUERY_PORT = parseInt(process.env.QUERY_PORT) || 25565; // Default Minecraft query port
const HOST = '127.0.0.1';

// Use explicit API URL if provided, otherwise fallback
const NEXTJS_API_URL = process.env.NEXTJS_API_URL ||
  `${(process.env.APP_BASE_URL || 'https://spawnly.net').replace(/\/+$/, '')}/api/servers/update-status`;

const STATUS_WS_PORT = 3006;

// Create WebSocket server for live dashboard updates
const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: STATUS_WS_PORT }, () => {
  console.log(`Status WebSocket server listening on port ${STATUS_WS_PORT}`);
  console.log('STATUS-REPORTER: SERVER_ID =', SERVER_ID);
  console.log('STATUS-REPORTER: NEXTJS_API_URL =', NEXTJS_API_URL);
  console.log('STATUS-REPORTER: QUERY_PORT =', QUERY_PORT);
});

// Minecraft Query Protocol implementation
class MinecraftQuery {
  constructor(host = '127.0.0.1', port = 25565, timeout = 3000) {
    this.host = host;
    this.port = port;
    this.timeout = timeout;
    this.sessionId = Math.floor(Math.random() * 0xFFFFFFFF);
    this.challengeToken = 0;
  }

  // Generate basic stats query
  async basicStat() {
    return new Promise((resolve, reject) => {
      const socket = dgram.createSocket('udp4');
      const timeout = setTimeout(() => {
        socket.close();
        reject(new Error('Query timeout'));
      }, this.timeout);

      socket.on('error', (err) => {
        clearTimeout(timeout);
        socket.close();
        reject(err);
      });

      socket.on('message', (msg) => {
        clearTimeout(timeout);
        socket.close();
        
        // Parse response
        try {
          const data = this.parseBasicStatResponse(msg);
          resolve(data);
        } catch (err) {
          reject(err);
        }
      });

      // Build basic stat packet
      const packet = Buffer.alloc(7);
      packet.writeUInt16BE(0xFEFD, 0); // Magic number
      packet.writeUInt8(0x09, 2); // Basic stat type
      packet.writeInt32BE(this.sessionId, 3); // Session ID

      socket.send(packet, 0, packet.length, this.port, this.host, (err) => {
        if (err) {
          clearTimeout(timeout);
          socket.close();
          reject(err);
        }
      });
    });
  }

  // Parse basic stat response
  parseBasicStatResponse(msg) {
    let offset = 0;
    
    // Check magic number
    const magic = msg.readUInt16BE(offset);
    offset += 2;
    if (magic !== 0xFEFD) {
      throw new Error('Invalid magic number in response');
    }
    
    // Check type
    const type = msg.readUInt8(offset);
    offset += 1;
    if (type !== 0x09) {
      throw new Error('Unexpected response type');
    }
    
    // Session ID
    const sessionId = msg.readInt32BE(offset);
    offset += 4;
    
    // MOTD (ends with null byte)
    const motdEnd = msg.indexOf(0x00, offset);
    const motd = msg.toString('utf-8', offset, motdEnd);
    offset = motdEnd + 1;
    
    // Game type
    const gameTypeEnd = msg.indexOf(0x00, offset);
    const gameType = msg.toString('utf-8', offset, gameTypeEnd);
    offset = gameTypeEnd + 1;
    
    // Map name
    const mapNameEnd = msg.indexOf(0x00, offset);
    const mapName = msg.toString('utf-8', offset, mapNameEnd);
    offset = mapNameEnd + 1;
    
    // Online players
    const onlinePlayersEnd = msg.indexOf(0x00, offset);
    const onlinePlayers = parseInt(msg.toString('utf-8', offset, onlinePlayersEnd));
    offset = onlinePlayersEnd + 1;
    
    // Max players
    const maxPlayersEnd = msg.indexOf(0x00, offset);
    const maxPlayers = parseInt(msg.toString('utf-8', offset, maxPlayersEnd));
    offset = maxPlayersEnd + 1;
    
    // Port (little endian)
    const port = msg.readUInt16LE(offset);
    offset += 2;
    
    // Hostname/IP
    const hostnameEnd = msg.indexOf(0x00, offset);
    const hostname = msg.toString('utf-8', offset, hostnameEnd);
    
    return {
      motd,
      gameType,
      mapName,
      onlinePlayers,
      maxPlayers,
      port,
      hostname,
      sessionId
    };
  }

  // Full stat with player list (requires challenge token first)
  async fullStat() {
    try {
      // First get challenge token
      await this.getChallengeToken();
      
      return new Promise((resolve, reject) => {
        const socket = dgram.createSocket('udp4');
        const timeout = setTimeout(() => {
          socket.close();
          reject(new Error('Full stat query timeout'));
        }, this.timeout);

        socket.on('error', (err) => {
          clearTimeout(timeout);
          socket.close();
          reject(err);
        });

        socket.on('message', (msg) => {
          clearTimeout(timeout);
          socket.close();
          
          try {
            const data = this.parseFullStatResponse(msg);
            resolve(data);
          } catch (err) {
            reject(err);
          }
        });

        // Build full stat packet
        const packet = Buffer.alloc(11);
        packet.writeUInt16BE(0xFEFD, 0); // Magic
        packet.writeUInt8(0x00, 2); // Full stat type
        packet.writeInt32BE(this.sessionId, 3); // Session ID
        packet.writeInt32BE(this.challengeToken, 7); // Challenge token

        socket.send(packet, 0, packet.length, this.port, this.host, (err) => {
          if (err) {
            clearTimeout(timeout);
            socket.close();
            reject(err);
          }
        });
      });
    } catch (err) {
      throw err;
    }
  }

  async getChallengeToken() {
    return new Promise((resolve, reject) => {
      const socket = dgram.createSocket('udp4');
      const timeout = setTimeout(() => {
        socket.close();
        reject(new Error('Challenge token timeout'));
      }, this.timeout);

      socket.on('error', (err) => {
        clearTimeout(timeout);
        socket.close();
        reject(err);
      });

      socket.on('message', (msg) => {
        clearTimeout(timeout);
        socket.close();
        
        try {
          let offset = 0;
          const magic = msg.readUInt16BE(offset);
          offset += 2;
          
          if (magic !== 0xFEFD) {
            throw new Error('Invalid magic number');
          }
          
          const type = msg.readUInt8(offset);
          offset += 1;
          
          if (type !== 0x09) {
            throw new Error('Unexpected response type for challenge');
          }
          
          const sessionId = msg.readInt32BE(offset);
          offset += 4;
          
          // Challenge token is ASCII string terminated by null
          const challengeTokenStr = msg.toString('ascii', offset, msg.length - 1);
          this.challengeToken = parseInt(challengeTokenStr);
          
          resolve(this.challengeToken);
        } catch (err) {
          reject(err);
        }
      });

      // Build challenge token request
      const packet = Buffer.alloc(7);
      packet.writeUInt16BE(0xFEFD, 0); // Magic
      packet.writeUInt8(0x09, 2); // Type
      packet.writeInt32BE(this.sessionId, 3); // Session ID

      socket.send(packet, 0, packet.length, this.port, this.host, (err) => {
        if (err) {
          clearTimeout(timeout);
          socket.close();
          reject(err);
        }
      });
    });
  }

  parseFullStatResponse(msg) {
    let offset = 0;
    
    // Skip magic, type, session ID
    offset += 7;
    
    // Skip padding
    offset += 11;
    
    // Parse key-value pairs until empty key
    const kv = {};
    while (offset < msg.length) {
      const keyEnd = msg.indexOf(0x00, offset);
      if (keyEnd === -1) break;
      
      const key = msg.toString('utf-8', offset, keyEnd);
      offset = keyEnd + 1;
      
      if (key.length === 0) break;
      
      const valueEnd = msg.indexOf(0x00, offset);
      if (valueEnd === -1) break;
      
      const value = msg.toString('utf-8', offset, valueEnd);
      offset = valueEnd + 1;
      
      kv[key] = value;
    }
    
    // Skip padding before player list
    while (offset < msg.length && msg.readUInt8(offset) === 0x00) {
      offset++;
    }
    
    // Parse player list
    const players = [];
    while (offset < msg.length) {
      const playerEnd = msg.indexOf(0x00, offset);
      if (playerEnd === -1 || playerEnd === offset) break;
      
      const player = msg.toString('utf-8', offset, playerEnd);
      players.push(player);
      offset = playerEnd + 1;
    }
    
    return {
      ...kv,
      players
    };
  }
}

// Get player data using query protocol
async function getPlayerData() {
  try {
    const query = new MinecraftQuery(HOST, QUERY_PORT, 2000);
    const basicStats = await query.basicStat();
    
    // Try to get full stats for player list (might fail if query disabled)
    try {
      const fullStats = await query.fullStat();
      return {
        count: basicStats.onlinePlayers,
        max: basicStats.maxPlayers,
        list: fullStats.players || [],
        online_text: (fullStats.players && fullStats.players.length > 0) 
          ? fullStats.players.join(', ') 
          : 'None',
        motd: basicStats.motd,
        map: basicStats.mapName
      };
    } catch (fullStatError) {
      // Fallback to only basic stats
      return {
        count: basicStats.onlinePlayers,
        max: basicStats.maxPlayers,
        list: [],
        online_text: basicStats.onlinePlayers > 0 ? 'Online (list unavailable)' : 'None',
        motd: basicStats.motd,
        map: basicStats.mapName
      };
    }
  } catch (error) {
    console.warn('[Query] Failed to get player data:', error.message);
    return {
      count: 0,
      max: 0,
      list: [],
      online_text: 'Offline',
      motd: '',
      map: ''
    };
  }
}

// Get TPS - Note: Query protocol doesn't provide TPS, so we'll keep using RCON for this
// or remove TPS if you don't need it
function getTPS() {
  // You can remove this function if TPS isn't needed
  // Or keep it using RCON just for TPS
  return null;
}

// Get server status via systemctl
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

// Get system metrics
function getSystemMetrics() {
  let cpu = 0, memory = 0, disk = 0;
  
  try {
    cpu = parseFloat(execSync(
      "grep 'cpu ' /proc/stat | awk '{usage=($2+$4)*100/($2+$4+$5)} END {print usage}'"
    ).toString().trim()) || 0;
  } catch (e) { /* ignore */ }
  
  try {
    memory = parseFloat(execSync(
      "free | grep Mem | awk '{print $3/$2 * 100.0}'"
    ).toString().trim()) || 0;
  } catch (e) { /* ignore */ }
  
  try {
    disk = parseFloat(execSync(
      "df / | awk 'END{print $5}' | sed 's/%//'"
    ).toString().trim()) || 0;
  } catch (e) { /* ignore */ }
  
  return {
    cpu: Number(cpu.toFixed(1)),
    memory: Number(memory.toFixed(1)),
    disk: Number(disk)
  };
}

// Main status collector
async function getServerStatus() {
  const minecraftStatus = getMinecraftStatus();
  const metrics = getSystemMetrics();
  
  // Only try to query if server is running
  let playerData = { count: 0, max: 0, list: [], online_text: 'None', motd: '', map: '' };
  if (minecraftStatus === 'Running') {
    playerData = await getPlayerData();
  }
  
  return {
    type: 'status_update',
    status: minecraftStatus,
    cpu: metrics.cpu,
    memory: metrics.memory,
    disk: metrics.disk,
    player_count: playerData.count,
    max_players: playerData.max,
    players_online: playerData.online_text,
    motd: playerData.motd,
    map: playerData.map,
    tps: null, // Query protocol doesn't provide TPS
    tps_1m: null,
    tps_5m: null,
    tps_15m: null,
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
      max_players: statusData.max_players || 0,
      players_online: statusData.players_online,
      motd: statusData.motd || '',
      map: statusData.map || '',
      tps: statusData.tps,
      tps_1m: statusData.tps_1m,
      tps_5m: statusData.tps_5m,
      tps_15m: statusData.tps_15m,
      error: statusData.error || null
    };

    console.log('STATUS-REPORTER: posting →', JSON.stringify({
      ...payload,
      player_count: statusData.player_count,
      max_players: statusData.max_players,
      motd: statusData.motd?.substring(0, 50) + '...' || ''
    }));

    const response = await fetch(NEXTJS_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.RCON_PASSWORD || ''}`
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
          const resp2 = await fetch(alt, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${process.env.RCON_PASSWORD || ''}`
            },
            body: JSON.stringify(payload)
          });
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
async function broadcastStatus() {
  try {
    const status = await getServerStatus();
    
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
    await updateStatusInSupabase(status);
  } catch (error) {
    console.error('Error in broadcastStatus:', error.message);
  }
}

// Initial status on startup
(async () => {
  console.log('STATUS-REPORTER: Sending initial status...');
  try {
    const initial = await getServerStatus();
    await updateStatusInSupabase(initial);
    broadcastStatus(); // also send via WS immediately
  } catch (error) {
    console.error('Error in initial status:', error.message);
  }
})();

// WebSocket connection handling
wss.on('connection', (ws) => {
  console.log('Status client connected (WebSocket)');
  
  // Send immediate status
  getServerStatus().then(status => {
    ws.send(JSON.stringify(status));
  }).catch(err => {
    console.error('Error sending initial WS status:', err.message);
  });
  
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