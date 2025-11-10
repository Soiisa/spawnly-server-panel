// components/ConsoleViewer.js
import { useEffect, useRef, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

export default function ConsoleViewer({ server }) {
  const logRef = useRef(null);
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

    // Subscribe to realtime updates - FIXED VERSION
    const channel = supabase
      .channel(`console:${server.id}`)
      .on(
        'postgres_changes',
        {
          event: '*', // Listen for INSERT, UPDATE, DELETE
          schema: 'public',
          table: 'server_console',
          filter: `server_id=eq.${server.id}`,
        },
        (payload) => {
          if (paused) return;
          
          console.log('Realtime update received:', payload);
          
          // Handle different event types
          if (payload.eventType === 'DELETE') {
            setLines([]);
            return;
          }
          
          // For INSERT or UPDATE
          const newLog = payload.new?.console_log || '';
          if (newLog) {
            setLines(newLog.split('\n'));
          }
        }
      )
      .subscribe((status) => {
        console.log('Subscription status:', status);
        setConnected(status === 'SUBSCRIBED');
        setStatus(status === 'SUBSCRIBED' ? 'Live' : status);
      });

    return () => {
      console.log('Cleaning up subscription');
      supabase.removeChannel(channel);
    };
  }, [server?.id, paused]);

  // Auto-scroll to bottom when new lines are added
  useEffect(() => {
    if (autoScroll && logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [lines, autoScroll]);

  const sendCommand = async (e) => {
    e?.preventDefault();
    if (!command.trim()) return;
    
    try {
      setStatus('Sending...');
      const resp = await fetch('/api/servers/rcon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          serverId: server.id, 
          command: command.trim() 
        }),
      });
      
      const json = await resp.json();
      if (!resp.ok) throw new Error(json.error || 'Failed to send command');
      
      setStatus('Sent');
      if (json.response) {
        // Add command response to console
        setLines(prev => [...prev, `[rcon] ${json.response}`]);
      }
    } catch (err) {
      console.error('Command error:', err);
      setStatus(`Error: ${err.message}`);
    } finally {
      setCommand('');
      setTimeout(() => setStatus(connected ? 'Live' : 'Disconnected'), 2000);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow p-4">
      <div className="flex items-center justify-between mb-2">
        <div>
          <strong className="text-lg">{server?.name || 'Server Console'}</strong>
          <div className="text-sm text-gray-500">
            Status: {connected ? 'Live' : 'Disconnected'} — {status}
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <button 
            onClick={() => setAutoScroll(s => !s)} 
            className={`px-3 py-1 rounded text-sm ${
              autoScroll ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
            }`}
          >
            Auto-scroll: {autoScroll ? 'ON' : 'OFF'}
          </button>
          <button 
            onClick={() => setPaused(p => !p)} 
            className={`px-3 py-1 rounded text-sm ${
              paused ? 'bg-yellow-100 text-yellow-800' : 'bg-gray-100 text-gray-800'
            }`}
          >
            {paused ? 'Resume' : 'Pause'}
          </button>
          <button 
            onClick={() => setLines([])} 
            className="px-3 py-1 bg-red-100 text-red-800 rounded text-sm"
          >
            Clear
          </button>
        </div>
      </div>

      <div
        ref={logRef}
        style={{ 
          height: '400px', 
          overflowY: 'auto', 
          fontFamily: 'monospace', 
          whiteSpace: 'pre-wrap', 
          fontSize: '12px',
          lineHeight: '1.2'
        }}
        className="p-3 border rounded bg-black text-green-400"
      >
        {lines.length === 0 ? (
          <div className="text-gray-500 italic">
            {connected ? 'Waiting for logs...' : 'Connecting to console...'}
          </div>
        ) : (
          lines.map((line, index) => (
            <div key={index} className="console-line">
              {line}
            </div>
          ))
        )}
      </div>

      <form onSubmit={sendCommand} className="mt-3 flex gap-2">
        <input
          className="flex-1 px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder='Type a Minecraft command (e.g., "say hello", "list", "time set day")'
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          disabled={!connected}
        />
        <button 
          type="submit" 
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:bg-gray-400"
          disabled={!connected || !command.trim()}
        >
          Send
        </button>
      </form>
    </div>
  );
}