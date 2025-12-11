require('dotenv').config({ path: '.env.local' });
const net = require('net');
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');
const varint = require('varint');

// --- CONFIGURATION ---
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APP_BASE_URL = process.env.APP_BASE_URL || 'https://spawnly.net';
const PROVISION_API_URL = `${APP_BASE_URL}/api/servers/provision`;
const SLEEPER_PORT = 25565;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("Missing Supabase credentials.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const server = net.createServer((socket) => {
  // Connection State
  let state = 'HANDSHAKE'; // HANDSHAKE -> STATUS or LOGIN
  let buffer = Buffer.alloc(0);
  let subdomain = null;

  socket.on('data', async (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);

    // Process all complete packets in the buffer
    while (true) {
      // 1. Read Packet Length (VarInt)
      let offset = 0;
      let packetLength = 0;
      try {
        packetLength = varint.decode(buffer, offset);
        offset += varint.decode.bytes;
      } catch (e) {
        // Incomplete VarInt, wait for more data
        break;
      }

      // 2. Check if we have the full packet
      if (buffer.length < offset + packetLength) {
        // Incomplete packet, wait for more data
        break;
      }

      // 3. Extract Payload
      const payload = buffer.slice(offset, offset + packetLength);
      // Remove processed packet from buffer
      buffer = buffer.slice(offset + packetLength);

      // 4. Handle Packet based on State
      try {
        if (state === 'HANDSHAKE') {
          handleHandshake(payload);
        } else if (state === 'STATUS') {
          await handleStatus(payload); // Now Async
        } else if (state === 'LOGIN') {
          await handleLogin(payload);
        }
      } catch (err) {
        console.error(`[Sleeper] Error processing packet:`, err.message);
        socket.end();
      }
    }
  });

  socket.on('error', (err) => {
    // Ignore connection resets
  });

  // --- PROTOCOL HANDLERS ---

  function handleHandshake(payload) {
    let pOffset = 0;
    
    const packetId = varint.decode(payload, pOffset);
    pOffset += varint.decode.bytes;

    if (packetId !== 0x00) return socket.end();

    varint.decode(payload, pOffset); 
    pOffset += varint.decode.bytes;

    const hostLen = varint.decode(payload, pOffset);
    pOffset += varint.decode.bytes;

    const host = payload.toString('utf8', pOffset, pOffset + hostLen);
    pOffset += hostLen;

    pOffset += 2; // Port

    const nextState = varint.decode(payload, pOffset);

    const cleanHost = host.split(':')[0].replace(/\.$/, '');
    subdomain = cleanHost.split('.')[0].toLowerCase();

    if (nextState === 1) {
      state = 'STATUS';
    } else if (nextState === 2) {
      state = 'LOGIN';
    } else {
      socket.end();
    }
  }

  async function handleStatus(payload) {
    let pOffset = 0;
    const packetId = varint.decode(payload, pOffset);

    // Packet 0x00: Request -> Respond with JSON
    if (packetId === 0x00) {
      
      // Fetch MOTD from DB
      let motd = "§b§lSpawnly Server\n§7Server is Stopped. Join to Start!";
      
      if (subdomain) {
        const { data } = await supabase
          .from('servers')
          .select('motd')
          .eq('subdomain', subdomain)
          .single();
        
        if (data?.motd) {
          // Append " (Sleeping)" to let them know it's offline
          motd = `${data.motd}\n§r§7(Server Sleeping)`;
        }
      }

      const response = {
        version: { name: "§4● Sleeping", protocol: -1 },
        players: { max: 0, online: 0 },
        description: { text: motd }
      };

      const json = JSON.stringify(response);
      const jsonBuf = Buffer.from(json, 'utf8');
      
      sendPacket(0x00, Buffer.concat([
        Buffer.from(varint.encode(jsonBuf.length)), 
        jsonBuf
      ]));
    }
    
    // Packet 0x01: Ping -> Respond with Pong
    else if (packetId === 0x01) {
        pOffset += varint.decode.bytes; 
        const pingPayload = payload.slice(pOffset); 
        sendPacket(0x01, pingPayload);
    }
  }

  async function handleLogin(payload) {
    let pOffset = 0;
    const packetId = varint.decode(payload, pOffset);
    pOffset += varint.decode.bytes;

    if (packetId === 0x00) {
      const nameLen = varint.decode(payload, pOffset);
      pOffset += varint.decode.bytes;
      const username = payload.toString('utf8', pOffset, pOffset + nameLen);

      console.log(`[Sleeper] Login attempt: ${username} -> ${subdomain}`);
      await attemptWakeServer(username);
    }
  }

  // --- LOGIC HELPER ---

  async function attemptWakeServer(username) {
    const { data: serverInfo, error } = await supabase
      .from('servers')
      .select('id, status, whitelist_enabled, version, name')
      .eq('subdomain', subdomain)
      .single();

    if (error || !serverInfo) {
      return kickClient("§cServer not found.");
    }

    if (serverInfo.status === 'Running' || serverInfo.status === 'Starting') {
      return kickClient("§eServer is already starting!\n§fPlease wait ~30 seconds and refresh.");
    }

    if (serverInfo.whitelist_enabled) {
      const { data: wlEntry } = await supabase
        .from('server_whitelist')
        .select('id')
        .eq('server_id', serverInfo.id)
        .ilike('username', username) 
        .single();

      if (!wlEntry) {
        console.log(`[Sleeper] Blocked ${username} from ${subdomain} (Not Whitelisted)`);
        return kickClient("§cYou are not whitelisted on this server.");
      }
    }

    console.log(`[Sleeper] Waking up server ${serverInfo.id} for ${username}`);
    
    try {
      await axios.post(PROVISION_API_URL, {
        serverId: serverInfo.id,
        version: serverInfo.version
      }, {
        headers: { 'Content-Type': 'application/json' }
      });

      kickClient("§a§lWaking up Server!\n\n§7Authentication Accepted.\n§7Server is starting now.\n\n§fPlease refresh in a bit");
    } catch (err) {
      console.error(`[Sleeper] Wake failed:`, err.message);
      kickClient("§cFailed to wake server. Please use the dashboard.");
    }
  }

  function sendPacket(id, data) {
    const idBuf = Buffer.from(varint.encode(id));
    const len = idBuf.length + data.length;
    const lenBuf = Buffer.from(varint.encode(len));
    socket.write(Buffer.concat([lenBuf, idBuf, data]));
  }

  function kickClient(message) {
    const json = JSON.stringify({ text: message });
    const jsonBuf = Buffer.from(json, 'utf8');
    sendPacket(0x00, Buffer.concat([
      Buffer.from(varint.encode(jsonBuf.length)), 
      jsonBuf
    ]));
    socket.end();
  }
});

server.listen(SLEEPER_PORT, () => {
  console.log(`Sleeper Proxy v3 listening on port ${SLEEPER_PORT}`);
});