// pages/dashboard.js

import { useEffect, useState, useRef } from "react";
import { supabase } from "../lib/supabaseClient";
import { useRouter } from "next/router";
import CreateServerForm from "./CreateServerForm";
import Link from 'next/link';
import ServerStatusIndicator from "../components/ServerStatusIndicator";
import Header from "../components/ServersHeader";
import Footer from "../components/ServersFooter";
import { 
  PlusIcon, 
  ServerIcon, 
  CpuChipIcon, 
  PlayIcon, 
  StopIcon, 
  TrashIcon, 
  CurrencyDollarIcon,
  SignalIcon,
  AdjustmentsHorizontalIcon,
  CommandLineIcon
} from '@heroicons/react/24/outline';

// --- NEW: Helper for Displaying Software/Version ---
const getDisplayInfo = (server) => {
  if (!server) return { software: 'Unknown', version: 'Unknown' };

  let software = server.type || 'Vanilla';
  let version = server.version || '';

  // Handle Modpacks
  if (server.type?.startsWith('modpack-')) {
    const providerRaw = server.type.replace('modpack-', '');
    const provider = providerRaw.charAt(0).toUpperCase() + providerRaw.slice(1);
    
    // Default fallback
    software = `Modpack (${provider})`;

    // Handle Version & Name extraction
    if (server.version?.includes('::')) {
      const parts = server.version.split('::');
      // parts[0] = URL or ID (hidden)
      // parts[1] = Game Version (displayed as Version)
      // parts[2] = Modpack Name (displayed as Software) - *If available*
      
      if (parts[1]) version = parts[1];
      if (parts[2]) {
        // Format as "Name (Provider)"
        software = `${parts[2]} (${provider})`; 
      }
    }
  }

  return { software, version };
};

