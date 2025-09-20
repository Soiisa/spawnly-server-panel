// components/ServerStatusIndicator.js
import { useEffect, useState, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';

export default function ServerStatusIndicator({ server }) {
  const [status, setStatus] = useState(server.status || 'Unknown');
  const [cpu, setCpu] = useState(0);
  const [memory, setMemory] = useState(0);
  const [disk, setDisk] = useState(0);
  const [connected, setConnected] = useState(false);
  const [debug, setDebug] = useState('');
  const wsRef = useRef(null);
  const channelRef = useRef(null);

  useEffect(() => {
    if (!server?.id) {
      setDebug('No server ID available');
      return;
    }

    // Subscribe to Supabase real-time updates for status
    channelRef.current = supabase
      .channel(`server-status-${server.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'servers',
          filter: `id=eq.${server.id}`
        },
        (payload) => {
          console.log('Received Supabase status update:', payload);
          const newData = payload.new;
          setStatus(newData.status || 'Unknown');
          setCpu(newData.cpu_usage || 0);
          setMemory(newData.memory_usage || 0);
          setDisk(newData.disk_usage || 0);
          setConnected(true);
          setDebug('Updated from Supabase');
        }
      )
      .subscribe((status) => {
        console.log('Supabase subscription status:', status);
        if (status === 'SUBSCRIBED') {
          setDebug('Subscribed to Supabase updates');
        }
      });

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
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