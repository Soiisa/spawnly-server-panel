// pages/api/servers/status.js

import WebSocket from 'ws';
import { createClient } from '@supabase/supabase-js';
import url from 'url';

const statusConnections = new Map();
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Use Service Role Key to verify RCON passwords securely
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

export default function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).end('Method Not Allowed');
  }

  // Check if this is a WebSocket upgrade request
  if (req.headers.upgrade === 'websocket') {
    const wss = new WebSocket.Server({ noServer: true });
    
    wss.on('connection', async (ws, request) => {
      // --- SECURITY FIX: Authenticate via Query Param ---
      const parsedUrl = url.parse(request.url, true);
      const { serverId, token } = parsedUrl.query;

      if (!serverId || !token) {
        console.warn('WS connection rejected: Missing credentials');
        ws.close(1008, 'Missing credentials');
        return;
      }

      // Verify Credentials against DB
      const { data: server } = await supabaseAdmin
        .from('servers')
        .select('rcon_password')
        .eq('id', serverId)
        .single();

      // Check if token matches the stored RCON password
      if (!server || server.rcon_password !== token) {
        console.warn(`WS connection rejected for server ${serverId}: Invalid token`);
        ws.close(1008, 'Invalid authentication');
        return;
      }

      console.log('Status WebSocket connected/authorized for server:', serverId);
      statusConnections.set(serverId, ws);
      
      ws.on('message', async (message) => {
        try {
          const data = JSON.parse(message);
          
          // Only process status updates from this authorized socket
          if (data.type === 'status_update') {
            const { error } = await supabaseAdmin
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
              console.error('Error updating server status:', error);
            }
          }
          
          // Broadcast to all connected clients for this server (e.g., frontend clients)
          // Note: In a production app, frontend clients should connect to a different endpoint
          // or use Supabase Realtime to avoid exposing this privileged socket logic.
          wss.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN && client !== ws) {
              client.send(JSON.stringify(data));
            }
          });
        } catch (error) {
          console.error('Error processing status message:', error);
        }
      });

      ws.on('close', () => {
        console.log('Status WebSocket disconnected for server:', serverId);
        statusConnections.delete(serverId);
      });
    });

    // Handle the upgrade
    wss.handleUpgrade(req, req.socket, Buffer.alloc(0), (ws) => {
      wss.emit('connection', ws, req);
    });
  } else {
    res.status(400).json({ error: 'Expected WebSocket upgrade' });
  }
}