import { useEffect, useState, useRef } from 'react';

export default function ServerStatusIndicator({ server }) {
  const [status, setStatus] = useState(server.status || 'Unknown');
  const [cpu, setCpu] = useState(0);
  const [memory, setMemory] = useState(0);
  const [disk, setDisk] = useState(0);
  const [connected, setConnected] = useState(false);
  const [debug, setDebug] = useState('');
  const wsRef = useRef(null);

  useEffect(() => {
    if (!server?.ipv4) {
      setDebug('No IPv4 address available');
      return;
    }

    const connectToStatusServer = () => {
      const wsUrl = `wss://${server.subdomain}.spawnly.net:3006`;
      setDebug(`Connecting to: ${wsUrl}`);
      console.log('Connecting to status WebSocket:', wsUrl);
      
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setDebug('WebSocket connected successfully');
        console.log('Status WebSocket connected');
        setConnected(true);
      };

      ws.onmessage = async (event) => {
  try {
    const data = JSON.parse(event.data);
    if (data.type === 'status_update') {
      setStatus(data.status);
      setCpu(data.cpu || 0);
      setMemory(data.memory || 0);
      setDisk(data.disk || 0);

      // UPDATE SUPABASE WITH THE NEW STATUS
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
            disk: data.disk || 0
          })
        });

        const responseData = await response.json();
        
        if (!response.ok) {
          console.error('API failed:', response.status, responseData);
          throw new Error(responseData.error || `HTTP ${response.status}`);
        }

        console.log('API success:', responseData);
        
      } catch (apiError) {
        console.error('Error calling update-status API:', apiError.message);
        // You could add retry logic here
      }
    }
  } catch (error) {
    console.error('Error parsing status message:', error);
  }
};

      ws.onerror = (error) => {
        setDebug(`WebSocket error: ${error.message || 'Unknown error'}`);
        console.error('Status WebSocket error:', error);
        setConnected(false);
      };

      ws.onclose = (event) => {
        setDebug(`WebSocket closed: ${event.code} ${event.reason || 'No reason'}`);
        console.log('Status WebSocket disconnected', event.code, event.reason);
        setConnected(false);
        // Attempt to reconnect after a delay
        setTimeout(connectToStatusServer, 5000);
      };
    };

    connectToStatusServer();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [server.ipv4, server.id]);

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