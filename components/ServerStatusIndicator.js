import { useEffect, useState, useRef } from 'react';

export default function ServerStatusIndicator({ server }) {
  const [status, setStatus] = useState(server.status || 'Unknown');
  const [cpu, setCpu] = useState(0);
  const [memory, setMemory] = useState(0);
  const [disk, setDisk] = useState(0);
  const [connected, setConnected] = useState(false);
  const [debug, setDebug] = useState('');
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);

  useEffect(() => {
    if (!server?.ipv4) {
      setDebug('No IPv4 address available');
      setStatus(server.status || 'Stopped');
      return;
    }

    const connectToStatusServer = () => {
      // Prefer subdomain if available, fallback to ipv4
      const wsUrl = server.subdomain
        ? `wss://${server.subdomain}.spawnly.net/ws/status`
        : `wss://${server.ipv4}:3006`;
      setDebug(`Connecting to: ${wsUrl}`);
      console.log('Connecting to status WebSocket:', wsUrl);

      try {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          setDebug('WebSocket connected successfully');
          console.log('Status WebSocket connected');
          setConnected(true);
          if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
            reconnectTimeoutRef.current = null;
          }
        };

        ws.onmessage = async (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === 'status_update') {
              setStatus(data.status);
              setCpu(data.cpu || 0);
              setMemory(data.memory || 0);
              setDisk(data.disk || 0);

              // Update Supabase
              try {
                console.log('Calling update-status API for server:', server.id);
                const response = await fetch('/api/servers/update-status', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    serverId: server.id,
                    status: data.status,
                    cpu: data.cpu || 0,
                    memory: data.memory || 0,
                    disk: data.disk || 0,
                  }),
                });

                if (!response.ok) {
                  const responseData = await response.json();
                  console.error('API failed:', response.status, responseData);
                  setDebug(`API error: ${responseData.error || response.status}`);
                } else {
                  console.log('API success:', await response.json());
                }
              } catch (apiError) {
                console.error('Error calling update-status API:', apiError.message);
                setDebug(`API error: ${apiError.message}`);
              }
            }
          } catch (error) {
            console.error('Error parsing status message:', error);
            setDebug(`Message parse error: ${error.message}`);
          }
        };

        ws.onerror = (error) => {
          setDebug('WebSocket error occurred');
          console.error('Status WebSocket error:', error);
          setConnected(false);
        };

        ws.onclose = (event) => {
          setDebug(`WebSocket closed: ${event.code} ${event.reason || 'No reason'}`);
          console.log('Status WebSocket disconnected', event.code, event.reason);
          setConnected(false);
          // Reconnect after a delay
          if (!reconnectTimeoutRef.current) {
            reconnectTimeoutRef.current = setTimeout(() => {
              reconnectTimeoutRef.current = null;
              connectToStatusServer();
            }, 5000);
          }
        };
      } catch (err) {
        console.error('Failed to create WebSocket:', err);
        setDebug(`WebSocket initialization failed: ${err.message}`);
        setConnected(false);
      }
    };

    connectToStatusServer();

    return () => {
      if (wsRef.current) {
        try {
          wsRef.current.close();
        } catch (e) {
          console.warn('Error closing WebSocket:', e);
        }
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };
  }, [server?.ipv4, server?.subdomain, server?.id]);

  if (!server?.ipv4) {
    return (
      <span className="bg-gray-100 text-gray-800 text-xs px-2 py-1 rounded">
        Stopped
      </span>
    );
  }

  return (
    <div className="flex items-center">
      <span
        className={`text-xs px-2 py-1 rounded mr-2 ${
          status === 'Running'
            ? 'bg-green-100 text-green-800'
            : status === 'Starting' || status === 'Stopping' || status === 'Initializing'
            ? 'bg-yellow-100 text-yellow-800'
            : 'bg-gray-100 text-gray-800'
        }`}
      >
        {status}
        {!connected && status !== 'Stopped' && ' (Disconnected)'}
      </span>
      {process.env.NODE_ENV === 'development' && (
        <span className="text-xs text-gray-500">{debug}</span>
      )}
    </div>
  );
}