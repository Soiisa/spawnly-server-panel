require('dotenv').config({ path: '.env.local' });
const net = require('net');
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');
const varint = require('varint');

// --- CONFIGURATION ---
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// We point to the PROVISION endpoint because the VM needs to be recreated
const APP_BASE_URL = process.env.APP_BASE_URL || 'https://spawnly.net';
const PROVISION_API_URL = `${APP_BASE_URL}/api/servers/provision`;

const SLEEPER_PORT = 25565;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("Missing Supabase credentials.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const server = net.createServer((socket) => {
  let buffer = Buffer.alloc(0);
  let handshakeParsed = false;

  socket.on('data', async (chunk) => {
    if (handshakeParsed) return;
    buffer = Buffer.concat([buffer, chunk]);

    try {
      // --- 1. Parse Minecraft Handshake Packet ---
      let offset = 0;
      
      const packetLength = varint.decode(buffer, offset);
      offset += varint.decode.bytes;
      
      const packetId = varint.decode(buffer, offset);
      offset += varint.decode.bytes;

      if (packetId !== 0x00) return; // Not a handshake

      const protocolVersion = varint.decode(buffer, offset);
      offset += varint.decode.bytes;

      const hostLength = varint.decode(buffer, offset);
      offset += varint.decode.bytes;

      const serverAddress = buffer.toString('utf8', offset, offset + hostLength);
      
      // Clean address (remove port and trailing dot)
      const cleanHost = serverAddress.split(':')[0].replace(/\.$/, '');
      const subdomain = cleanHost.split('.')[0].toLowerCase();

      handshakeParsed = true;
      
      // --- 2. Handle Logic ---
      await handleConnection(socket, subdomain);
      
    } catch (e) {
      // Wait for more data if packet is incomplete
    }
  });

  socket.on('error', (err) => {
    // Ignore connection resets
  });
});

async function handleConnection(socket, subdomain) {
  console.log(`[Sleeper] Connection attempt for subdomain: ${subdomain}`);

  // A. Find Server in DB
  // IMPORTANT: We fetch 'version' here because the provision API requires it
  const { data: server, error } = await supabase
    .from('servers')
    .select('id, status, whitelist_enabled, user_id, name, version') 
    .eq('subdomain', subdomain)
    .single();

  if (error || !server) {
    return kickClient(socket, "§cServer not found.");
  }

  if (server.status === 'Running' || server.status === 'Starting') {
    return kickClient(socket, "§eServer is already starting!\n§fPlease wait 30-60 seconds and refresh.");
  }

  // B. Wake Up Server
  console.log(`[Sleeper] Waking up server ${server.id} (${server.name})`);
  
  try {
    // Call PROVISION endpoint instead of ACTION
    // This creates the VM and sets up DNS
    await axios.post(PROVISION_API_URL, {
      serverId: server.id,
      version: server.version // Required field for provisioning
    }, {
      headers: { 
        'Content-Type': 'application/json'
      }
    });

    kickClient(socket, "§a§lWaking up Server!\n\n§7The server was sleeping to save resources.\n§7It is now starting up.\n\n§fPlease refresh in roughly 60 seconds.");
  } catch (err) {
    console.error(`[Sleeper] Failed to wake server ${server.id}:`, err.response?.data || err.message);
    kickClient(socket, "§cFailed to wake server.\n§7Please start it from the dashboard.");
  }
}

function kickClient(socket, message) {
  const json = JSON.stringify({ text: message });
  const jsonBuf = Buffer.from(json, 'utf8');
  
  const packetId = 0x00;
  const packetLen = varint.encodingLength(packetId) + varint.encodingLength(jsonBuf.length) + jsonBuf.length;
  
  const buffer = Buffer.concat([
    Buffer.from(varint.encode(packetLen)),
    Buffer.from(varint.encode(packetId)),
    Buffer.from(varint.encode(jsonBuf.length)),
    jsonBuf
  ]);
  
  try {
    socket.write(buffer);
    socket.end();
  } catch (e) {
    // Socket might be closed
  }
}

server.listen(SLEEPER_PORT, () => {
  console.log(`Sleeper Proxy listening on port ${SLEEPER_PORT}`);
});