import { Server } from 'socket.io';
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

  // Check if Socket.IO server is already attached
  if (!res.socket.server.io) {
    console.log('Initializing Socket.IO server for status');
    const io = new Server(res.socket.server, {
      path: `/api/servers/status/${serverId}`,
      cors: {
        origin: '*', // Adjust for your client origins
        methods: ['GET', 'POST'],
      },
    });

    io.on('connection', (socket) => {
      console.log('Socket.IO connected for server:', serverId);
      statusConnections.set(serverId, socket);

      socket.on('status_update', async (data) => {
        try {
          if (data.type === 'status_update') {
            const { error } = await supabase
              .from('servers')
              .update({
                status: data.status,
                cpu_usage: data.cpu || 0,
                memory_usage: data.memory || 0,
                disk_usage: data.disk || 0,
                last_status_update: new Date().toISOString(),
              })
              .eq('id', serverId);

            if (error) {
              console.error('Error updating server status in Supabase:', error.message);
            } else {
              console.log('Status updated in Supabase for server:', serverId);
            }

            // Broadcast to all connected clients
            io.emit('status_update', data);
          }
        } catch (error) {
          console.error('Error processing status message:', error.message, error.stack);
        }
      });

      socket.on('disconnect', () => {
        console.log('Socket.IO disconnected for server:', serverId);
        statusConnections.delete(serverId);
      });

      socket.on('error', (error) => {
        console.error('Socket.IO error for server:', serverId, 'Error:', error.message);
      });
    });

    res.socket.server.io = io;
  } else {
    console.log('Socket.IO server already initialized for status');
  }

  res.end();
}