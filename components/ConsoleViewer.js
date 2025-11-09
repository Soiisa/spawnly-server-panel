// components/ConsoleViewer.js
import { useEffect, useRef, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

export default function ConsoleViewer({ server }) {
  const logRef = useRef(null);
  const subscriptionRef = useRef(null);
  const [lines, setLines] = useState([]);
  const [connected, setConnected] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [paused, setPaused] = useState(false);
  const [command, setCommand] = useState('');
  const [status, setStatus] = useState('Connecting...');

  useEffect(() => {
    if (!server?.id) return;

    // Load initial console log
    const loadConsole = async () => {
      const { data, error } = await supabase
        .from('server_console')
        .select('console_log')
        .eq('server_id', server.id)
        .single();

      if (error && error.code !== 'PGRST116') { // Ignore if no row exists yet
        console.error('Error loading console:', error);
        return;
      }

      const logText = data?.console_log || '';
      setLines(logText ? logText.split('\n') : []);
    };

    loadConsole();

    // Subscribe to realtime updates via Postgres changes
    const channel = supabase.channel(`console:${server.id}`);
    channel
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'server_console',
          filter: `server_id=eq.${server.id}`,
        },
        (payload) => {
          if (paused) return;
          if (payload.eventType === 'DELETE') return; // Ignore deletes
          const newLog = payload.new?.console_log || '';
          setLines(newLog.split('\n'));
        }
      )
      .subscribe((subStatus) => {
        setConnected(subStatus === 'SUBSCRIBED');
        setStatus(subStatus === 'SUBSCRIBED' ? 'Live' : subStatus);
      });

    subscriptionRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
    };
  }, [server?.id, paused]);

  // Auto-scroll
  useEffect(() => {
    if (autoScroll && logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [lines, autoScroll]);

  // RCON (unchanged)
  const sendCommand = async (e) => {
    e?.preventDefault();
    if (!command.trim()) return;
    try {
      setStatus('Sending...');
      const resp = await fetch('/api/servers/rcon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serverId: server.id, command: command.trim() }),
      });
      const json = await resp.json();
      if (!resp.ok) throw new Error(json.error || 'Failed');
      setStatus('Sent');
      if (json.response) {
        setLines(prev => [...prev, `[rcon] ${json.response}`]);
      }
    } catch (err) {
      setStatus(`Error: ${err.message}`);
    } finally {
      setCommand('');
      setTimeout(() => setStatus('Connected'), 2000);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow p-4">
      <div className="flex items-center justify-between mb-2">
        <div>
          <strong className="text-lg">{server?.name || 'Server Console'}</strong>
          <div className="text-sm text-gray-500">
            {connected ? 'Live' : 'Disconnected'} — {status}
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <button onClick={() => setAutoScroll(s => !s)} className="px-2 py-1 bg-gray-100 rounded">
            {autoScroll ? 'Auto-scroll ON' : 'Auto-scroll OFF'}
          </button>
          <button onClick={() => setPaused(p => !p)} className="px-2 py-1 bg-gray-100 rounded">
            {paused ? 'Resume' : 'Pause'}
          </button>
          <button onClick={() => setLines([])} className="px-2 py-1 bg-gray-100 rounded">Clear</button>
        </div>
      </div>

      <div
        ref={logRef}
        style={{ height: 360, overflowY: 'auto', fontFamily: 'monospace', whiteSpace: 'pre-wrap', fontSize: 12 }}
        className="p-2 border rounded bg-black text-white"
      >
        {lines.length === 0 ? (
          <div className="text-gray-400">No logs yet — waiting for data...</div>
        ) : (
          lines.map((l, i) => <div key={i}>{l}</div>)
        )}
      </div>

      <form onSubmit={sendCommand} className="mt-3 flex gap-2">
        <input
          className="flex-1 px-3 py-2 border rounded"
          placeholder='Type a command (e.g. "say hello")'
          value={command}
          onChange={(e) => setCommand(e.target.value)}
        />
        <button type="submit" className="bg-indigo-600 text-white px-4 py-2 rounded">Send</button>
      </form>
    </div>
  );
}