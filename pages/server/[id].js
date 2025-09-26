// pages/server/[id].js
/* eslint-disable react-hooks/exhaustive-deps */
import { useRouter } from 'next/router';
import { supabase } from '../../lib/supabaseClient';
import { useState, useEffect, useRef } from 'react';
import ServerSoftwareTab from '../../components/ServerSoftwareTab';
import ModsPluginsTab from '../../components/ModsPluginsTab';
import ConsoleViewer from '../../components/ConsoleViewer';
import ServerPropertiesEditor from '../../components/ServerPropertiesEditor';
import ServerMetrics from '../../components/MetricsViewer';
import FileManager from '../../components/FileManager';
import ServerStatusIndicator from '../../components/ServerStatusIndicator';
import Header from '../../components/ServersHeader';
import Footer from '../../components/ServersFooter';
import PlayersTab from '../../components/PlayersTab';

export default function ServerDetailPage({ initialServer }) {
  const router = useRouter();
  const { id } = router.query;

  const [server, setServer] = useState(initialServer);
  const [loading, setLoading] = useState(!initialServer);
  const [activeTab, setActiveTab] = useState('overview');
  const [user, setUser] = useState(null);
  const [credits, setCredits] = useState(0);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState(null);
  const [fileToken, setFileToken] = useState(null);
  const [liveMetrics, setLiveMetrics] = useState({ cpu: 0, memory: 0, disk: 0 });
  const [editingRam, setEditingRam] = useState(false);
  const [newRam, setNewRam] = useState(null);

  // Realtime channel refs
  const serverChannelRef = useRef(null);
  const profileChannelRef = useRef(null);
  const mountedRef = useRef(false);
  const metricsWsRef = useRef(null);
  const pollRef = useRef(null);

  // Handle tab query param
  useEffect(() => {
    const qTab = router?.query?.tab;
    if (qTab && typeof qTab === "string") {
      setActiveTab(qTab);
    }
  }, [router?.query?.tab]);

  // Fetch session and initial server data
  useEffect(() => {
    mountedRef.current = true;

    const fetchSessionAndServer = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const session = data?.session;
        if (!session) {
          router.push('/login');
          return;
        }
        setUser(session.user);
        await fetchUserCredits(session.user.id);
        if (id) await fetchServer(id, session.user.id);
      } catch (err) {
        console.error('Session fetch error:', err);
        router.push('/login');
      }
    };

    if (id && !server) fetchSessionAndServer();

    // Fetch file token for file access
    if (server?.id && !fileToken) {
      const fetchFileToken = async (retries = 3, delay = 1000) => {
        for (let attempt = 1; attempt <= retries; attempt++) {
          try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
              console.error('No session found for file token fetch');
              router.push('/login');
              return;
            }
            const response = await fetch(`/api/servers/get-token?serverId=${server.id}`, {
              headers: {
                Authorization: `Bearer ${session.access_token}`,
              },
            });
            const data = await response.json();
            if (response.ok && data.token && mountedRef.current) {
              setFileToken(data.token);
              setError(null);
            } else {
              console.error('Failed to fetch file token:', data.error || 'No token returned');
              if (attempt === retries) {
                setError('Failed to fetch file access token after multiple attempts');
              }
            }
          } catch (err) {
            console.error(`Failed to fetch file token (attempt ${attempt}/${retries}):`, err.message);
            if (attempt === retries) {
              setError('Failed to fetch file access token: ' + err.message);
            }
            await new Promise((resolve) => setTimeout(resolve, delay));
          }
        }
      };
      fetchFileToken();
    }

    // Connect to metrics WebSocket if server is running
    if (server?.status === 'Running' && server?.ipv4) {
      connectToMetricsWebSocket();
    }

    return () => {
      mountedRef.current = false;
      try {
        if (serverChannelRef.current) {
          supabase.removeChannel(serverChannelRef.current);
          serverChannelRef.current = null;
        }
        if (profileChannelRef.current) {
          supabase.removeChannel(profileChannelRef.current);
          profileChannelRef.current = null;
        }
        if (metricsWsRef.current) {
          metricsWsRef.current.close();
          metricsWsRef.current = null;
        }
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      } catch (e) {
        // ignore
      }
    };
  }, [id, server?.id, server?.status, server?.ipv4]);

  // Dedicated effect for Supabase server subscription
  useEffect(() => {
    if (!id || !user?.id) return;

    const subscribeToServer = async () => {
      try {
        if (serverChannelRef.current) {
          await supabase.removeChannel(serverChannelRef.current);
          serverChannelRef.current = null;
        }

        const channel = supabase
          .channel(`server-${id}`)
          .on(
            'postgres_changes',
            { event: 'UPDATE', schema: 'public', table: 'servers', filter: `id=eq.${id}` },
            (payload) => {
              if (!mountedRef.current) return;
              console.log('Realtime server update:', payload);
              const newRow = payload.new;
              setServer(newRow);

              // Trigger immediate fetch on key status changes
              if (['Running', 'Stopped', 'Initializing'].includes(newRow.status)) {
                fetchServer(id, user?.id);
              }

              // Reconnect metrics WebSocket if needed
              if (newRow.status === 'Running' && newRow.ipv4 && (!metricsWsRef.current || metricsWsRef.current.readyState !== WebSocket.OPEN)) {
                connectToMetricsWebSocket();
              }
            }
          )
          .subscribe((status, err) => {
            if (status === 'SUBSCRIBED') {
              console.log('Subscribed to server updates:', id);
            } else if (err) {
              console.error('Subscription error:', err);
              setError('Failed to subscribe to server updates. Retrying...');
              // Retry subscription
              setTimeout(subscribeToServer, 5000);
            }
          });

        serverChannelRef.current = channel;
      } catch (subErr) {
        console.error('Realtime subscription failed:', subErr);
        setError('Failed to set up server updates. Please refresh.');
      }
    };

    subscribeToServer();

    return () => {
      if (serverChannelRef.current) {
        supabase.removeChannel(serverChannelRef.current);
        serverChannelRef.current = null;
      }
    };
  }, [id, user?.id]);

  // Polling during transitional states
  useEffect(() => {
    if (!server?.status || !['Starting', 'Stopping', 'Restarting', 'Initializing'].includes(server.status)) {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      return;
    }

    pollRef.current = setInterval(() => {
      console.log(`Polling server status: ${server.status}`);
      fetchServer(id, user?.id);
    }, 1000); // Increased frequency to 1 second

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [server?.status, id, user?.id]);

  // Profile subscription for credits
  useEffect(() => {
    if (!user?.id) return;

    const profileChannel = supabase
      .channel(`user-profile-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
          filter: `id=eq.${user.id}`,
        },
        (payload) => {
          if (!mountedRef.current) return;
          console.log('Profile updated, new credits:', payload.new.credits);
          setCredits(payload.new.credits || 0);
        }
      )
      .subscribe();

    profileChannelRef.current = profileChannel;

    return () => {
      if (profileChannelRef.current) {
        supabase.removeChannel(profileChannelRef.current);
        profileChannelRef.current = null;
      }
    };
  }, [user?.id]);

  const fetchUserCredits = async (userId) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('credits')
        .eq('id', userId)
        .single();

      if (error) {
        console.error('Error fetching credits:', error.message);
        setError('Failed to load credits. Please try again.');
        return;
      }

      if (data) {
        console.log('Fetched credits:', data.credits);
        setCredits(data.credits || 0);
      } else {
        console.warn('No profile data found for user:', userId);
        setError('No profile found. Please contact support.');
      }
    } catch (err) {
      console.error('Unexpected error fetching credits:', err.message);
      setError('Unexpected error loading credits.');
    }
  };

  const connectToMetricsWebSocket = () => {
    if (!server?.ipv4 || metricsWsRef.current) return;

    try {
      const wsUrl = `wss://${server.subdomain}.spawnly.net:3006`;
      console.log('Connecting to metrics WebSocket:', wsUrl);

      const ws = new WebSocket(wsUrl);
      metricsWsRef.current = ws;

      ws.onopen = () => {
        console.log('Metrics WebSocket connected');
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (mountedRef.current) {
            setLiveMetrics({
              cpu: data.cpu || 0,
              memory: data.ram || 0,
              disk: data.disk || 0,
            });
          }
        } catch (error) {
          console.error('Error parsing metrics message:', error);
        }
      };

      ws.onerror = (error) => {
        console.error('Metrics WebSocket error:', error);
      };

      ws.onclose = () => {
        console.log('Metrics WebSocket disconnected');
        metricsWsRef.current = null;
        if (mountedRef.current && server?.status === 'Running') {
          setTimeout(connectToMetricsWebSocket, 5000);
        }
      };
    } catch (error) {
      console.error('Failed to connect to metrics WebSocket:', error);
    }
  };

  // Safe fetch helper
  const safeFetchJson = async (url, opts = {}) => {
    try {
      const res = await fetch(url, opts);
      const text = await res.text().catch(() => '');
      let json = {};
      try {
        json = text ? JSON.parse(text) : {};
      } catch (e) {
        json = { _raw: text };
      }
      if (!res.ok) {
        const errMsg = json?.error || json?.detail || json?._raw || `HTTP ${res.status}`;
        const e = new Error(errMsg);
        e.status = res.status;
        e.body = json;
        throw e;
      }
      return json;
    } catch (err) {
      console.error(`Error fetching ${url}:`, err);
      throw err;
    }
  };

  // Fetch server data
  const fetchServer = async (serverIdParam, userIdParam) => {
    setLoading(true);
    try {
      const serverId = serverIdParam || id;
      const userId = userIdParam || user?.id;
      if (!serverId || !userId) {
        return;
      }

      const { data, error } = await supabase
        .from('servers')
        .select('*')
        .eq('id', serverId)
        .eq('user_id', userId)
        .single();

      if (error || !data) {
        console.error('Server not found:', error);
        router.push('/dashboard');
        return;
      }

      if (mountedRef.current) {
        console.log('Fetched server data:', data);
        setServer(data);
      }
    } catch (err) {
      console.error('Fetch server error:', err);
      setError('Failed to fetch server data. Please try again.');
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  };

  const pollUntilStatus = (expectedStatuses, timeout = 60000) => {
    const startTime = Date.now();
    pollRef.current = setInterval(() => {
      fetchServer(id, user?.id);
      if (expectedStatuses.includes(server.status) || Date.now() - startTime > timeout) {
        clearInterval(pollRef.current);
        pollRef.current = null;
        if (Date.now() - startTime > timeout) {
          setError('Operation timed out. Please refresh the page.');
          router.reload();
        }
      }
    }, 1000);
  };

  // Handle software change
  const handleSoftwareChange = (newConfig) => {
    setServer((prev) => ({ ...prev, ...newConfig }));
  };

  // Handle server start
  const handleStartServer = async () => {
    if (actionLoading) return;
    try {
      setActionLoading(true);
      setError(null);

      const serverId = server?.id || id;
      if (!serverId) {
        alert('Server not loaded yet.');
        return;
      }

      setServer((prev) => (prev ? { ...prev, status: 'Starting' } : prev));

      const { data: serverData, error: serverError } = await supabase
        .from('servers')
        .select('type, version, pending_type, pending_version')
        .eq('id', serverId)
        .single();

      if (serverError) throw serverError;

      const { data: installedSoftware, error: softwareError } = await supabase
        .from('installed_software')
        .select('name, type, version, source, download_url')
        .eq('server_id', serverId);

      if (softwareError) throw softwareError;

      console.log('Provisioning with config:', {
        type: serverData.pending_type || serverData.type,
        version: serverData.pending_version || serverData.version,
        installedSoftware,
      });

      const provisionRes = await safeFetchJson('/api/servers/provision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serverId,
          type: serverData.pending_type || serverData.type,
          version: serverData.pending_version || serverData.version,
          installedSoftware,
        }),
      });

      console.log('Provision response:', provisionRes);

      // Clear pending fields
      if (serverData.pending_type || serverData.pending_version) {
        await supabase
          .from('servers')
          .update({ pending_type: null, pending_version: null, needs_recreation: false })
          .eq('id', serverId);
      }

      // Start polling until 'Running'
      pollUntilStatus(['Running', 'Initializing']);

      // Immediate fetch and schedule another after 2 seconds
      await fetchServer(serverId, user?.id);
      setTimeout(() => {
        fetchServer(serverId, user?.id);
      }, 2000);

      // Fallback reload after 10 seconds if still transitional
      setTimeout(() => {
        if (['Starting', 'Initializing'].includes(server?.status) && mountedRef.current) {
          console.warn('Server still transitional, forcing page reload');
          router.reload();
        }
      }, 10000);
    } catch (err) {
      console.error('Start error:', err);
      setError(`Failed to start server: ${err.message}`);
      alert(`Failed to start server: ${err.message}`);
      await fetchServer(server?.id || id, user?.id);
    } finally {
      setActionLoading(false);
    }
  };

  // Handle server stop
  const handleStopServer = async () => {
    if (actionLoading) return;
    try {
      setActionLoading(true);
      setError(null);

      const serverId = server?.id || id;
      if (!serverId) {
        alert('Server not loaded yet.');
        return;
      }

      if (!server?.hetzner_id) {
        alert('Server is stopped.');
        return;
      }

      setServer((prev) => (prev ? { ...prev, status: 'Stopping' } : prev));

      const json = await safeFetchJson('/api/servers/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serverId, action: 'stop' }),
      });

      console.log('Stop API response:', json);

      // Start polling until 'Stopped'
      pollUntilStatus(['Stopped']);

      await fetchServer(serverId, user?.id);
      setTimeout(() => {
        fetchServer(serverId, user?.id);
      }, 2000);

      // Fallback reload
      setTimeout(() => {
        if (server?.status === 'Stopping' && mountedRef.current) {
          console.warn('Server still Stopping, forcing page reload');
          router.reload();
        }
      }, 10000);
    } catch (err) {
      console.error('Stop error:', err);
      setError(`Failed to stop server: ${err.message}`);
      alert(`Failed to stop server: ${err.message}`);
      await fetchServer(server?.id || id, user?.id);
    } finally {
      setActionLoading(false);
    }
  };

  // Handle server restart
  const handleRestartServer = async () => {
    if (actionLoading) return;
    try {
      setActionLoading(true);
      setError(null);

      const serverId = server?.id || id;
      if (!serverId) {
        alert('Server not loaded yet.');
        return;
      }

      if (!server?.hetzner_id) {
        alert('Server is stopped.');
        return;
      }

      setServer((prev) => (prev ? { ...prev, status: 'Restarting' } : prev));

      const json = await safeFetchJson('/api/servers/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serverId, action: 'restart' }),
      });

      console.log('Restart API response:', json);

      // Start polling until 'Running'
      pollUntilStatus(['Running']);

      await fetchServer(serverId, user?.id);
      setTimeout(() => {
        fetchServer(serverId, user?.id);
      }, 2000);

      // Fallback reload
      setTimeout(() => {
        if (server?.status === 'Restarting' && mountedRef.current) {
          console.warn('Server still Restarting, forcing page reload');
          router.reload();
        }
      }, 10000);
    } catch (err) {
      console.error('Restart error:', err);
      setError(`Failed to restart server: ${err.message}`);
      alert(`Failed to restart server: ${err.message}`);
      await fetchServer(server?.id || id, user?.id);
    } finally {
      setActionLoading(false);
    }
  };

  // Manual status refresh
  const refreshServerStatus = async () => {
    if (!server?.id || !user?.id) return;

    try {
      await fetchServer(server.id, user.id);
    } catch (err) {
      console.error('Failed to refresh server status:', err);
      setError('Failed to refresh server status');
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  const startEditingRam = () => {
    setNewRam(server.ram);
    setEditingRam(true);
  };

  const handleSaveRam = async () => {
    if (server.status !== 'Stopped') {
      setError('Server must be stopped to change RAM.');
      return;
    }

    if (newRam < 2 || newRam > 32 || !Number.isInteger(newRam)) {
      setError('RAM must be an integer between 2 and 32 GB.');
      return;
    }

    try {
      setActionLoading(true);
      setError(null);

      const { error: updateError } = await supabase
        .from('servers')
        .update({ ram: newRam })
        .eq('id', server.id);

      if (updateError) throw updateError;

      setServer((prev) => ({ ...prev, ram: newRam }));
      setEditingRam(false);
      await fetchServer(server.id);
    } catch (err) {
      console.error('RAM update error:', err);
      setError(`Failed to update RAM: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  /* ---------- RENDER ---------- */

  if (loading) return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center">
      <div>
        <div className="animate-spin h-10 w-10 border-4 rounded-full border-indigo-600 border-b-transparent mx-auto"></div>
        <p className="mt-3 text-center text-gray-600">Loading server details...</p>
      </div>
    </div>
  );

  if (!server) {
    return (
      <div className="p-6">
        <p>Server not found or you don't have access.</p>
      </div>
    );
  }

  const status = server.status || 'Unknown';
  const canStart = status === 'Stopped' && !actionLoading;
  const canStop = status === 'Running' && !actionLoading;
  const canRestart = status === 'Running' && !actionLoading;

  // Define software types for mods and plugins
  const moddedTypes = ['forge', 'fabric', 'quilt', 'neoforge'].map(t => t.toLowerCase());
  const pluginTypes = ['bukkit', 'spigot', 'paper', 'purpur'].map(t => t.toLowerCase());

  const serverType = server.type ? server.type.toLowerCase() : '';
  const isModded = moddedTypes.includes(serverType);
  const isPlugin = pluginTypes.includes(serverType);
  const showModsPluginsTab = isModded || isPlugin;
  const modsPluginsLabel = isModded ? 'Mods' : 'Plugins';

  return (
    <div className="min-h-screen bg-gray-100" key={server.status}>
      <Header user={user} credits={credits} onLogout={handleLogout} />
      
      <main className="p-4 md:p-8">
        <div className="max-w-6xl mx-auto bg-white rounded-lg shadow-lg p-6">
          {error && (
            <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-md border border-red-200">
              {error}
              <button 
                onClick={() => setError(null)} 
                className="float-right text-red-800 font-bold"
              >
                ×
              </button>
            </div>
          )}
          
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-800">{server.name}</h1>
              <div className="mt-2 flex flex-wrap gap-4 text-sm text-gray-600">
                <span className="flex items-center"><svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" /></svg> Game: {server.game}</span>
                <span className="flex items-center"><svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" /></svg> Software: {server.type}</span>
                <span className="flex items-center"><svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h12a2 2 0 002-2V7a2 2 0 00-2-2h-2M8 5V3a2 2 0 012-2h4a2 2 0 012 2v2M8 5h8" /></svg> RAM: {server.ram} GB</span>
              </div>
            </div>

            <div className="space-x-2" key={status}>
              <button
                onClick={refreshServerStatus}
                className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-3 py-2 rounded text-sm transition-colors"
              >
                Refresh Status
              </button>

              {status === 'Stopped' && (
                <button
                  onClick={handleStartServer}
                  disabled={!canStart}
                  className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded disabled:opacity-50 transition-colors"
                >
                  {actionLoading ? 'Starting...' : 'Start Server'}
                </button>
              )}

              {status === 'Running' && (
                <>
                  <button
                    onClick={handleStopServer}
                    disabled={!canStop}
                    className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded disabled:opacity-50 transition-colors"
                  >
                    {actionLoading ? 'Stopping...' : 'Stop Server'}
                  </button>
                  <button
                    onClick={handleRestartServer}
                    disabled={!canRestart}
                    className="bg-yellow-600 hover:bg-yellow-700 text-white px-4 py-2 rounded disabled:opacity-50 transition-colors ml-2"
                  >
                    {actionLoading ? 'Restarting...' : 'Restart Server'}
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="mt-6">
            <div className="mb-4">
              <span className="text-sm text-gray-600">Status: </span>
              <ServerStatusIndicator server={server} />
              {server.last_status_update && (
                <span className="ml-3 text-xs text-gray-500">
                  Last update: {new Date(server.last_status_update).toLocaleString()}
                </span>
              )}
            </div>

            <div className="border-b border-gray-200">
              <nav className="-mb-px flex space-x-4">
                <button onClick={() => setActiveTab('overview')} className={`py-2 px-3 text-sm font-medium ${activeTab === 'overview' ? 'border-b-2 border-indigo-500 text-indigo-600' : 'text-gray-600 hover:text-indigo-600'}`}>Overview</button>
                <button onClick={() => setActiveTab('software')} className={`py-2 px-3 text-sm font-medium ${activeTab === 'software' ? 'border-b-2 border-indigo-500 text-indigo-600' : 'text-gray-600 hover:text-indigo-600'}`}>Software</button>
                {showModsPluginsTab && (
                  <button onClick={() => setActiveTab('mods')} className={`py-2 px-3 text-sm font-medium ${activeTab === 'mods' ? 'border-b-2 border-indigo-500 text-indigo-600' : 'text-gray-600 hover:text-indigo-600'}`}>{modsPluginsLabel}</button>
                )}
                <button onClick={() => setActiveTab('files')} className={`py-2 px-3 text-sm font-medium ${activeTab === 'files' ? 'border-b-2 border-indigo-500 text-indigo-600' : 'text-gray-600 hover:text-indigo-600'}`}>Files</button>
                <button onClick={() => setActiveTab('console')} className={`py-2 px-3 text-sm font-medium ${activeTab === 'console' ? 'border-b-2 border-indigo-500 text-indigo-600' : 'text-gray-600 hover:text-indigo-600'}`}>Console</button>
                <button onClick={() => setActiveTab('properties')} className={`py-2 px-3 text-sm font-medium ${activeTab === 'properties' ? 'border-b-2 border-indigo-500 text-indigo-600' : 'text-gray-600 hover:text-indigo-600'}`}>Properties</button>
                <button onClick={() => setActiveTab('players')} className={`py-2 px-3 text-sm font-medium ${activeTab === 'players' ? 'border-b-2 border-indigo-500 text-indigo-600' : 'text-gray-600 hover:text-indigo-600'}`}>Players</button>
              </nav>
            </div>

            <div className="mt-6">
              {activeTab === 'overview' && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="bg-white p-6 rounded-lg shadow-md hover:shadow-lg transition-shadow duration-200 border border-gray-100">
                    <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
                      <svg className="w-5 h-5 mr-2 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" /></svg>
                      Server Information
                    </h3>
                    <p className="text-sm text-gray-600 mb-2"><strong className="font-medium text-gray-800">IP:</strong> {server.name + ".spawnly.net" || '—'}</p>
                    <p className="text-sm text-gray-600 mb-2"><strong className="font-medium text-gray-800">Software:</strong> {server.type || '—'}</p>
                    <p className="text-sm text-gray-600 mb-2"><strong className="font-medium text-gray-800">Version:</strong> {server.version || '—'}</p>
                    <p className="text-sm text-gray-600"><strong className="font-medium text-gray-800">Game:</strong> {server.game || '—'}</p>
                  </div>
                  
                  <div className="bg-white p-6 rounded-lg shadow-md hover:shadow-lg transition-shadow duration-200 border border-gray-100">
                    <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
                      <svg className="w-5 h-5 mr-2 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                      Billing
                    </h3>
                    <p className="text-sm text-gray-600 mb-2"><strong className="font-medium text-gray-800">Cost / hr:</strong> {server.cost_per_hour ? `$${server.cost_per_hour}` : '—'}</p>
                    <div className="text-sm text-gray-600 mb-2 flex items-center">
                      <strong className="font-medium text-gray-800 mr-2">RAM:</strong>
                      {editingRam ? (
                        <>
                          <input
                            type="number"
                            value={newRam}
                            onChange={(e) => setNewRam(parseInt(e.target.value, 10))}
                            className="w-20 border border-gray-300 rounded px-2 py-1 mr-2"
                            min="2"
                            max="32"
                            step="1"
                          />
                          GB
                          <button
                            onClick={handleSaveRam}
                            disabled={actionLoading}
                            className="ml-2 bg-green-500 hover:bg-green-600 text-white px-2 py-1 rounded text-xs"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => setEditingRam(false)}
                            className="ml-1 bg-gray-300 hover:bg-gray-400 text-gray-800 px-2 py-1 rounded text-xs"
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          {server.ram} GB
                          {status === 'Stopped' && (
                            <button
                              onClick={startEditingRam}
                              className="ml-2 text-indigo-600 hover:text-indigo-800 text-xs"
                            >
                              Edit
                            </button>
                          )}
                        </>
                      )}
                    </div>
                    <p className="text-sm text-gray-600"><strong className="font-medium text-gray-800">Created:</strong> {server.created_at ? new Date(server.created_at).toLocaleString() : '—'}</p>
                  </div>

                  <div className="bg-white p-6 rounded-lg shadow-md hover:shadow-lg transition-shadow duration-200 border border-gray-100">
                    <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
                      <svg className="w-5 h-5 mr-2 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2M9 19a2 2 0 01-2-2" /></svg>
                      Live Metrics
                    </h3>
                    <ServerMetrics server={server} />
                  </div>
                </div>
              )}

              {activeTab === 'software' && (
                <ServerSoftwareTab server={server} onSoftwareChange={handleSoftwareChange} />
              )}

              {activeTab === 'mods' && <ModsPluginsTab server={server} />}

              {activeTab === 'files' && (
                <div className="bg-white p-4 rounded shadow">
                  {fileToken ? (
                    <FileManager server={server} token={fileToken} setActiveTab={setActiveTab} />
                  ) : (
                    <p className="text-gray-600">Loading file access token...</p>
                  )}
                </div>
              )}

              {activeTab === 'console' && (
                <div className="mt-4">
                  <ConsoleViewer server={server} />
                </div>
              )}

              {activeTab === 'properties' && (
                <div className="mt-4">
                  <ServerPropertiesEditor server={server} />
                </div>
              )}

              {activeTab === 'players' && (
                <div className="mt-4">
                  {fileToken ? (
                    <PlayersTab server={server} token={fileToken} />
                  ) : (
                    <p className="text-gray-600">Loading file access token...</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}

export async function getServerSideProps(context) {
  const { id } = context.params || {};

  if (!id) {
    return { notFound: true };
  }

  try {
    const { createClient } = require('@supabase/supabase-js');
    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return { props: { initialServer: null } };
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data, error } = await supabaseAdmin
      .from('servers')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) {
      return { notFound: true };
    }

    return { props: { initialServer: data } };
  } catch (err) {
    console.error('getServerSideProps error:', err);
    return { props: { initialServer: null } };
  }
}