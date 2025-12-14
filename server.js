// server.js
require('dotenv').config({ path: '.env.local' });
const express       = require('express');
const http          = require('http');
const { createClient } = require('@supabase/supabase-js');
const WebSocket     = require('ws');

const PORT                = Number(process.env.PORT) || 3001;
const SUPABASE_URL        = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SERVER_TOKEN        = process.env.SERVER_TOKEN;   // same secret as game servers

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !SERVER_TOKEN) {
  console.error('Missing required env vars');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const app      = express();
const server   = http.createServer(app);
const wss      = new WebSocket.Server({ noServer: true });

/* ------------------------------------------------------------------
   Helper: broadcast to all browser clients of a serverId
------------------------------------------------------------------ */
const clients = new Map(); // serverId → Set<WebSocket|Response>

function broadcast(serverId, msg) {
  const set = clients.get(serverId) || [];
  set.forEach(client => {
    // WebSocket Clients
    if (client.readyState === WebSocket.OPEN) {
        client.send(msg);
    } 
    // SSE Clients (Response objects)
    else if (client.writable) {
        client.write(`data: ${msg}\n\n`);
    }
  });
}

/* ------------------------------------------------------------------
   1. Upgrade handler – authenticates game-server WS
------------------------------------------------------------------ */
server.on('upgrade', async (req, socket, head) => {
  const url = new URL(req.url, 'http://localhost');
  const pathname = url.pathname;

  // A. Game Server Connection (Source of logs)
  if (pathname.startsWith('/ws/console/')) {
    const serverId = pathname.split('/').pop();
    const token = url.searchParams.get('token');

    if (token !== SERVER_TOKEN) {
      console.warn('Invalid token from', req.socket.remoteAddress);
      socket.destroy();
      return;
    }

    // Verify server exists
    const { data } = await supabase.from('servers').select('id').eq('id', serverId).single();
    if (!data) { socket.destroy(); return; }

    wss.handleUpgrade(req, socket, head, ws => {
      wss.emit('connection', ws, req);
      // Game-server → proxy messages
      ws.on('message', async raw => {
        let msg;
        try { msg = JSON.parse(raw); } catch { return; }
        if (msg.type !== 'log' || typeof msg.line !== 'string') return;

        // 1. Persist
        await supabase.from('console_logs').insert({
          server_id: serverId,
          line: msg.line.trim()
        });

        // 2. Broadcast to browsers
        broadcast(serverId, raw);
      });
    });
    return;
  }

  // B. Browser Connection - If your app uses WS for clients, secure it here.
  // For now, based on your files, clients use SSE. Reject other WS attempts.
  socket.destroy();
});

/* ------------------------------------------------------------------
   2. SSE fallback (Secured)
------------------------------------------------------------------ */
app.get('/sse/console/:serverId', async (req, res) => {
  const { serverId } = req.params;
  const { token } = req.query; // Client MUST provide JWT

  if (!token) return res.status(401).json({ error: 'Missing authentication token' });

  // --- SECURITY FIX: Verify User & Ownership ---
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
      return res.status(401).json({ error: 'Unauthorized' });
  }

  const { data: server } = await supabase.from('servers').select('user_id').eq('id', serverId).single();
  if (!server) return res.status(404).end('Server not found');

  if (server.user_id !== user.id) {
      return res.status(403).json({ error: 'Forbidden: You do not own this server' });
  }
  // ---------------------------------------------

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // send history
  const { data: hist } = await supabase
    .from('console_logs')
    .select('line')
    .eq('server_id', serverId)
    .order('created_at', { ascending: true })
    .limit(200);

  hist?.forEach(row => res.write(`data: ${JSON.stringify({ type: 'log', line: row.line })}\n\n`));

  // register SSE client
  if (!clients.has(serverId)) clients.set(serverId, new Set());
  clients.get(serverId).add(res);

  req.on('close', () => {
    const set = clients.get(serverId);
    if (set) set.delete(res);
  });

  // keep-alive heartbeat
  const listener = setInterval(() => {
      if (res.writable) res.write(': keep-alive\n\n');
  }, 30000); 
});

/* ------------------------------------------------------------------
   Health & start
------------------------------------------------------------------ */
app.get('/health', (req, res) => res.json({ ok: true }));

server.listen(PORT, () => {
  console.log(`Proxy listening on ${PORT}`);
});