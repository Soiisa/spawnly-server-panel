import net from 'net';
import { GameDig } from 'gamedig';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { action, ip, port, game } = req.body;

  if (!ip || !port) {
    return res.status(400).json({ error: 'IP and Port are required' });
  }

  // --- TOOL 1: PORT FORWARDING TESTER (TCP) ---
  if (action === 'port') {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      socket.setTimeout(2500); // 2.5 second timeout

      socket.on('connect', () => {
        socket.destroy();
        resolve(res.status(200).json({ open: true, message: 'Port is open and accepting connections.' }));
      });

      socket.on('timeout', () => {
        socket.destroy();
        resolve(res.status(200).json({ open: false, message: 'Connection timed out. Port is likely closed or blocked by a firewall.' }));
      });

      socket.on('error', (err) => {
        socket.destroy();
        resolve(res.status(200).json({ open: false, message: `Connection refused (${err.code}). Port is closed.` }));
      });

      socket.connect(port, ip);
    });
  }

  // --- TOOL 2: GAME SERVER STATUS CHECKER ---
  if (action === 'status') {
    try {
      const state = await GameDig.query({
        type: game || 'minecraft',
        host: ip,
        port: parseInt(port),
        maxAttempts: 2,
        socketTimeout: 2000,
      });

      return res.status(200).json({
        online: true,
        name: state.name,
        map: state.map,
        players: state.players.length,
        maxPlayers: state.maxplayers,
        ping: state.ping,
      });
    } catch (error) {
      return res.status(200).json({
        online: false,
        message: 'Server is offline or unreachable.',
      });
    }
  }

  return res.status(400).json({ error: 'Invalid action' });
}