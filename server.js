// server.js
require('dotenv').config({ path: '.env.local' });

const http = require('http');
const express = require('express');
const { createProxyServer } = require('http-proxy');
const { createClient } = require('@supabase/supabase-js');
const WebSocketClient = require('ws');

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

// SSE proxy endpoint to stream console logs as Server-Sent Events (EventSource)
app.get('/sse/console/:serverId', async (req, res) => {
  const { serverId } = req.params;
  if (!serverId) return res.status(400).end('Missing serverId');

  try {
    const { data, error } = await supabaseAdmin
      .from('servers')
      .select('ipv4')
      .eq('id', serverId)
      .single();

    if (error || !data || !data.ipv4) {
      console.warn('SSE proxy: missing server IP for', serverId, error);
      return res.status(404).end('Server not found');
    }

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    // Some proxies respect this
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders && res.flushHeaders();

    const targetWs = `ws://${data.ipv4}:3002`;
    const ws = new WebSocketClient(targetWs);

    // Send a simple comment to establish the stream
    res.write(': connected\n\n');

    // Keepalive ping every 20s to prevent idle timeouts from proxies
    const keepalive = setInterval(() => {
      try { res.write(': keepalive\n\n'); } catch (e) {}
    }, 20000);

    ws.on('open', () => {
      console.log('SSE proxy connected to console WS for', serverId, '->', targetWs);
    });

    ws.on('message', (msg) => {
      const text = String(msg || '');
      // split into lines and forward as individual SSE data events
      text.replace(/\r/g, '').split('\n').forEach((line) => {
        if (!line) return;
        try {
          // escape lone newlines inside data
          const safe = line.replace(/\n/g, '\\n');
          res.write(`data: ${safe}\n\n`);
        } catch (e) {}
      });
    });

    ws.on('error', (err) => {
      console.error('SSE proxy WS error:', err && err.message);
      try {
        res.write(`event: error\ndata: ${JSON.stringify({ error: err && err.message })}\\n\\n`);
      } catch (e) {}
    });

    const closeEverything = () => {
      try { clearInterval(keepalive); } catch (e) {}
      try { ws.close(); } catch (e) {}
      try { res.end(); } catch (e) {}
    };

    // If the client disconnects, close the WS
    req.on('close', () => {
      closeEverything();
    });

  } catch (err) {
    console.error('SSE proxy error', err && err.message);
    return res.status(500).end('Internal error');
  }
});

const server = http.createServer(app);

// http-proxy for websocketsa
const proxy = createProxyServer({ ws: true, secure: false });

proxy.on('error', (err, req, res) => {
  console.error('Proxy error', err && err.message);
  try {
    if (res && !res.headersSent) {
      res.writeHead && res.writeHead(502);
      res.end && res.end('Bad Gateway');
    }
  } catch (e) {}
});

// upgrade handler
server.on('upgrade', (req, socket, head) => {
  try {
    if (!req.url || !req.url.startsWith('/ws/console/')) {
      socket.destroy();
      return;
    }

    const parts = req.url.split('/');
    const serverId = parts[parts.length - 1];
    if (!serverId) {
      socket.destroy();
      return;
    }

    (async () => {
      try {
        // lookup server ip from Supabase
        const { data, error } = await supabaseAdmin
          .from('servers')
          .select('ipv4')
          .eq('id', serverId)
          .single();

        if (error || !data || !data.ipv4) {
          console.warn('Proxy: missing server IP for', serverId, error);
          socket.destroy();
          return;
        }

        const target = `ws://${data.ipv4}:3002`;
        console.log(`Proxying WS ${req.url} -> ${target}`);
        proxy.ws(req, socket, head, { target }, (err) => {
          if (err) {
            console.error('Proxy.ws failed', err && err.message);
            try { socket.destroy(); } catch (_) {}
          }
        });
      } catch (err) {
        console.error('Proxy lookup error', err && err.message);
        try { socket.destroy(); } catch (_) {}
      }
    })();
  } catch (err) {
    console.error('Upgrade handler error', err && err.message);
    try { socket.destroy(); } catch (_) {}
  }
});

server.listen(PORT, () => {
  console.log(`Proxy server listening on http://localhost:${PORT}`);
  console.log('/ws/console/:serverId -> looks up supabase and proxies to server:3002');
});
