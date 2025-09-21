// components/MetricsViewer.js
import { useEffect, useRef, useState } from 'react';
import io from 'socket.io-client';

export default function MetricsViewer({ server }) {
  const socketRef = useRef(null);
  const [metrics, setMetrics] = useState({
    cpu: 0,
    ram: 0,
  });
  const [connected, setConnected] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');

  useEffect(() => {
    if (!server || !server.ipv4) {
      setStatusMsg('No server IP available');
      return;
    }

    const connectToServer = () => {
      const socket = io(`http://${server.ipv4}:3004`, {
        transports: ['websocket'], // Use WebSocket transport only
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 3000,
      });
      socketRef.current = socket;

      socket.on('connect', () => {
        setConnected(true);
        setStatusMsg(`Connected to ${server.ipv4}:3004`);
      });

      socket.on('metrics', (data) => {
        if (data.cpu !== undefined && data.ram !== undefined) {
          setMetrics({
            cpu: parseFloat(data.cpu) || 0,
            ram: parseFloat(data.ram) || 0,
          });
        }
      });

      socket.on('connect_error', (err) => {
        console.warn('Metrics Socket.IO error:', err.message);
        setStatusMsg('Connection error, retrying...');
        setConnected(false);
      });

      socket.on('disconnect', () => {
        setConnected(false);
        setStatusMsg('Disconnected, attempting to reconnect...');
      });
    };

    connectToServer();

    return () => {
      socketRef.current?.disconnect();
    };
  }, [server]);

  return (
    <div className="bg-white rounded-lg shadow p-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <div className="font-bold">CPU Usage</div>
          <div className="text-2xl">{metrics.cpu}%</div>
          <div className="text-sm text-gray-500">Usage</div>
          <div className="bg-gray-200 h-4 rounded">
            <div className="bg-blue-500 h-4 rounded" style={{ width: `${Math.min(metrics.cpu, 100)}%` }} />
          </div>
        </div>
        <div>
          <div className="font-bold">RAM Usage</div>
          <div className="text-2xl">{metrics.ram}%</div>
          <div className="text-sm text-gray-500">Usage</div>
          <div className="bg-gray-200 h-4 rounded">
            <div className="bg-green-500 h-4 rounded" style={{ width: `${Math.min(metrics.ram, 100)}%` }} />
          </div>
        </div>
      </div>
      <div className="text-sm text-gray-500 mt-2">
        {connected ? 'Live' : 'Disconnected'} — {statusMsg}
      </div>
    </div>
  );
}