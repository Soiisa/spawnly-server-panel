// components/MetricsViewer.js

import { useEffect, useRef, useState } from 'react';

export default function MetricsViewer({ server }) {
  const wsRef = useRef(null);
  const [metrics, setMetrics] = useState({
    cpu: 0,
    ram: 0
  });
  const [connected, setConnected] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const reconnectTimeoutRef = useRef(null);

  useEffect(() => {
    if (!server || !server.ipv4) return;

    const connectToServer = () => {
      // Use the server's IP directly
      const wsUrl = `wss://${server.subdomain}.spawnly.net:3004`;
      
      setStatusMsg(`Connecting to ${server.ipv4}:3004...`);
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        setStatusMsg(`Connected to ${server.ipv4}:3004`);
        // Clear any reconnect timeout
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
          reconnectTimeoutRef.current = null;
        }
      };

      ws.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data);
          // Handle the actual data format: {cpu: number, ram: string, timestamp: string}
          if (data.cpu !== undefined && data.ram !== undefined) {
            setMetrics({
              cpu: data.cpu,
              ram: parseFloat(data.ram) || 0
            });
          }
        } catch (e) {
          console.error('Metrics parse error', e);
        }
      };

      ws.onerror = (err) => {
        console.warn('Metrics WS error', err);
        setStatusMsg('Connection error, retrying...');
      };

      ws.onclose = () => {
        setConnected(false);
        setStatusMsg('Disconnected, attempting to reconnect...');
        
        // Try to reconnect after a delay
        if (!reconnectTimeoutRef.current) {
          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectTimeoutRef.current = null;
            connectToServer();
          }, 3000);
        }
      };
    };

    connectToServer();

    return () => {
      try {
        wsRef.current?.close();
      } catch (e) {}
      
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
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
    </div>
  );
}