export default function Dashboard() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [servers, setServers] = useState([]);
  const [credits, setCredits] = useState(0);
  const [isLoadingServers, setIsLoadingServers] = useState(true);
  const [error, setError] = useState(null);

  // Polling and mounted refs
  const pollingRef = useRef(false);
  const [isPolling, setIsPolling] = useState(false);
  const mountedRef = useRef(false);
  const pollingIntervalRef = useRef(null);
  const realtimeChannelRef = useRef(null);

  const transitionalStates = ['Initializing', 'Starting', 'Stopping', 'Restarting'];

  useEffect(() => {
    mountedRef.current = true;

    const fetchSession = async () => {
      const { data, error } = await supabase.auth.getSession();
      
      if (!data.session) {
        router.push("/login");
      } else {
        setUser(data.session.user);
        await fetchUserCredits(data.session.user.id);
        fetchServers(data.session.user.id);
      }
      setLoading(false);
    };

    fetchSession();

    return () => {
      mountedRef.current = false;
      pollingRef.current = false;
      setIsPolling(false);
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
      if (realtimeChannelRef.current) {
        supabase.removeChannel(realtimeChannelRef.current.serverChannel);
        supabase.removeChannel(realtimeChannelRef.current.profileChannel);
        realtimeChannelRef.current = null;
      }
    };
  }, []);

  // Set up real-time subscriptions
  useEffect(() => {
    if (!user?.id) return;

    const serverChannel = supabase
      .channel(`user-servers-${user.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'servers', filter: `user_id=eq.${user.id}` }, (payload) => {
        if (!mountedRef.current) return;
        setServers((prev) => prev.map((s) => (s.id === payload.new.id ? payload.new : s)));
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'servers', filter: `user_id=eq.${user.id}` }, (payload) => {
        if (!mountedRef.current) return;
        setServers((prev) => [payload.new, ...prev.filter(s => !s.id.startsWith('temp-'))]);
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'servers', filter: `user_id=eq.${user.id}` }, (payload) => {
        if (!mountedRef.current) return;
        setServers((prev) => prev.filter((s) => s.id !== payload.old.id));
      })
      .subscribe();

    const profileChannel = supabase
      .channel(`user-profile-${user.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${user.id}` }, (payload) => {
        if (!mountedRef.current) return;
        setCredits(payload.new.credits || 0);
      })
      .subscribe();

    realtimeChannelRef.current = { serverChannel, profileChannel };

    return () => {
      if (realtimeChannelRef.current) {
        supabase.removeChannel(realtimeChannelRef.current.serverChannel);
        supabase.removeChannel(realtimeChannelRef.current.profileChannel);
      }
    };
  }, [user?.id]);

  // Start polling if transitional
  useEffect(() => {
    if (!user?.id || isPolling) return;
    const hasTransitional = servers.some((s) => transitionalStates.includes(s.status));
    if (hasTransitional) startPolling();
  }, [servers, user?.id, isPolling]);

  const setPolling = (val) => {
    pollingRef.current = val;
    if (mountedRef.current) setIsPolling(val);
  };

  const startPolling = () => {
    if (pollingRef.current || !mountedRef.current) return;
    setPolling(true);

    pollingIntervalRef.current = setInterval(async () => {
      if (!mountedRef.current || !pollingRef.current) {
        clearInterval(pollingIntervalRef.current);
        return;
      }

      const transitional = servers.filter((s) => transitionalStates.includes(s.status) && s.hetzner_id);

      if (transitional.length === 0) {
        clearInterval(pollingIntervalRef.current);
        setPolling(false);
        return;
      }

      for (const srv of transitional) {
        try {
          const resp = await fetch(`/api/servers/hetzner-status?hetznerId=${encodeURIComponent(srv.hetzner_id)}`);
          if (resp.ok) {
            const j = await resp.json();
            const mapped = j.mapped || null;
            if (mapped && mapped !== srv.status) {
              setServers(prev => prev.map(server => server.id === srv.id ? { ...server, status: mapped } : server));
              await fetch('/api/servers/set-status', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ serverId: srv.id, status: mapped }),
              });
            }
          }
        } catch (e) {
          console.warn(`Polling error for server ${srv.id}:`, e);
        }
      }
    }, 3000);
  };

  const fetchUserCredits = async (userId) => {
    const { data } = await supabase.from('profiles').select('credits').eq('id', userId).single();
    if (data) setCredits(data.credits || 0);
  };

  const fetchServers = async (userId) => {
    setIsLoadingServers(true);
    const { data } = await supabase.from('servers').select('*').eq('user_id', userId).order('created_at', { ascending: false });
    if (data) setServers(data);
    setIsLoadingServers(false);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  const handleCreateServer = async (serverData) => {
    if (!user) return;
    const cost = parseFloat(serverData.costPerHour);
    
    // Optimistic UI
    const tempServerId = `temp-${Date.now()}`;
    const optimisticServer = {
      id: tempServerId,
      name: serverData.name,
      game: serverData.game || 'minecraft',
      type: serverData.software || 'paper',
      version: serverData.version || null,
      ram: serverData.ram || 4,
      cost_per_hour: cost,
      status: "Stopped",
      user_id: user.id,
      created_at: new Date().toISOString(),
      hetzner_id: null,
      ipv4: null,
    };

    setServers((prev) => [optimisticServer, ...prev]);
    setShowModal(false);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("No active session");
      const token = session.access_token;

      const resp = await fetch('/api/servers/create', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify({ ...serverData, userId: user.id }),
      });

      const json = await resp.json();
      if (!resp.ok) throw new Error(json.error || 'Failed to create');

      const newServerId = json.server?.id;
      if (newServerId) router.push(`/server/${newServerId}`);
    } catch (err) {
      setServers((prev) => prev.filter((s) => s.id !== tempServerId));
      setError(`Failed to create server: ${err.message}`);
    }
  };

  const handleDeleteServer = async (serverId) => {
    if (!confirm('Are you sure? This will delete the server and all data permanently.')) return;
    try {
      await fetch('/api/servers/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serverId, action: 'delete' }),
      });
    } catch (err) {
      setError('Failed to delete server');
    }
  };

  const handleStartServer = async (server) => {
    try {
      const endpoint = !server.hetzner_id ? '/api/servers/provision' : '/api/servers/action';
      const body = !server.hetzner_id ? { serverId: server.id } : { serverId: server.id, action: 'start' };
      
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
    } catch (err) {
      setError(`Failed to start server: ${err.message}`);
    }
  };

  const handleStopServer = async (serverId) => {
    try {
      await fetch('/api/servers/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serverId, action: 'stop' }),
      });
    } catch (err) {
      setError('Failed to stop server');
    }
  };

  // --- Render Helpers ---

  if (loading) return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900 flex items-center justify-center">
      <div className="flex flex-col items-center">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-indigo-600 border-t-transparent"></div>
        <p className="mt-4 text-gray-500 dark:text-gray-400 font-medium">Loading dashboard...</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900 font-sans text-slate-900 dark:text-gray-100">
      <Header user={user} credits={credits} isLoading={isLoadingServers} onLogout={handleLogout} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {/* Error Toast */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 text-red-700 rounded-xl border border-red-200 flex justify-between items-center shadow-sm">
            <span className="flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
              {error}
            </span>
            <button onClick={() => setError(null)} className="text-sm font-semibold hover:underline">Dismiss</button>
          </div>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700 flex items-center gap-4">
            <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl"><ServerIcon className="w-6 h-6" /></div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">Total Servers</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{servers.length}</p>
            </div>
          </div>
          <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700 flex items-center gap-4">
            <div className="p-3 bg-green-50 text-green-600 rounded-xl"><PlayIcon className="w-6 h-6" /></div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">Active Now</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{servers.filter(s => s.status === 'Running').length}</p>
            </div>
          </div>
          <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700 flex items-center gap-4">
            <div className="p-3 bg-purple-50 text-purple-600 rounded-xl"><CpuChipIcon className="w-6 h-6" /></div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">Total RAM</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{servers.reduce((a, b) => a + b.ram, 0)} GB</p>
            </div>
          </div>
          <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700 flex items-center gap-4">
            <div className="p-3 bg-amber-50 text-amber-600 rounded-xl"><CurrencyDollarIcon className="w-6 h-6" /></div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">Hourly Cost</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{servers.reduce((a, b) => a + b.cost_per_hour, 0).toFixed(2)}</p>
            </div>
          </div>
        </div>

        {/* Action Bar */}
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Your Servers</h2>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl font-medium shadow-sm transition-all hover:-translate-y-0.5"
          >
            <PlusIcon className="w-5 h-5" />
            New Server
          </button>
        </div>

        {/* Server Grid / Empty State */}
        {isLoadingServers && servers.length === 0 ? (
          <div className="py-20 flex justify-center"><div className="animate-spin rounded-full h-10 w-10 border-4 border-indigo-600 border-t-transparent" /></div>
        ) : servers.length === 0 ? (
          <div className="bg-white dark:bg-slate-800 border-2 border-dashed border-gray-300 dark:border-slate-600 rounded-2xl p-12 text-center">
            <div className="mx-auto w-16 h-16 bg-gray-50 dark:bg-slate-700 rounded-full flex items-center justify-center mb-4">
              <ServerIcon className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">No servers found</h3>
            <p className="text-gray-500 dark:text-gray-400 mt-1 mb-6">Get started by creating your first game server.</p>
            <button onClick={() => setShowModal(true)} className="text-indigo-600 font-medium hover:underline">Create Server &rarr;</button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {servers.map((server) => {
              // --- USE HELPER HERE ---
              const { software, version } = getDisplayInfo(server);
              
              return (
              <div key={server.id} className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700 overflow-hidden flex flex-col group hover:border-indigo-200 dark:hover:border-indigo-600 transition-colors">
                
                {/* Card Header */}
                <div className="p-6 border-b border-gray-100 dark:border-slate-700">
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg flex items-center justify-center text-indigo-600">
                        {server.game === 'minecraft' ? <div className="font-bold">M</div> : <ServerIcon className="w-6 h-6" />}
                      </div>
                      <div>
                        <h3 className="font-bold text-gray-900 dark:text-gray-100 group-hover:text-indigo-600 transition-colors cursor-pointer" onClick={() => !server.id.startsWith('temp') && router.push(`/server/${server.id}`)}>
                          {server.name}
                        </h3>
                        {/* UPDATED: Use clean software/version strings */}
                        <p className="text-xs text-gray-500 dark:text-gray-400 capitalize truncate max-w-[180px]" title={software}>
                            {software} <span className="text-gray-400 dark:text-gray-500">{version}</span>
                        </p>
                      </div>
                    </div>
                    <ServerStatusIndicator server={server} />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-gray-500 dark:text-gray-400 text-xs uppercase font-medium">Memory</p>
                      <p className="font-semibold text-gray-900 dark:text-gray-100">{server.ram} GB</p>
                    </div>
                    <div>
                      <p className="text-gray-500 dark:text-gray-400 text-xs uppercase font-medium">Address</p>
                      <p className="font-mono text-gray-700 dark:text-gray-300 truncate" title={`${server.name}.spawnly.net`}>{server.name}.spawnly.net</p>
                    </div>
                  </div>
                </div>

                {/* Card Actions */}
                <div className="p-4 bg-gray-50 dark:bg-slate-700 flex items-center gap-2 mt-auto">
                  {server.status === "Stopped" ? (
                    <button 
                      onClick={() => handleStartServer(server)}
                      disabled={server.id.startsWith('temp')}
                      className="flex-1 flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white py-2 rounded-lg text-sm font-medium transition-colors"
                    >
                      <PlayIcon className="w-4 h-4" /> Start
                    </button>
                  ) : server.status === "Running" ? (
                    <button 
                      onClick={() => handleStopServer(server.id)}
                      className="flex-1 flex items-center justify-center gap-2 bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-gray-300 hover:bg-red-50 hover:text-red-600 hover:border-red-200 dark:hover:bg-red-900/20 dark:hover:border-red-600 py-2 rounded-lg text-sm font-medium transition-colors"
                    >
                      <StopIcon className="w-4 h-4" /> Stop
                    </button>
                  ) : (
                    <button disabled className="flex-1 flex items-center justify-center gap-2 bg-gray-200 dark:bg-slate-600 text-gray-500 py-2 rounded-lg text-sm font-medium cursor-not-allowed">
                      <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                      Processing
                    </button>
                  )}

                  <Link 
                    href={server.id.startsWith('temp') ? '#' : `/server/${server.id}`}
                    className={`p-2 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-600 dark:text-gray-300 hover:text-indigo-600 hover:border-indigo-300 dark:hover:border-indigo-600 transition-colors ${server.id.startsWith('temp') ? 'pointer-events-none opacity-50' : ''}`}
                    title="Console & Files"
                  >
                    <CommandLineIcon className="w-5 h-5" />
                  </Link>
                  
                  <Link 
                    href={server.id.startsWith('temp') ? '#' : `/server/${server.id}?tab=properties`}
                    className={`p-2 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-600 dark:text-gray-300 hover:text-indigo-600 hover:border-indigo-300 dark:hover:border-indigo-600 transition-colors ${server.id.startsWith('temp') ? 'pointer-events-none opacity-50' : ''}`}
                    title="Settings"
                  >
                    <AdjustmentsHorizontalIcon className="w-5 h-5" />
                  </Link>

                  <button
                    onClick={() => handleDeleteServer(server.id)}
                    disabled={!['Stopped', 'Running'].includes(server.status)}
                    className="p-2 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-400 hover:text-red-600 hover:border-red-200 dark:hover:border-red-600 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50"
                    title="Delete Server"
                  >
                    <TrashIcon className="w-5 h-5" />
                  </button>
                </div>
              </div>
            )})}
          </div>
        )}
      </main>

      {/* Create Server Modal */}
      {showModal && (
        <CreateServerForm
          onClose={() => setShowModal(false)}
          onCreate={handleCreateServer}
          credits={credits}
        />
      )}

      <Footer />
    </div>
  );
}