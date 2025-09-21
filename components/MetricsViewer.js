// components/MetricsViewer.js
import { useEffect, useRef, useState } from 'react';

export default function MetricsViewer({ server }) {
  const esRef = useRef(null);
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
      const es = new EventSource(`http://${server.ipv4}:3004/metrics`);
      esRef.current = es;

      es.onopen = () => {
        setConnected(true);
        setStatusMsg(`Connected to ${server.ipv4}:3004`);
      };

      es.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.cpu !== undefined && data.ram !== undefined) {
            setMetrics({
              cpu: parseFloat(data.cpu) || 0,
              ram: parseFloat(data.ram) || 0,
            });
          }
        } catch (err) {
          console.warn('Metrics parse error:', err);
        }
      };

      es.onerror = (err) => {
        console.warn('Metrics SSE error:', err);
        setStatusMsg('Connection error, retrying...');
        setConnected(false);
        es.close();
        setTimeout(connectToServer, 3000);
      };
    };

    connectToServer();

    return () => {
      esRef.current?.close();
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