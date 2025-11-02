// server.js
require('dotenv').config({ path: '.env.local' });
const express       = require('express');
const http          = require('http');
const { createClient } = require('@supabase/supabase-js');
const WebSocket     = require('ws');
const { v4: uuidv4 } = require('uuid');

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
const clients = new Map(); // serverId → Set<WebSocket>

function broadcast(serverId, msg) {
  const set = clients.get(serverId) || [];
  set.forEach(ws => {
    if (ws.readyState === WebSocket.OPEN) ws.send(msg);
  });
}

/* ------------------------------------------------------------------
   1. WebSocket endpoint for **browsers**
------------------------------------------------------------------ */
wss.on('connection', async (ws, req) => {
  const url = new URL(req.headers['x-forwarded-proto'] === 'https' ? 'https://' + req.headers.host : req.url, 'http://localhost');
  const serverId = url.pathname.split('/').pop();

  // ---- fetch last N lines for instant UI fill ----
  const { data: history } = await supabase
    .from('console_logs')
    .select('line')
    .eq('server_id', serverId)
    .order('created_at', { ascending: false })
    .limit(200);

  if (history) {
    history.reverse().forEach(row => ws.send(JSON.stringify({ type: 'log', line: row.line })));
  }

  // register client
  if (!clients.has(serverId)) clients.set(serverId, new Set());
  clients.get(serverId).add(ws);

  ws.on('close', () => {
    const set = clients.get(serverId);
    if (set) { set.delete(ws); if (set.size === 0) clients.delete(serverId); }
  });
});

/* ------------------------------------------------------------------
   2. Upgrade handler – authenticates game-server WS
------------------------------------------------------------------ */
server.on('upgrade', async (req, socket, head) => {
  const pathname = req.url.split('?')[0];
  if (!pathname.startsWith('/ws/console/')) { socket.destroy(); return; }

  const serverId = pathname.split('/').pop();
  const url = new URL(req.url, 'http://localhost');
  const token = url.searchParams.get('token');

  if (token !== SERVER_TOKEN) {
    console.warn('Invalid token from', req.socket.remoteAddress);
    socket.destroy();
    return;
  }

  // Verify server really exists (optional but nice)
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
});

/* ------------------------------------------------------------------
   3. SSE fallback (for browsers that cannot open raw WS)
------------------------------------------------------------------ */
app.get('/sse/console/:serverId', async (req, res) => {
  const { serverId } = req.params;
  const { data: server } = await supabase.from('servers').select('id').eq('id', serverId).single();
  if (!server) return res.status(404).end('Server not found');

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
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

  // forward future logs
  const listener = setInterval(() => {}, 30000); // keep-alive
  const handler = (msg) => {
    try { res.write(`data: ${msg}\n\n`); } catch {}
  };
  const broadcastSet = clients.get(serverId);
  broadcastSet.forEach(c => c === res || c.readyState === WebSocket.OPEN && c.onmessage && c.onmessage({ data: '' })); // dummy
  // actual broadcast is done in the WS handler above; SSE just receives the same JSON string
});

/* ------------------------------------------------------------------
   Health & start
------------------------------------------------------------------ */
app.get('/health', (req, res) => res.json({ ok: true }));

server.listen(PORT, () => {
  console.log(`Proxy listening on ${PORT}`);
  console.log(`  WS browsers → wss://spawnly.net/ws/console/:id`);
  console.log(`  WS game    → wss://spawnly.net/ws/console/:id?token=…`);
  console.log(`  SSE fallback → /sse/console/:id`);
});