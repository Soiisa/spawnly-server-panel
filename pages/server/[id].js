/* eslint-disable react-hooks/exhaustive-deps */
import { useRouter } from 'next/router';
import { supabase } from '../../lib/supabaseClient';
import { useState, useEffect, useRef, useCallback } from 'react';
import { format } from 'date-fns';
import { Suspense } from 'react';
import { debounce, throttle } from 'lodash';
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
import WorldTab from '../../components/WorldTab';

export default function ServerDetailPage({ initialServer }) {
  const router = useRouter();
  const { id } = router.query;

  const [server, setServer] = useState(initialServer);
  const [loading, setLoading] = useState(!initialServer);
  const [activeTab, setActiveTab] = useState('overview');
  const [user, setUser] = useState(null);
  const [credits, setCredits] = useState(0);
  const [creditsLoading, setCreditsLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState(null);
  const [fileToken, setFileToken] = useState(null);
  const [liveMetrics, setLiveMetrics] = useState({ cpu: 0, memory: 0, disk: 0 });
  const [editingRam, setEditingRam] = useState(false);
  const [newRam, setNewRam] = useState(null);
  const [onlinePlayers, setOnlinePlayers] = useState([]);
  const hasReceivedRunningRef = useRef(false);

  const profileChannelRef = useRef(null);
  const mountedRef = useRef(false);
  const metricsWsRef = useRef(null);
  const pollRef = useRef(null);
  const onlinePlayersPollRef = useRef(null);

  const throttledSetLiveMetrics = useRef(
    throttle((newMetrics) => {
      setLiveMetrics((prev) => {
        if (
          prev.cpu === newMetrics.cpu &&
          prev.memory === newMetrics.memory &&
          prev.disk === newMetrics.disk
        ) {
          return prev;
        }
        return newMetrics;
      });
    }, 2000)
  ).current;

  useEffect(() => {
    console.log('Credits state updated:', credits);
  }, [credits]);

  useEffect(() => {
    const qTab = router?.query?.tab;
    if (qTab && typeof qTab === 'string') {
      setActiveTab(qTab);
    }
  }, [router?.query?.tab]);

  useEffect(() => {
    mountedRef.current = true;

    const fetchSessionAndData = async () => {
      setLoading(true);
      setCreditsLoading(true);
      try {
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (sessionError || !sessionData?.session) {
          console.error('Session fetch error:', sessionError || 'No session found');
          setError('Please log in to continue.');
          router.push('/login');
          return;
        }

        const userData = sessionData.session.user;
        setUser(userData);
        console.log('Fetched user:', userData);

        await fetchUserCredits(userData.id);

        if (id && !server) {
          await fetchServer(id, userData.id);
        }
      } catch (err) {
        console.error('Session and data fetch error:', err);
        setError('Failed to load session or server data. Redirecting to login...');
        router.push('/login');
      } finally {
        setLoading(false);
      }
    };

    fetchSessionAndData();

    return () => {
      mountedRef.current = false;
      cleanupResources();
    };
  }, [id]);

  useEffect(() => {
    if (!server?.id || fileToken || !user) return;

    const fetchFileToken = async (retries = 3, delay = 1000) => {
      for (let attempt = 1; attempt <= retries; attempt++) {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (!session) {
            console.error('No session found for file token fetch');
            setError('Session expired. Please log in again.');
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
            return;
          } else {
            console.error(`Failed to fetch file token (attempt ${attempt}/${retries}):`, data.error || 'No token returned');
            if (attempt === retries) {
              setError('Failed to fetch file access token after multiple attempts.');
            }
          }
        } catch (err) {
          console.error(`File token fetch error (attempt ${attempt}/${retries}):`, err.message);
          if (attempt === retries) {
            setError('Failed to fetch file access token: ' + err.message);
          }
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    };

    fetchFileToken();
  }, [server?.id, user]);

  useEffect(() => {
    if (server?.status === 'Running' && server?.ipv4) {
      if (!metricsWsRef.current) {
        connectToMetricsWebSocket();
      }
      if (!onlinePlayersPollRef.current) {
        fetchOnlinePlayers();
        onlinePlayersPollRef.current = setInterval(fetchOnlinePlayers, 30000);
      }
    }

    return () => {
      if (metricsWsRef.current) {
        metricsWsRef.current.close();
        metricsWsRef.current = null;
      }
      if (onlinePlayersPollRef.current) {
        clearInterval(onlinePlayersPollRef.current);
        onlinePlayersPollRef.current = null;
      }
    };
  }, [server?.status, server?.ipv4]);

  const cleanupResources = () => {
    try {
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
      if (onlinePlayersPollRef.current) {
        clearInterval(onlinePlayersPollRef.current);
        onlinePlayersPollRef.current = null;
      }
    } catch (e) {
      console.error('Cleanup error:', e);
    }
  };

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
          setCreditsLoading(false);
          setError(null);
        }
      )
      .subscribe((status, err) => {
        if (status === 'SUBSCRIBED') {
          console.log('Subscribed to profile updates for user:', user.id);
        } else if (err) {
          console.error('Profile subscription error:', err);
          setError('Failed to subscribe to profile updates. Retrying...');
          setTimeout(() => {
            if (mountedRef.current) {
              profileChannel.subscribe();
            }
          }, 15000);
        }
      });

    profileChannelRef.current = profileChannel;

    return () => {
      if (profileChannelRef.current) {
        supabase.removeChannel(profileChannelRef.current);
        profileChannelRef.current = null;
      }
    };
  }, [user?.id]);

  const fetchUserCredits = async (userId, retries = 3, delay = 1000) => {
    setCreditsLoading(true);
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('credits')
          .eq('id', userId)
          .single();

        console.log('Raw Supabase response for credits:', { data, error });

        if (error) {
          console.error(`Error fetching credits (attempt ${attempt}/${retries}):`, error.message);
          if (attempt === retries) {
            setError('Failed to load credits after multiple attempts. Please try again.');
          }
          continue;
        }

        if (data && mountedRef.current) {
          console.log('Fetched credits:', data.credits);
          setCredits(data.credits || 0);
          setCreditsLoading(false);
          setError(null);
          return;
        } else if (!data) {
          console.warn('No profile data found for user:', userId);
          if (attempt === retries) {
            setError('No profile found. Please contact support.');
          }
        }
      } catch (err) {
        console.error(`Unexpected error fetching credits (attempt ${attempt}/${retries}):`, err.message);
        if (attempt === retries) {
          setError('Unexpected error loading credits: ' + err.message);
        }
      }
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
    setCreditsLoading(false);
  };

  const connectToMetricsWebSocket = () => {
    if (!server?.ipv4 || metricsWsRef.current) return;

    try {
      const wsUrl = `wss://${server.subdomain}.spawnly.net/status`;
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
            throttledSetLiveMetrics({
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
          setTimeout(connectToMetricsWebSocket, 15000);
        }
      };
    } catch (error) {
      console.error('Failed to connect to metrics WebSocket:', error);
    }
  };

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

  const fetchOnlinePlayers = async () => {
    if (!server?.status === 'Running' || !fileToken) {
      setOnlinePlayers([]);
      return;
    }

    try {
      console.log('Fetching online players for server:', server.id);
      const res = await fetch(`/api/servers/rcon`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${fileToken}`,
        },
        body: JSON.stringify({ serverId: server.id, command: 'list' }),
      });

      if (!res.ok) {
        const errorText = await res.text().catch(() => '');
        throw new Error(`Failed to fetch online players: ${errorText}`);
      }

      const { response } = await res.json();
      const match = response.match(/There are (\d+) of a max of (\d+) players online: (.*)/) ||
                    response.match(/players online: (.*)/);
      
      const players = match && match[3] ? 
        match[3].split(', ').filter(Boolean) : 
        (match && match[1] ? match[1].split(', ').filter(Boolean) : []);
      
      if (mountedRef.current) {
        setOnlinePlayers(players);
        console.log('Online players:', players);
      }
    } catch (err) {
      console.error('Error fetching online players:', err);
      setOnlinePlayers([]);
      setError(`Failed to fetch online players: ${err.message}`);
    }
  };

  const fetchServer = useCallback(
    debounce(async (serverIdParam, userIdParam) => {
      setLoading(true);
      try {
        const serverId = serverIdParam || id;
        const userId = userIdParam || user?.id;
        if (!serverId || !userId) {
          console.error('Missing serverId or userId');
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
          setServer((prev) => {
            if (JSON.stringify(prev) === JSON.stringify(data)) {
              console.log('No change in server data, skipping update');
              return prev;
            }
            console.log('Checking reload: newStatus=', data.status, 'prevStatus=', prev?.status, 'hasReceivedRunning=', hasReceivedRunningRef.current);
            if (
              (data.status === 'Running' && !hasReceivedRunningRef.current) ||
              (['Running', 'Stopped'].includes(data.status) && prev?.status && !['Running', 'Stopped'].includes(prev.status))
            ) {
              console.log('Triggering page reload for status:', data.status);
              hasReceivedRunningRef.current = true;
              router.reload();
              return prev;
            }
            return data;
          });
        }
      } catch (err) {
        console.error('Fetch server error:', err);
        setError('Failed to fetch server data. Please try again.');
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    }, 1000),
    [id, user?.id]
  );

  const pollUntilStatus = (expectedStatuses, timeout = 120000) => {
    const startTime = Date.now();
    pollRef.current = setInterval(() => {
      console.log(`Polling server status: ${server?.status}`);
      fetchServer(id, user?.id);
      if (expectedStatuses.includes(server?.status) || Date.now() - startTime > timeout) {
        clearInterval(pollRef.current);
        pollRef.current = null;
        if (Date.now() - startTime > timeout) {
          console.log('Polling timed out after 2min');
          setError('Operation timed out. Please refresh the page manually.');
        }
      }
    }, 3000);
  };

  const handleSoftwareChange = (newConfig) => {
    setServer((prev) => ({ ...prev, ...newConfig }));
  };

  const handleStartServer = async () => {
    if (actionLoading) return;
    try {
      setActionLoading(true);
      setError(null);
      hasReceivedRunningRef.current = false;

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

      if (serverData.pending_type || serverData.pending_version) {
        await supabase
          .from('servers')
          .update({ pending_type: null, pending_version: null, needs_recreation: false })
          .eq('id', serverId);
      }

      pollUntilStatus(['Running', 'Stopped']);
    } catch (err) {
      console.error('Start error:', err);
      setError(`Failed to start server: ${err.message}`);
      alert(`Failed to start server: ${err.message}`);
      await fetchServer(server?.id || id, user?.id);
    } finally {
      setActionLoading(false);
    }
  };

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

      pollUntilStatus(['Stopped']);
    } catch (err) {
      console.error('Stop error:', err);
      setError(`Failed to stop server: ${err.message}`);
      alert(`Failed to stop server: ${err.message}`);
      await fetchServer(server?.id || id, user?.id);
    } finally {
      setActionLoading(false);
    }
  };

  const handleRestartServer = async () => {
    if (actionLoading) return;
    try {
      setActionLoading(true);
      setError(null);
      hasReceivedRunningRef.current = false;

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

      pollUntilStatus(['Running']);
    } catch (err) {
      console.error('Restart error:', err);
      setError(`Failed to restart server: ${err.message}`);
      alert(`Failed to restart server: ${err.message}`);
      await fetchServer(server?.id || id, user?.id);
    } finally {
      setActionLoading(false);
    }
  };

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

  if (!user || loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center">
          <div className="animate-spin h-12 w-12 border-4 border-indigo-600 border-t-transparent rounded-full mx-auto"></div>
          <p className="mt-4 text-gray-600 text-lg font-medium animate-pulse">Loading server details...</p>
        </div>
      </div>
    );
  }

  if (!server) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-4xl mx-auto bg-white rounded-xl shadow-lg p-6">
          <p className="text-red-600 text-lg font-medium">Server not found or you don't have access.</p>
        </div>
      </div>
    );
  }

  const status = server.status || 'Unknown';
  const canStart = status === 'Stopped' && !actionLoading;
  const canStop = status === 'Running' && !actionLoading;
  const canRestart = status === 'Running' && !actionLoading;

  const moddedTypes = ['forge', 'fabric', 'quilt', 'neoforge'].map(t => t.toLowerCase());
  const pluginTypes = ['bukkit', 'spigot', 'paper', 'purpur'].map(t => t.toLowerCase());

  const serverType = server.type ? server.type.toLowerCase() : '';
  const isModded = moddedTypes.includes(serverType);
  const isPlugin = pluginTypes.includes(serverType);
  const showModsPluginsTab = isModded || isPlugin;
  const modsPluginsLabel = isModded ? 'Mods' : 'Plugins';

  // UI Enhancement: Show estimated runtime based on credits
  const estimatedHours = credits / (server.cost_per_hour || 1);
  const lowCreditsWarning = estimatedHours < 1 ? 'Low credits: May not run for long.' : '';

  return (
    <div className="min-h-screen bg-gray-50">
      <Header user={user} credits={credits} isLoading={creditsLoading} onLogout={handleLogout} />
      <main className="py-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="bg-white rounded-xl shadow-lg p-6 lg:p-8">
            {error && (
              <div className="mb-6 p-4 bg-red-50 text-red-700 rounded-lg border border-red-200 flex items-center justify-between transition-opacity duration-300">
                <span>{error}</span>
                <button
                  onClick={() => setError(null)}
                  className="text-red-800 hover:text-red-900 font-bold focus:outline-none focus:ring-2 focus:ring-red-500 rounded"
                  aria-label="Dismiss error"
                >
                  ×
                </button>
              </div>
            )}

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
              <div>
                <h1 className="text-3xl font-bold text-gray-900">{server.name}</h1>
                <div className="mt-3 flex flex-wrap gap-4 text-sm text-gray-500">
                  <span className="flex items-center">
                    <svg className="w-5 h-5 mr-2 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                    </svg>
                    Game: {server.game}
                  </span>
                  <span className="flex items-center">
                    <svg className="w-5 h-5 mr-2 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
                    </svg>
                    Software: {server.type}
                  </span>
                  <span className="flex items-center">
                    <svg className="w-5 h-5 mr-2 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h12a2 2 0 002-2V7a2 2 0 00-2-2h-2M8 5V3a2 2 0 012-2h4a2 2 0 012 2v2M8 5h8" />
                    </svg>
                    RAM: {server.ram} GB
                  </span>
                </div>
              </div>
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={refreshServerStatus}
                  className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-4 py-2 rounded-lg text-sm font-medium transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  aria-label="Refresh server status"
                >
                  Refresh Status
                </button>
                {status === 'Stopped' && (
                  <button
                    onClick={handleStartServer}
                    disabled={!canStart}
                    className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-green-500"
                    aria-label="Start server"
                  >
                    {actionLoading ? 'Starting...' : 'Start Server'}
                  </button>
                )}
                {status === 'Running' && (
                  <>
                    <button
                      onClick={handleStopServer}
                      disabled={!canStop}
                      className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-red-500"
                      aria-label="Stop server"
                    >
                      {actionLoading ? 'Stopping...' : 'Stop Server'}
                    </button>
                    <button
                      onClick={handleRestartServer}
                      disabled={!canRestart}
                      className="bg-yellow-600 hover:bg-yellow-700 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-yellow-500"
                      aria-label="Restart server"
                    >
                      {actionLoading ? 'Restarting...' : 'Restart Server'}
                    </button>
                  </>
                )}
              </div>
            </div>

            {lowCreditsWarning && (
              <div className="mb-4 p-2 bg-yellow-100 text-yellow-800 rounded">
                {lowCreditsWarning} Estimated runtime: {estimatedHours.toFixed(2)} hours.
              </div>
            )}

            <div className="mb-6">
              <div className="flex items-center">
                <span className="text-sm font-medium text-gray-600 mr-2">Status:</span>
                <ServerStatusIndicator server={server} />
                {server.last_status_update && (
                  <span className="ml-3 text-xs text-gray-400">
                    Last update: {format(new Date(server.last_status_update), 'yyyy-MM-dd HH:mm:ss')}
                  </span>
                )}
              </div>
            </div>

            <div className="border-b border-gray-200 mb-6">
              <nav className="flex flex-wrap gap-2 -mb-px" role="tablist">
                {[
                  { id: 'overview', label: 'Overview' },
                  { id: 'software', label: 'Software' },
                  ...(showModsPluginsTab ? [{ id: 'mods', label: modsPluginsLabel }] : []),
                  { id: 'files', label: 'Files' },
                  { id: 'console', label: 'Console' },
                  { id: 'properties', label: 'Properties' },
                  { id: 'players', label: 'Players' },
                  { id: 'world', label: 'World' },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`py-3 px-4 text-sm font-medium transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 rounded-t-lg ${
                      activeTab === tab.id
                        ? 'border-b-2 border-indigo-600 text-indigo-600 bg-indigo-50'
                        : 'text-gray-600 hover:text-indigo-600 hover:bg-gray-100'
                    }`}
                    role="tab"
                    aria-selected={activeTab === tab.id}
                    aria-controls={`panel-${tab.id}`}
                  >
                    {tab.label}
                  </button>
                ))}
              </nav>
            </div>

            <div className="mt-6" role="tabpanel" id={`panel-${activeTab}`}>
              <Suspense fallback={<div className="text-gray-600 text-center">Loading...</div>}>
                {activeTab === 'overview' && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="bg-white p-6 rounded-xl shadow-sm hover:shadow-md transition-shadow duration-200 border border-gray-100">
                      <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                        <svg className="w-5 h-5 mr-2 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
                        </svg>
                        Server Information
                      </h3>
                      <p className="text-sm text-gray-600 mb-2">
                        <strong className="font-medium text-gray-800">IP:</strong> {server.name + ".spawnly.net" || '—'}
                      </p>
                      <p className="text-sm text-gray-600 mb-2">
                        <strong className="font-medium text-gray-800">Software:</strong> {server.type || '—'}
                      </p>
                      <p className="text-sm text-gray-600 mb-2">
                        <strong className="font-medium text-gray-800">Version:</strong> {server.version || '—'}
                      </p>
                      <p className="text-sm text-gray-600 mb-2">
                        <strong className="font-medium text-gray-800">Game:</strong> {server.game || '—'}
                      </p>
                      <p className="text-sm text-gray-600">
                        <strong className="font-medium text-gray-800">Online Players:</strong> {onlinePlayers.length}
                      </p>
                    </div>

                    <div className="bg-white p-6 rounded-xl shadow-sm hover:shadow-md transition-shadow duration-200 border border-gray-100">
                      <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                        <svg className="w-5 h-5 mr-2 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Billing
                      </h3>
                      <p className="text-sm text-gray-600 mb-2">
                        <strong className="font-medium text-gray-800">Cost / hr:</strong> {server.cost_per_hour ? `$${server.cost_per_hour}` : '—'}
                      </p>
                      <div className="text-sm text-gray-600 mb-2 flex items-center flex-wrap gap-2">
                        <strong className="font-medium text-gray-800">RAM:</strong>
                        {editingRam ? (
                          <>
                            <input
                              type="number"
                              value={newRam}
                              onChange={(e) => setNewRam(parseInt(e.target.value, 10))}
                              className="w-20 border border-gray-300 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                              min="2"
                              max="32"
                              step="1"
                              aria-label="Edit RAM amount"
                            />
                            <span>GB</span>
                            <button
                              onClick={handleSaveRam}
                              disabled={actionLoading}
                              className="ml-2 bg-green-500 hover:bg-green-600 text-white px-3 py-1 rounded-lg text-sm font-medium disabled:opacity-50 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-green-500"
                              aria-label="Save RAM changes"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => setEditingRam(false)}
                              className="ml-2 bg-gray-300 hover:bg-gray-400 text-gray-800 px-3 py-1 rounded-lg text-sm font-medium transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-gray-500"
                              aria-label="Cancel RAM edit"
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
                                className="ml-2 text-indigo-600 hover:text-indigo-800 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                aria-label="Edit RAM"
                              >
                                Edit
                              </button>
                            )}
                          </>
                        )}
                      </div>
                      <p className="text-sm text-gray-600">
                        <strong className="font-medium text-gray-800">Created:</strong> {server.created_at ? format(new Date(server.created_at), 'yyyy-MM-dd HH:mm:ss') : '—'}
                      </p>
                    </div>

                    <div className="bg-white p-6 rounded-xl shadow-sm hover:shadow-md transition-shadow duration-200 border border-gray-100">
                      <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                        <svg className="w-5 h-5 mr-2 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2M9 19a2 2 0 01-2-2" />
                        </svg>
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
                  <div className="bg-white p-6 rounded-xl shadow-sm">
                    {fileToken ? (
                      <FileManager server={server} token={fileToken} setActiveTab={setActiveTab} />
                    ) : (
                      <p className="text-gray-600 text-center">Loading file access token...</p>
                    )}
                  </div>
                )}

                {activeTab === 'console' && (
                  <div className="bg-white p-6 rounded-xl shadow-sm">
                    <ConsoleViewer server={server} />
                  </div>
                )}

                {activeTab === 'properties' && (
                  <div className="bg-white p-6 rounded-xl shadow-sm">
                    <ServerPropertiesEditor server={server} />
                  </div>
                )}

                {activeTab === 'players' && (
                  <div className="bg-white p-6 rounded-xl shadow-sm">
                    {fileToken ? (
                      <PlayersTab server={server} token={fileToken} />
                    ) : (
                      <p className="text-gray-600 text-center">Loading file access token...</p>
                    )}
                  </div>
                )}

                {activeTab === 'world' && (
                  <div className="bg-white p-6 rounded-xl shadow-sm">
                    {fileToken ? (
                      <WorldTab server={server} token={fileToken} />
                    ) : (
                      <p className="text-gray-600 text-center">Loading file access token...</p>
                    )}
                  </div>
                )}
              </Suspense>
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