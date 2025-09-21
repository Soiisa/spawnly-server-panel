// components/ConsoleViewer.js
import { useEffect, useRef, useState } from 'react';

export default function ConsoleViewer({ server }) {
  const logRef = useRef(null);
  const esRef = useRef(null);
  const [lines, setLines] = useState([]);
  const [connected, setConnected] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [paused, setPaused] = useState(false);
  const [command, setCommand] = useState('');
  const [statusMsg, setStatusMsg] = useState('');
  const pausedRef = useRef(paused);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    if (!server || !server.ipv4) {
      setStatusMsg('No server IP available');
      return;
    }

    const connectToServer = () => {
      const es = new EventSource(`http://${server.ipv4}:3002/console`);
      esRef.current = es;

      es.onopen = () => {
        setConnected(true);
        setLines([]); // Clear lines on connect
        setStatusMsg(`Connected to ${server.ipv4}:3002`);
      };

      es.onmessage = (e) => {
        if (pausedRef.current) return;

        const text = String(e.data || '');
        if (!text.trim()) return;

        const newLines = text.split(/\r?\n/).filter(Boolean);

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
        console.warn('Console SSE error:', err);
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