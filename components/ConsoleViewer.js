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
  const [status, setStatus] = useState('Connecting...');
  const pausedRef = useRef(paused);

  // Keep ref in sync
  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  // === CONNECTION LOGIC ===
  useEffect(() => {
    if (!server?.id) return;

    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${location.host}/ws/console/${server.id}`;
    let source = null;

    const connect = () => {
      setStatus('Connecting...');

      // Prefer WebSocket
      if (typeof WebSocket !== 'undefined') {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;
        setupWebSocket(ws);
      } else {
        // Fallback to SSE
        const es = new EventSource(`/sse/console/${server.id}`);
        wsRef.current = es;
        es.onmessage = (e) => {
          try {
            const msg = JSON.parse(e.data);
            if (msg.type === 'log') handleLine(msg.line);
          } catch {}
        };
        es.onerror = () => {
          setStatus('SSE error, retrying...');
          setTimeout(() => es.close(), 2000);
        };
        es.onopen = () => setStatus('Connected via SSE');
      }
    };

    const setupWebSocket = (ws) => {
      ws.onopen = () => {
        setConnected(true);
        setLines([]);
        setStatus('Live');
      };

      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg.type === 'log') handleLine(msg.line);
        } catch (err) {
          console.warn('Invalid message:', ev.data);
        }
      };

      ws.onclose = () => {
        setConnected(false);
        setStatus('Reconnecting...');
        setTimeout(connect, 2500);
      };

      ws.onerror = () => {
        setStatus('Connection error');
      };
    };

    const handleLine = (line) => {
      if (pausedRef.current) return;
      setLines((prev) => [...prev, line]);
    };

    connect();

    return () => {
      if (wsRef.current instanceof WebSocket) {
        wsRef.current.close();
      } else if (wsRef.current instanceof EventSource) {
        wsRef.current.close();
      }
      wsRef.current = null;
    };
  }, [server?.id]);

  // === AUTO-SCROLL ===
  useEffect(() => {
    if (!autoScroll || !logRef.current) return;
    const el = logRef.current;
    el.scrollTop = el.scrollHeight;
  }, [lines, autoScroll]);

  // === SEND RCON COMMAND ===
  const sendCommand = async (e) => {
    e?.preventDefault();
    if (!command.trim()) return;

    const cmd = command.trim();
    setCommand('');
    setStatus('Sending command...');

    try {
      const resp = await fetch('/api/servers/rcon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serverId: server.id, command: cmd }),
      });

      const json = await resp.json().catch(() => ({}));

      if (!resp.ok) {
        setStatus(`Error: ${json.error || resp.statusText}`);
      } else {
        setStatus('Command sent');
        if (json.response) {
          setLines((prev) => [...prev, `[RCON →] ${cmd}`, `[RCON ←] ${json.response}`]);
        } else {
          setLines((prev) => [...prev, `[RCON] ${cmd}`]);
        }
      }
    } catch (err) {
      setStatus(`Failed: ${err.message}`);
    } finally {
      setTimeout(() => setStatus(connected ? 'Live' : 'Disconnected'), 2000);
    }
  };

  // === UI ===
  return (
    <div className="bg-white rounded-lg shadow p-4 max-w-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <strong className="text-lg">{server?.name || 'Server Console'}</strong>
          <div className="text-sm text-gray-500">
            {connected ? 'Live' : 'Disconnected'} — {status}
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setAutoScroll((s) => !s)}
            className="px-3 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded transition"
          >
            {autoScroll ? 'Auto ON' : 'Auto OFF'}
          </button>
          <button
            onClick={() => setPaused((p) => !p)}
            className="px-3 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded transition"
          >
            {paused ? 'Resume' : 'Pause'}
          </button>
          <button
            onClick={() => setLines([])}
            className="px-3 py-1 text-xs bg-red-100 hover:bg-red-200 text-red-700 rounded transition"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Log Display */}
      <div
        ref={logRef}
        className="h-96 overflow-y-auto p-3 bg-black text-green-400 font-mono text-xs leading-tight rounded border border-gray-300 whitespace-pre-wrap"
      >
        {lines.length === 0 ? (
          <div className="text-gray-500 italic">Waiting for logs...</div>
        ) : (
          lines.map((line, i) => (
            <div key={i} className="truncate">
              {line}
            </div>
          ))
        )}
      </div>

      {/* Command Input */}
      <form onSubmit={sendCommand} className="mt-3 flex gap-2">
        <input
          type="text"
          className="flex-1 px-3 py-2 border border-gray-300 rounded text-sm font-mono placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          placeholder='e.g. "say Hello players!"'
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          disabled={!connected}
        />
        <button
          type="submit"
          disabled={!connected || !command.trim()}
          className="px-4 py-2 bg-indigo-600 text-white rounded font-medium hover:bg-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition"
        >
          Send
        </button>
      </form>

      {/* Footer Note */}
      <div className="mt-2 text-xs text-gray-500">
        Logs are streamed live and persisted for instant reload.
      </div>
    </div>
  );
}