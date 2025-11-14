// components/MetricsViewer.js

import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

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
    if (!server || !server.id) return;

    // Subscribe to servers table updates for this server to receive metrics
    const channel = supabase
      .channel(`server-metrics-${server.id}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'servers',
        filter: `id=eq.${server.id}`
      }, (payload) => {
        try {
          const newRow = payload.new;
          if (!newRow) return;
          setMetrics({ cpu: newRow.cpu || 0, ram: newRow.memory || 0 });
          setConnected(true);
          setStatusMsg('Receiving metrics via Supabase');
        } catch (e) {
          console.error('Error handling metrics payload', e);
        }
      })
      .subscribe();

    return () => {
      try { supabase.removeChannel(channel); } catch (e) {}
    };
  }, [server]);

  return (
    <div className="bg-white rounded-lg shadow p-4">

      <div className="grid grid-cols-2 gap-4">
        <div>
          <div className="font-bold">CPU Usage</div>
          <div className="text-2xl">{Math.round(metrics.cpu)}%</div>
          <div className="text-sm text-gray-500">Usage</div>
          <div className="bg-gray-200 h-4 rounded">
            <div className="bg-blue-500 h-4 rounded" style={{ width: `${Math.min(Math.round(metrics.cpu), 100)}%` }} />
          </div>
        </div>
        <div>
          <div className="font-bold">RAM Usage</div>
          <div className="text-2xl">{Math.round(metrics.ram)}%</div>
          <div className="text-sm text-gray-500">Usage</div>
          <div className="bg-gray-200 h-4 rounded">
            <div className="bg-green-500 h-4 rounded" style={{ width: `${Math.min(Math.round(metrics.ram), 100)}%` }} />
          </div>
        </div>
      </div>
    </div>
  );
}