// server.js
require('dotenv').config({ path: '.env.local' });

const http = require('http');
const express = require('express');
const { createProxyServer } = require('http-proxy');
const { createClient } = require('@supabase/supabase-js');

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

        const target = `wss://${data.ipv4}:3002`;
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
