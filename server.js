require('dotenv').config({ path: '.env.local' });

const https = require('https');
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const { Server } = require('socket.io');
const { createProxyServer } = require('http-proxy');

const PORT = process.env.PORT ? Number(process.env.PORT) : 3001;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment');
  process.exit(1);
}

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const app = express();
app.get('/health', (req, res) => res.json({ ok: true }));

// Create HTTPS server
const server = https.createServer(app);

// Initialize Socket.IO
const io = new Server(server, {
  path: '/socket.io', // Default path for Socket.IO
  cors: {
    origin: '*', // Adjust for your client origins
    methods: ['GET', 'POST'],
  },
});

const proxy = createProxyServer({ ws: true, secure: false });

proxy.on('error', (err, req, res) => {
  console.error('Proxy error for URL:', req.url, 'Error:', err.message, 'Stack:', err.stack);
  try {
    if (res && !res.headersSent) {
      res.writeHead && res.writeHead(502);
      res.end && res.end('Bad Gateway');
    }
  } catch (e) {
    console.error('Error responding to proxy error:', e.message);
  }
});

// Handle Socket.IO connections
io.on('connection', async (socket) => {
  const { url } = socket.request;
  console.log('Socket.IO connection established for URL:', url);

  let target;
  let serverId;

  if (url.startsWith('/ws/console/')) {
    const parts = url.split('/');
    serverId = parts[parts.length - 1];
    target = async () => {
      const { data, error } = await supabaseAdmin
        .from('servers')
        .select('ipv4')
        .eq('id', serverId)
        .single();
      if (error || !data || !data.ipv4) {
        console.warn('Proxy: missing server IP for', serverId, 'Error:', error?.message);
        socket.disconnect();
        return null;
      }
      return `ws://${data.ipv4}:3002`; // Internal WebSocket connection
    };
  } else if (url.startsWith('/ws/metrics/')) {
    const parts = url.split('/');
    serverId = parts[parts.length - 1];
    target = async () => {
      const { data, error } = await supabaseAdmin
        .from('servers')
        .select('ipv4')
        .eq('id', serverId)
        .single();
      if (error || !data || !data.ipv4) {
        console.warn('Proxy: missing server IP for', serverId, 'Error:', error?.message);
        socket.disconnect();
        return null;
      }
      return `ws://${data.ipv4}:3004`; // Internal WebSocket connection
    };
  } else {
    console.warn('Unknown Socket.IO path:', url);
    socket.disconnect();
    return;
  }

  if (!serverId) {
    console.warn('No serverId in Socket.IO URL:', url);
    socket.disconnect();
    return;
  }

  try {
    const targetUrl = await target();
    if (!targetUrl) {
      socket.disconnect();
      return;
    }

    console.log(`Proxying Socket.IO ${url} -> ${targetUrl}`);
    // Since backend servers use raw WebSockets, we need to handle Socket.IO to WebSocket bridging
    socket.on('message', (data) => {
      // Forward Socket.IO messages to the WebSocket backend if needed
      console.log('Received Socket.IO message:', data);
      // You may need a WebSocket client here to forward messages to the backend
    });

    socket.on('disconnect', () => {
      console.log('Socket.IO disconnected for serverId:', serverId);
    });

    socket.on('error', (err) => {
      console.error('Socket.IO error for serverId:', serverId, 'Error:', err.message);
    });
  } catch (err) {
    console.error('Proxy lookup error for serverId:', serverId, 'Error:', err.message, 'Stack:', err.stack);
    socket.disconnect();
  }
});

// Handle WebSocket upgrades for compatibility
server.on('upgrade', (req, socket, head) => {
  // Socket.IO handles its own upgrades, but you may need to handle raw WebSocket upgrades for backward compatibility
  console.log('Handling upgrade for:', req.url);
  io.handleUpgrade(req, socket, head, (ws) => {
    io.emit('connection', ws, req);
  });
});

server.listen(PORT, () => {
  console.log(`Proxy server listening on https://localhost:${PORT}`);
  console.log('/ws/console/:serverId -> proxies to server:3002');
  console.log('/ws/metrics/:serverId -> proxies to server:3004');
});