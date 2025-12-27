// scripts/sleeper.js
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
const SLEEPER_SECRET = process.env.SLEEPER_SECRET; // Must match .env on Next.js

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !SLEEPER_SECRET) {
  console.error("Missing Supabase credentials or SLEEPER_SECRET.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const server = net.createServer((socket) => {
  let state = 'HANDSHAKE'; 
  let buffer = Buffer.alloc(0);
  let subdomain = null;

  socket.on('data', async (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);

    while (true) {
      let offset = 0;
      let packetLength = 0;
      try {
        packetLength = varint.decode(buffer, offset);
        offset += varint.decode.bytes;
      } catch (e) { break; }

      if (buffer.length < offset + packetLength) break;

      const payload = buffer.slice(offset, offset + packetLength);
      buffer = buffer.slice(offset + packetLength);

      try {
        if (state === 'HANDSHAKE') {
          handleHandshake(payload);
        } else if (state === 'STATUS') {
          await handleStatus(payload);
        } else if (state === 'LOGIN') {
          await handleLogin(payload);
        }
      } catch (err) {
        console.error(`[Sleeper] Packet error:`, err.message);
        socket.end();
      }
    }
  });

  socket.on('error', () => {});

  // --- HANDLERS ---

  function handleHandshake(payload) {
    let pOffset = 0;
    const packetId = varint.decode(payload, pOffset);
    pOffset += varint.decode.bytes;

    if (packetId !== 0x00) return socket.end();

    varint.decode(payload, pOffset); pOffset += varint.decode.bytes; // Proto ver
    
    const hostLen = varint.decode(payload, pOffset); 
    pOffset += varint.decode.bytes;
    const host = payload.toString('utf8', pOffset, pOffset + hostLen);
    pOffset += hostLen;
    pOffset += 2; // Port

    const nextState = varint.decode(payload, pOffset);

    // Extract subdomain (e.g. "my-server.spawnly.net" -> "my-server")
    const cleanHost = host.split(':')[0].replace(/\.$/, '');
    subdomain = cleanHost.split('.')[0].toLowerCase();

    if (nextState === 1) state = 'STATUS';
    else if (nextState === 2) state = 'LOGIN';
    else socket.end();
  }

  async function handleStatus(payload) {
    let pOffset = 0;
    const packetId = varint.decode(payload, pOffset);

    if (packetId === 0x00) {
      let motd = "§b§lSpawnly Server\n§7Server is Stopped. Join to Start!";
      let versionText = "§4● Sleeping";
      
      if (subdomain) {
        const { data } = await supabase
          .from('servers')
          .select('motd, status')
          .eq('subdomain', subdomain)
          .single();
        
        if (data) {
           // Base MOTD
           if (data.motd) motd = `${data.motd}\n§r§7(Server Sleeping)`;

           // Dynamic Status Overrides
           if (data.status === 'Initializing') {
               versionText = "§e● Initializing";
               motd = "§e§lServer Initializing...\n§7Preparing infrastructure...";
           } else if (data.status === 'Starting') {
               versionText = "§e● Starting";
               motd = "§e§lServer Starting...\n§7Booting up Minecraft...";
           } else if (data.status === 'Stopping') {
               versionText = "§c● Stopping";
               motd = "§c§lServer Stopping...\n§7Saving data...";
           } else if (data.status === 'Running') {
               // Rare case: Server is running but DNS hasn't propagated to client yet, 
               // so they hit the sleeper instead of the real server.
               versionText = "§a● Running";
               motd = "§a§lServer is Online!\n§7Refresh to join.";
           }
        }
      }

      const response = {
        version: { name: versionText, protocol: -1 },
        players: { max: 0, online: 0 },
        description: { text: motd }
      };

      const json = JSON.stringify(response);
      const jsonBuf = Buffer.from(json, 'utf8');
      
      sendPacket(0x00, Buffer.concat([
        Buffer.from(varint.encode(jsonBuf.length)), 
        jsonBuf
      ]));
    } else if (packetId === 0x01) {
        pOffset += varint.decode.bytes; 
        sendPacket(0x01, payload.slice(pOffset));
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

  async function attemptWakeServer(username) {
    const { data: serverInfo, error } = await supabase
      .from('servers')
      .select('id, status, whitelist_enabled, version')
      .eq('subdomain', subdomain)
      .single();

    if (error || !serverInfo) return kickClient("§cServer not found.");
    
    // Status Checks
    if (serverInfo.status === 'Running') {
        return kickClient("§aServer is Running!\n§fPlease refresh your server list to connect.");
    }
    if (serverInfo.status === 'Initializing') {
        return kickClient("§eServer is Initializing!\n§fWe are provisioning your server.\n§fPlease wait ~30 seconds.");
    }
    if (serverInfo.status === 'Starting') {
        return kickClient("§eServer is Starting!\n§fMinecraft is booting up.\n§fPlease wait ~15 seconds.");
    }
    if (serverInfo.status === 'Stopping') {
        return kickClient("§cServer is Stopping.\n§fPlease wait for it to fully stop before restarting.");
    }

    // Whitelist Check
    if (serverInfo.whitelist_enabled) {
      const { data: wlEntry } = await supabase
        .from('server_whitelist')
        .select('id')
        .eq('server_id', serverInfo.id)
        .ilike('username', username) 
        .single();

      if (!wlEntry) {
        console.log(`[Sleeper] Blocked ${username} (Not Whitelisted)`);
        return kickClient("§cYou are not whitelisted on this server.");
      }
    }

    console.log(`[Sleeper] Waking up server ${serverInfo.id}...`);
    
    // --- FIRE AND FORGET PROVISION REQUEST ---
    // We do NOT await this. We trigger it and immediately kick the user.
    // This ensures the "Logging in..." screen doesn't hang.
    axios.post(PROVISION_API_URL, {
        serverId: serverInfo.id,
        version: serverInfo.version
      }, {
        headers: { 
            'Content-Type': 'application/json',
            'x-sleeper-secret': SLEEPER_SECRET 
        }
      }).catch(err => {
        // Log error secretly, user will just try again if it fails.
        console.error(`[Sleeper] Wake API failed for ${serverInfo.id}:`, err.message);
      });

    // Immediate Kick
    kickClient("§a§lWaking up Server!\n\n§7Request sent successfully.\n§7Server is starting now.\n\n§fPlease refresh in 1-2 minutes.");
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
  console.log(`Sleeper Proxy listening on port ${SLEEPER_PORT}`);
});