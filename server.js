require('dotenv').config({ path: '.env.local' });

const https = require('https');
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

// Render handles SSL, so we use HTTPS
const server = https.createServer(app);

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

server.on('upgrade', (req, socket, head) => {
  try {
    if (!req.url) {
      console.warn('Invalid WebSocket URL:', req.url);
      socket.destroy();
      return;
    }

    let target;
    let serverId;

    if (req.url.startsWith('/ws/console/')) {
      const parts = req.url.split('/');
      serverId = parts[parts.length - 1];
      target = async () => {
        const { data, error } = await supabaseAdmin
          .from('servers')
          .select('ipv4')
          .eq('id', serverId)
          .single();
        if (error || !data || !data.ipv4) {
          console.warn('Proxy: missing server IP for', serverId, 'Error:', error?.message);
          socket.destroy();
          return null;
        }
        return `ws://${data.ipv4}:3002`; // Internal connection
      };
    } else if (req.url.startsWith('/ws/status/')) {
      const parts = req.url.split('/');
      serverId = parts[parts.length - 1];
      target = async () => {
        const { data, error } = await supabaseAdmin
          .from('servers')
          .select('ipv4')
          .eq('id', serverId)
          .single();
        if (error || !data || !data.ipv4) {
          console.warn('Proxy: missing server IP for', serverId, 'Error:', error?.message);
          socket.destroy();
          return null;
        }
        return `ws://${data.ipv4}:3006`; // Internal connection
      };
    } else if (req.url.startsWith('/ws/metrics/')) {
      const parts = req.url.split('/');
      serverId = parts[parts.length - 1];
      target = async () => {
        const { data, error } = await supabaseAdmin
          .from('servers')
          .select('ipv4')
          .eq('id', serverId)
          .single();
        if (error || !data || !data.ipv4) {
          console.warn('Proxy: missing server IP for', serverId, 'Error:', error?.message);
          socket.destroy();
          return null;
        }
        return `ws://${data.ipv4}:3004`; // Internal connection
      };
    } else {
      console.warn('Unknown WebSocket path:', req.url);
      socket.destroy();
      return;
    }

    if (!serverId) {
      console.warn('No serverId in WebSocket URL:', req.url);
      socket.destroy();
      return;
    }

    (async () => {
      try {
        const targetUrl = await target();
        if (!targetUrl) return;
        console.log(`Proxying WS ${req.url} -> ${targetUrl}`);
        proxy.ws(req, socket, head, { target: targetUrl }, (err) => {
          if (err) {
            console.error('Proxy.ws failed for serverId:', serverId, 'Target:', targetUrl, 'Error:', err.message);
            try { socket.destroy(); } catch (_) {}
          }
        });
      } catch (err) {
        console.error('Proxy lookup error for serverId:', serverId, 'Error:', err.message, 'Stack:', err.stack);
        try { socket.destroy(); } catch (_) {}
      }
    })();
  } catch (err) {
    console.error('Upgrade handler error for URL:', req.url, 'Error:', err.message, 'Stack:', err.stack);
    try { socket.destroy(); } catch (_) {}
  }
});

server.listen(PORT, () => {
  console.log(`Proxy server listening on https://localhost:${PORT}`);
  console.log('/ws/console/:serverId -> proxies to server:3002');
  console.log('/ws/status/:serverId -> proxies to server:3006');
  console.log('/ws/metrics/:serverId -> proxies to server:3004');
});