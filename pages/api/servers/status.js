// pages/api/servers/status.js
import WebSocket from 'ws';
import { createClient } from '@supabase/supabase-js';

const statusConnections = new Map();
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_ANON_KEY in environment');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export default function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: 'Method Not Allowed', detail: `Expected GET, got ${req.method}` });
  }

  const { serverId } = req.query;
  if (!serverId) {
    return res.status(400).json({ error: 'Missing serverId' });
  }

  if (req.headers.upgrade === 'websocket') {
    const wss = new WebSocket.Server({ noServer: true });

    wss.on('connection', (ws, request) => {
      console.log('Status WebSocket connected for server:', serverId);
      statusConnections.set(serverId, ws);

      ws.on('message', async (message) => {
        try {
          const data = JSON.parse(message);
          if (data.type === 'status_update') {
            const { error } = await supabase
              .from('servers')
              .update({
                status: data.status,
                cpu_usage: data.cpu || 0,
                memory_usage: data.memory || 0,
                disk_usage: data.disk || 0,
                last_status_update: new Date().toISOString()
              })
              .eq('id', serverId);

            if (error) {
              console.error('Error updating server status in Supabase:', error.message);
            } else {
              console.log('Status updated in Supabase for server:', serverId);
            }

            wss.clients.forEach((client) => {
              if (client.readyState === WebSocket.OPEN) {
                try {
                  client.send(JSON.stringify(data));
                } catch (e) {
                  console.error('Error sending WebSocket message:', e.message);
                }
              }
            });
          }
        } catch (error) {
          console.error('Error processing status message:', error.message, error.stack);
        }
      });

      ws.on('close', () => {
        console.log('Status WebSocket disconnected for server:', serverId);
        statusConnections.delete(serverId);
      });

      ws.on('error', (error) => {
        console.error('Status WebSocket error for server:', serverId, 'Error:', error.message);
      });
    });

    wss.handleUpgrade(req, req.socket, Buffer.alloc(0), (ws) => {
      wss.emit('connection', ws, req);
    });
  } else {
    res.status(400).json({ error: 'Expected WebSocket upgrade' });
  }
}