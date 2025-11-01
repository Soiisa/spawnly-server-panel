// components/ConsoleViewer.js
import { useEffect, useRef, useState } from 'react';

export default function ConsoleViewer({ server }) {
  const logRef = useRef(null);
  const wsRef = useRef(null);
  const [lines, setLines] = useState([]);
  const [connected, setConnected] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [paused, setPaused] = useState(false);
  const [command, setCommand] = useState('');
  const [statusMsg, setStatusMsg] = useState('');
  const pausedRef = useRef(paused);
  const reconnectTimeoutRef = useRef(null);

  // Keep the ref updated with the current paused state
  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    if (!server || !server.id) return;

    const useEventSource = typeof window !== 'undefined' && window.EventSource;

    if (useEventSource) {
      // Use SSE (EventSource) via our proxy endpoint
      const url = `/sse/console/${server.id}`;
      setStatusMsg(`Connecting to console (EventSource) ...`);
      const es = new EventSource(url);
      wsRef.current = es; // reuse ref for cleanup purposes

      es.onopen = () => {
        setConnected(true);
        setLines([]);
        setStatusMsg('Connected (EventSource)');
      };

      es.onmessage = (ev) => {
        if (pausedRef.current) return;
        const text = String(ev.data || '');
        const newLines = text.split(/\r?\n/).filter(Boolean);
        if (newLines.length === 0) return;
        const processedLines = newLines.map(line => {
          const timestampMatch = line.match(/\[(\d{2}:\d{2}:\d{2})\]/);
          if (timestampMatch) {
            const timestampIndex = line.indexOf(timestampMatch[0]);
            return line.substring(timestampIndex);
          }
          return line;
        });
        setLines((prev) => prev.concat(processedLines));
      };

      es.onerror = (err) => {
        console.warn('Console EventSource error', err);
        setStatusMsg('EventSource error, attempting to reconnect...');
        setConnected(false);
        // browser EventSource will auto-reconnect; we simply show status
      };

      return () => {
        try { es.close(); } catch (e) {}
      };
    }

    // Fallback to existing WebSocket behavior if EventSource not available
    const connectToServer = () => {
      // Use the server's IP directly
      const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
      const wsUrl = `wss://${server.subdomain}-api.spawnly.net/console`;
      
      setStatusMsg(`Connecting to ${server.ipv4}:3002...`);
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        setLines([]); // Clear lines on connect to load server-provided history
        setStatusMsg(`Connected to ${server.ipv4}:3002`);
        // Clear any reconnect timeout
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
          reconnectTimeoutRef.current = null;
        }
      };

      ws.onmessage = (ev) => {
        // Use the ref instead of state to avoid dependency issues
        if (pausedRef.current) return;
        
        const text = String(ev.data || '');
        const newLines = text.split(/\r?\n/).filter(Boolean);
        if (newLines.length === 0) return;
        
        // Process each line to remove system log prefix if present
        const processedLines = newLines.map(line => {
          const timestampMatch = line.match(/\[(\d{2}:\d{2}:\d{2})\]/);
          if (timestampMatch) {
            const timestampIndex = line.indexOf(timestampMatch[0]);
            return line.substring(timestampIndex);
          }
          return line;
        });

        setLines((prev) => prev.concat(processedLines));
      };

      ws.onerror = (err) => {
        console.warn('Console WS error', err);
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

  // Auto-scroll effect
  useEffect(() => {
    if (!autoScroll || !logRef.current) return;
    logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [lines, autoScroll]);

  const clearLogs = () => {
    setLines([]);
  };

  const sendCommand = async (e) => {
    e?.preventDefault();
    if (!command.trim()) return;
    try {
      setStatusMsg('Sending command...');
      const resp = await fetch('/api/servers/rcon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serverId: server.id, command: command.trim() }),
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        setStatusMsg(`Command error: ${json.error || resp.statusText}`);
      } else {
        setStatusMsg('Command sent');
        if (json.response) {
          setLines((prev) => prev.concat(`[rcon] ${json.response}`));
        }
      }
    } catch (err) {
      setStatusMsg('Command failed: ' + (err.message || err));
    } finally {
      setCommand('');
      setTimeout(() => setStatusMsg(''), 2500);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow p-4">
      <div className="flex items-center justify-between mb-2">
        <div>
          <strong className="text-lg">{server?.name || 'Server Console'}</strong>
          <div className="text-sm text-gray-500">
            {connected ? 'Live' : 'Disconnected'} — {statusMsg}
            {server?.ipv4 && <span> (Direct to {server.ipv4}:3002)</span>}
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <button onClick={() => setAutoScroll((s) => !s)} className="px-2 py-1 bg-gray-100 rounded">
            {autoScroll ? 'Auto-scroll ON' : 'Auto-scroll OFF'}
          </button>
          <button onClick={() => setPaused((p) => !p)} className="px-2 py-1 bg-gray-100 rounded">
            {paused ? 'Resume' : 'Pause'}
          </button>
          <button onClick={clearLogs} className="px-2 py-1 bg-gray-100 rounded">Clear</button>
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

      <div className="text-xs text-gray-500 mt-2">
        Note: Console logs are now managed server-side and loaded on connection.
      </div>
    </div>
  );
}