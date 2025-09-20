// pages/api/servers/status.js

import WebSocket from 'ws';
import { createClient } from '@supabase/supabase-js';

// Store active connections
const statusConnections = new Map();
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export default function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).end('Method Not Allowed');
  }

  // Upgrade to WebSocket connection
  const { serverId } = req.query;
  if (!serverId) {
    return res.status(400).json({ error: 'Missing serverId' });
  }

  // Check if this is a WebSocket upgrade request
  if (req.headers.upgrade === 'websocket') {
    const wss = new WebSocket.Server({ noServer: true });
    
    wss.on('connection', (ws, request) => {
  console.log('Status WebSocket connected for server:', serverId);
  
  // Store connection
  statusConnections.set(serverId, ws);
  
  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message);
      
      // Update Supabase with status data
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
          console.error('Error updating server status:', error);
        }
      }
      
      // Broadcast to all connected clients for this server
      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
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