import { useEffect, useState, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';

export default function ServerStatusIndicator({ server }) {
  const [status, setStatus] = useState(server.status || 'Unknown');
  const [cpu, setCpu] = useState(0);
  const [memory, setMemory] = useState(0);
  const [disk, setDisk] = useState(0);
  const [connected, setConnected] = useState(false);
  const [debug, setDebug] = useState('');

  useEffect(() => {
    if (!server?.id) {
      setDebug('No server id available');
      return;
    }

    setDebug('Subscribing to server updates via Supabase');

    const channel = supabase
      .channel(`server-status-${server.id}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'servers',
        filter: `id=eq.${server.id}`
      }, (payload) => {
        try {
          const newRow = payload.new;
          if (!newRow) return;
          setStatus(newRow.status || status);
          setCpu(newRow.cpu || 0);
          setMemory(newRow.memory || 0);
          setDisk(newRow.disk || 0);
          setConnected(true);
        } catch (e) {
          console.error('Error handling realtime payload', e);
        }
      })
      .subscribe();

    return () => {
      try {
        supabase.removeChannel(channel);
      } catch (e) {
        // fallback: nothing
      }
    };
  }, [server.id]);

  if (!server.ipv4) {
    return (
      <span className="bg-gray-100 text-gray-800 text-xs px-2 py-1 rounded">
        Stopped
      </span>
    );
  }

  return (
    <div className="flex items-center">
      <span className={`text-xs px-2 py-1 rounded mr-2 ${
        status === "Running" ? "bg-green-100 text-green-800" : 
        status === "Starting" || status === "Stopping" || status === "Initializing" ? "bg-yellow-100 text-yellow-800" : 
        "bg-gray-100 text-gray-800"
      }`}>
        {status}
        {!connected && status !== "Stopped" && " (Disconnected)"}
      </span>
    </div>
  );
}