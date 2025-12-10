// pages/server/[id].js
/* eslint-disable react-hooks/exhaustive-deps */
import { useRouter } from 'next/router';
import { supabase } from '../../lib/supabaseClient';
import { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { debounce } from 'lodash';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ClipboardDocumentIcon, 
  PlayIcon, 
  StopIcon, 
  ArrowPathIcon, 
  CpuChipIcon, 
  CurrencyDollarIcon,
  ClockIcon,
  ServerIcon,
  SignalIcon,
  UserGroupIcon 
} from '@heroicons/react/24/outline';

// Components
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

// Helper: Convert DB player string to array
const getOnlinePlayersArray = (server) => {
  if (server?.status !== 'Running' || !server?.players_online) {
    return [];
  }
  return server.players_online.split(', ').filter(Boolean);
};

export default function ServerDetailPage({ initialServer }) {
  const router = useRouter();
  const { id } = router.query;

  // --- State ---
  const [server, setServer] = useState(initialServer);
  const [loading, setLoading] = useState(!initialServer);
  const [activeTab, setActiveTab] = useState('overview');
  const [user, setUser] = useState(null);
  const [credits, setCredits] = useState(0);
  const [creditsLoading, setCreditsLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState(null);
  const [fileToken, setFileToken] = useState(null);
  const [editingRam, setEditingRam] = useState(false);
  const [newRam, setNewRam] = useState(null);
  const [onlinePlayers, setOnlinePlayers] = useState(getOnlinePlayersArray(initialServer));
  
  // Auto-stop state
  const [autoStopCountdown, setAutoStopCountdown] = useState(null);
  const [savingAutoStop, setSavingAutoStop] = useState(false);
  const [copiedIp, setCopiedIp] = useState(false);

  // Refs
  const profileChannelRef = useRef(null);
  const serverChannelRef = useRef(null);
  const mountedRef = useRef(false);
  const pollRef = useRef(null);
  const countdownIntervalRef = useRef(null);

  // --- Effects ---

  // Handle Tab Query Param
  useEffect(() => {
    const qTab = router?.query?.tab;
    if (qTab && typeof qTab === 'string') {
      setActiveTab(qTab);
    }
  }, [router?.query?.tab]);

  // Initial Data Fetch
  useEffect(() => {
    mountedRef.current = true;

    const fetchSessionAndData = async () => {
      setLoading(true);
      setCreditsLoading(true);
      try {
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (sessionError || !sessionData?.session) {
          router.push('/login');
          return;
        }

        const userData = sessionData.session.user;
        setUser(userData);
        await fetchUserCredits(userData.id);

        if (id && !server) {
          await fetchServer(id, userData.id);
        }
      } catch (err) {
        console.error('Data fetch error:', err);
        setError('Failed to load session data.');
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

  // Realtime Subscription
  useEffect(() => {
    if (!id || !user?.id) return;
    
    if (serverChannelRef.current) supabase.removeChannel(serverChannelRef.current);

    const serverChannel = supabase
      .channel(`server-changes-${id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'servers', filter: `id=eq.${id}` },
        (payload) => {
          if (!mountedRef.current) return;
          setServer((prev) => payload.new);
          setError(null);
        }
      )
      .subscribe();

    serverChannelRef.current = serverChannel;
    return () => { if (serverChannelRef.current) supabase.removeChannel(serverChannelRef.current); };
  }, [id, user?.id]);

  // File Token
  useEffect(() => {
    if (!server?.id || fileToken || !user) return;
    const fetchFileToken = async (retries = 3, delay = 1000) => {
      for (let attempt = 1; attempt <= retries; attempt++) {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (!session) return;
          const response = await fetch(`/api/servers/get-token?serverId=${server.id}`, {
            headers: { Authorization: `Bearer ${session.access_token}` },
          });
          const data = await response.json();
          if (response.ok && data.token && mountedRef.current) {
            setFileToken(data.token);
            return;
          }
        } catch (err) {
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    };
    fetchFileToken();
  }, [server?.id, user]);

  // Player List Update
  useEffect(() => {
    setOnlinePlayers(getOnlinePlayersArray(server));
  }, [server?.players_online, server?.status]);

  // Countdown Timer
  useEffect(() => {
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);

    if (server?.status === 'Running' && server?.last_empty_at && server?.auto_stop_timeout > 0) {
      const updateCountdown = () => {
        const lastEmpty = new Date(server.last_empty_at).getTime();
        const timeoutMs = server.auto_stop_timeout * 60 * 1000;
        const diff = (lastEmpty + timeoutMs) - Date.now();

        if (diff <= 0) setAutoStopCountdown('Stopping soon...');
        else {
          const minutes = Math.floor(diff / 60000);
          const seconds = Math.floor((diff % 60000) / 1000);
          setAutoStopCountdown(`${minutes}m ${seconds}s`);
        }
      };
      updateCountdown();
      countdownIntervalRef.current = setInterval(updateCountdown, 1000);
    } else {
      setAutoStopCountdown(null);
    }
    return () => { if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current); };
  }, [server?.status, server?.last_empty_at, server?.auto_stop_timeout]);

  // --- Logic Helpers ---

  const cleanupResources = () => {
    try {
      if (profileChannelRef.current) supabase.removeChannel(profileChannelRef.current);
      if (serverChannelRef.current) supabase.removeChannel(serverChannelRef.current);
      if (pollRef.current) clearInterval(pollRef.current);
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    } catch (e) { console.error('Cleanup error:', e); }
  };

  const fetchUserCredits = async (userId) => {
    setCreditsLoading(true);
    const { data } = await supabase.from('profiles').select('credits').eq('id', userId).single();
    if (data && mountedRef.current) {
      setCredits(data.credits || 0);
      setCreditsLoading(false);
    }
  };

  const safeFetchJson = async (url, opts = {}) => {
    const res = await fetch(url, opts);
    if (!res.ok) throw new Error((await res.json()).error || `HTTP ${res.status}`);
    return res.json();
  };

  const fetchServer = useCallback(
    debounce(async (serverId, userId) => {
      const { data } = await supabase.from('servers').select('*').eq('id', serverId).eq('user_id', userId).single();
      if (data && mountedRef.current) setServer(prev => (JSON.stringify(prev) === JSON.stringify(data) ? prev : data));
    }, 1000), []
  );

  const pollUntilStatus = (expectedStatuses, timeout = 120000) => {
    const startTime = Date.now();
    pollRef.current = setInterval(() => {
      fetchServer(id, user?.id);
      if (expectedStatuses.includes(server?.status) || Date.now() - startTime > timeout) {
        clearInterval(pollRef.current);
        if (Date.now() - startTime > timeout) setError('Operation timed out. Please refresh.');
      }
    }, 3000);
  };

  // --- Handlers ---

  const handleCopyIp = () => {
    if (!server?.name) return;
    const ip = `${server.name}.spawnly.net`;
    navigator.clipboard.writeText(ip);
    setCopiedIp(true);
    setTimeout(() => setCopiedIp(false), 2000);
  };

  const handleSoftwareChange = (newConfig) => setServer(prev => ({ ...prev, ...newConfig }));

  const handleAutoStopChange = async (e) => {
    const val = parseInt(e.target.value, 10);
    setSavingAutoStop(true);
    try {
      const { error } = await supabase.from('servers').update({ auto_stop_timeout: val }).eq('id', server.id);
      if (error) throw error;
      setServer(prev => ({ ...prev, auto_stop_timeout: val }));
    } catch (e) { setError('Failed to update auto-stop setting'); }
    finally { setSavingAutoStop(false); }
  };

  const handleServerAction = async (action) => {
    if (actionLoading) return;
    setActionLoading(true);
    setError(null);
    try {
      if (action === 'start') {
        setServer(p => ({ ...p, status: 'Starting' }));
        const { data: sData } = await supabase.from('servers').select('type, version, pending_type, pending_version').eq('id', server.id).single();
        const { data: installed } = await supabase.from('installed_software').select('*').eq('server_id', server.id);
        
        await safeFetchJson('/api/servers/provision', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            serverId: server.id,
            type: sData.pending_type || sData.type,
            version: sData.pending_version || sData.version,
            installedSoftware: installed,
          }),
        });
        
        if (sData.pending_type || sData.pending_version) {
          await supabase.from('servers').update({ pending_type: null, pending_version: null }).eq('id', server.id);
        }
        pollUntilStatus(['Running', 'Stopped']);
      } else {
        const targetStatus = action === 'stop' ? 'Stopping' : 'Restarting';
        const expected = action === 'stop' ? ['Stopped'] : ['Running'];
        setServer(p => ({ ...p, status: targetStatus }));
        await safeFetchJson('/api/servers/action', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ serverId: server.id, action }),
        });
        pollUntilStatus(expected);
      }
    } catch (e) {
      setError(`Failed to ${action}: ${e.message}`);
      await fetchServer(server.id, user.id);
    } finally {
      setActionLoading(false);
    }
  };

  const handleSaveRam = async () => {
    if (server.status !== 'Stopped') return setError('Server must be stopped to change RAM.');
    if (newRam < 2 || newRam > 32) return setError('RAM must be between 2 and 32 GB.');
    setActionLoading(true);
    try {
      const { error } = await supabase.from('servers').update({ ram: newRam }).eq('id', server.id);
      if (error) throw error;
      setServer(prev => ({ ...prev, ram: newRam }));
      setEditingRam(false);
    } catch (e) { setError(e.message); }
    finally { setActionLoading(false); }
  };

  // --- Render Helpers ---

  if (!user || loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="flex flex-col items-center">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-indigo-600 border-t-transparent"></div>
        <p className="mt-4 text-gray-500 font-medium">Loading Command Center...</p>
      </div>
    </div>
  );

  if (!server) return <div className="p-10 text-center">Server not found.</div>;

  const status = server.status || 'Unknown';
  const isRunning = status === 'Running';
  const isStopped = status === 'Stopped';
  const isBusy = !isRunning && !isStopped;

  // Tabs Configuration
  const moddedTypes = ['forge', 'fabric', 'quilt', 'neoforge'];
  const pluginTypes = ['bukkit', 'spigot', 'paper', 'purpur'];
  const sType = (server.type || '').toLowerCase();
  const showMods = moddedTypes.includes(sType) || pluginTypes.includes(sType);
  const modLabel = moddedTypes.includes(sType) ? 'Mods' : 'Plugins';

  const tabs = [
    { id: 'overview', label: 'Overview', icon: SignalIcon },
    { id: 'software', label: 'Software', icon: CpuChipIcon },
    ...(showMods ? [{ id: 'mods', label: modLabel, icon: ServerIcon }] : []),
    { id: 'files', label: 'Files', icon: ClipboardDocumentIcon },
    { id: 'console', label: 'Console', icon: ClockIcon },
    { id: 'properties', label: 'Properties', icon: ServerIcon },
    { id: 'players', label: 'Players', icon: ServerIcon },
    { id: 'world', label: 'World', icon: ServerIcon },
  ];

  return (
    <div className="min-h-screen bg-gray-50 font-sans text-slate-900">
      <Header user={user} credits={credits} isLoading={creditsLoading} onLogout={() => { supabase.auth.signOut(); router.push('/login'); }} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Error Toast */}
        <AnimatePresence>
          {error && (
            <motion.div 
              initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="mb-6 p-4 bg-red-50 text-red-700 rounded-xl border border-red-200 flex justify-between items-center shadow-sm"
            >
              <div className="flex items-center gap-3">
                <span className="bg-red-200 p-1 rounded-full"><svg className="w-4 h-4 text-red-700" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg></span>
                <span>{error}</span>
              </div>
              <button onClick={() => setError(null)} className="text-sm font-semibold hover:underline">Dismiss</button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* --- Header Section --- */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 mb-8">
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
            
            {/* Server Identity */}
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h1 className="text-3xl font-bold text-gray-900">{server.name}</h1>
                <ServerStatusIndicator server={server} />
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <span className="bg-gray-100 px-2 py-0.5 rounded text-gray-700 font-medium capitalize">{server.game}</span>
                <span>•</span>
                <button 
                  onClick={handleCopyIp}
                  className="group flex items-center gap-1 hover:text-indigo-600 transition-colors"
                >
                  <span className="font-mono">{server.name}.spawnly.net</span>
                  {copiedIp ? <span className="text-green-600 text-xs font-bold">Copied!</span> : <ClipboardDocumentIcon className="w-4 h-4 opacity-50 group-hover:opacity-100" />}
                </button>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="flex flex-wrap items-center gap-3">
              {isStopped && (
                <button
                  onClick={() => handleServerAction('start')}
                  disabled={actionLoading}
                  className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl font-semibold shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {actionLoading ? <div className="animate-spin w-5 h-5 border-2 border-white/30 border-t-white rounded-full" /> : <PlayIcon className="w-5 h-5" />}
                  Start Server
                </button>
              )}
              
              {isRunning && (
                <>
                  <button
                    onClick={() => handleServerAction('restart')}
                    disabled={actionLoading}
                    className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-white px-5 py-2.5 rounded-xl font-semibold shadow-sm transition-all disabled:opacity-50"
                  >
                    {actionLoading ? <div className="animate-spin w-5 h-5 border-2 border-white/30 border-t-white rounded-full" /> : <ArrowPathIcon className="w-5 h-5" />}
                    Restart
                  </button>
                  <button
                    onClick={() => handleServerAction('stop')}
                    disabled={actionLoading}
                    className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-5 py-2.5 rounded-xl font-semibold shadow-sm transition-all disabled:opacity-50"
                  >
                    <StopIcon className="w-5 h-5" />
                    Stop
                  </button>
                </>
              )}
              
              {isBusy && (
                <button disabled className="flex items-center gap-2 bg-gray-100 text-gray-400 px-5 py-2.5 rounded-xl font-semibold cursor-not-allowed">
                  <div className="animate-spin w-5 h-5 border-2 border-gray-400 border-t-transparent rounded-full" />
                  Processing...
                </button>
              )}
            </div>
          </div>
        </div>

        {/* --- Navigation Tabs --- */}
        <div className="mb-8 overflow-x-auto">
          <div className="flex items-center gap-2 min-w-max border-b border-gray-200 pb-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`relative px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-medium transition-colors ${
                  activeTab === tab.id ? 'text-indigo-600 bg-indigo-50' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                }`}
              >
                {tab.label}
                {activeTab === tab.id && (
                  <motion.div
                    layoutId="activeTab"
                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600 translate-y-1.5 rounded-full"
                  />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* --- Tab Content --- */}
        <div className="min-h-[400px]">
          <Suspense fallback={<div className="text-center py-12 text-gray-400">Loading component...</div>}>
            
            {activeTab === 'overview' && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                
                {/* 1. Connection Card */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 flex flex-col justify-between">
                  <div>
                    <h3 className="text-gray-500 text-sm font-semibold uppercase tracking-wider mb-4 flex items-center gap-2">
                      <SignalIcon className="w-4 h-4" /> Connection
                    </h3>
                    <div 
                      onClick={handleCopyIp}
                      className="group cursor-pointer bg-gray-50 hover:bg-indigo-50 border border-gray-200 hover:border-indigo-200 rounded-xl p-4 text-center transition-all"
                    >
                      <p className="text-sm text-gray-500 mb-1">Server Address</p>
                      <p className="text-xl font-mono font-bold text-gray-900 break-all">{server.name}.spawnly.net</p>
                      <p className="text-xs text-indigo-600 mt-2 font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                        {copiedIp ? 'Copied to clipboard!' : 'Click to copy'}
                      </p>
                    </div>
                  </div>
                  <div className="mt-6 pt-6 border-t border-gray-100">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm text-gray-600">Software</span>
                      <span className="text-sm font-medium text-gray-900 capitalize">{server.type || 'Vanilla'}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">Version</span>
                      <span className="text-sm font-medium text-gray-900">{server.version}</span>
                    </div>
                  </div>
                </div>

                {/* 2. Resources & Metrics (Updated with Player Count) */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 md:col-span-2 flex flex-col">
                  <h3 className="text-gray-500 text-sm font-semibold uppercase tracking-wider mb-4 flex items-center gap-2">
                    <CpuChipIcon className="w-4 h-4" /> Live Resources
                  </h3>
                  <div className="flex flex-col flex-1 gap-4">
                    {isRunning ? (
                      <>
                        <ServerMetrics server={server} />
                        
                        {/* New Player Count Section */}
                        <div className="mt-auto pt-4 border-t border-gray-100 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <UserGroupIcon className="w-5 h-5 text-gray-400" />
                            <span className="text-sm font-medium text-gray-600">Active Players</span>
                          </div>
                          <div className="text-right">
                            <span className="text-2xl font-bold text-gray-900">{server.player_count || 0}</span>
                            <span className="text-gray-400 text-sm font-medium ml-1">/ {server.max_players || 20}</span>
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="flex-1 flex flex-col items-center justify-center text-gray-400 bg-gray-50 rounded-xl border border-dashed border-gray-200 h-40">
                        <ServerIcon className="w-8 h-8 mb-2 opacity-50" />
                        <p>Server is offline. Start it to view metrics.</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* 3. Configuration & Limits */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
                  <h3 className="text-gray-500 text-sm font-semibold uppercase tracking-wider mb-4 flex items-center gap-2">
                    <ClockIcon className="w-4 h-4" /> Configuration
                  </h3>
                  
                  {/* Auto-Stop */}
                  <div className="mb-6">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Auto-Stop (Empty)</label>
                    <div className="flex items-center gap-2">
                      <select
                        value={server.auto_stop_timeout ?? 30}
                        onChange={handleAutoStopChange}
                        disabled={savingAutoStop}
                        className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm bg-gray-50"
                      >
                        <option value="0">Never</option>
                        <option value="5">5 minutes</option>
                        <option value="15">15 minutes</option>
                        <option value="30">30 minutes</option>
                        <option value="60">1 hour</option>
                      </select>
                      {savingAutoStop && <div className="animate-spin h-4 w-4 border-2 border-indigo-600 border-t-transparent rounded-full" />}
                    </div>
                    {autoStopCountdown && (
                      <div className="mt-2 p-2 bg-amber-50 text-amber-800 text-xs rounded-lg flex items-center gap-2 animate-pulse border border-amber-100">
                        <ClockIcon className="w-3 h-3" /> Stopping in {autoStopCountdown}
                      </div>
                    )}
                  </div>

                  {/* RAM Allocation */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">RAM Allocation</label>
                    {editingRam ? (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <input
                            type="range" min="2" max="32" step="1"
                            value={newRam} onChange={(e) => setNewRam(Number(e.target.value))}
                            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                          />
                          <span className="text-sm font-bold w-12 text-right">{newRam}GB</span>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={handleSaveRam} className="flex-1 bg-indigo-600 text-white text-xs py-1.5 rounded-lg hover:bg-indigo-700">Save</button>
                          <button onClick={() => setEditingRam(false)} className="flex-1 bg-gray-200 text-gray-700 text-xs py-1.5 rounded-lg hover:bg-gray-300">Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex justify-between items-center bg-gray-50 p-3 rounded-xl border border-gray-200">
                        <span className="font-mono font-bold text-gray-800">{server.ram} GB</span>
                        {isStopped && (
                          <button 
                            onClick={() => { setNewRam(server.ram); setEditingRam(true); }} 
                            className="text-xs text-indigo-600 font-medium hover:text-indigo-800"
                          >
                            Edit
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* 4. Billing Info */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 md:col-span-2">
                  <h3 className="text-gray-500 text-sm font-semibold uppercase tracking-wider mb-4 flex items-center gap-2">
                    <CurrencyDollarIcon className="w-4 h-4" /> Billing Status
                  </h3>
                  <div className="flex items-center gap-8">
                    <div>
                      <p className="text-sm text-gray-500">Hourly Cost</p>
                      <p className="text-2xl font-bold text-gray-900">{server.cost_per_hour} <span className="text-sm font-normal text-gray-500">credits/hr</span></p>
                    </div>
                    <div className="h-10 w-px bg-gray-200"></div>
                    <div>
                      <p className="text-sm text-gray-500">Est. Runtime</p>
                      <p className="text-2xl font-bold text-gray-900">
                        {(credits / (server.cost_per_hour || 1)).toFixed(1)} <span className="text-sm font-normal text-gray-500">hours left</span>
                      </p>
                    </div>
                  </div>
                  {credits < server.cost_per_hour && (
                    <div className="mt-4 bg-red-50 text-red-700 text-sm p-3 rounded-lg flex items-center gap-2">
                      <span className="font-bold">Warning:</span> Low balance. Server may stop soon.
                    </div>
                  )}
                </div>

              </div>
            )}

            {/* Other Tabs */}
            <div className={activeTab === 'overview' ? 'hidden' : 'block animate-in fade-in duration-300'}>
              {activeTab === 'software' && <ServerSoftwareTab server={server} onSoftwareChange={handleSoftwareChange} />}
              {activeTab === 'mods' && <ModsPluginsTab server={server} />}
              {activeTab === 'files' && (
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
                  {fileToken ? <FileManager server={server} token={fileToken} setActiveTab={setActiveTab} /> : <p className="text-center text-gray-500">Authenticating file access...</p>}
                </div>
              )}
              {activeTab === 'console' && (
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
                  <ConsoleViewer server={server} />
                </div>
              )}
              {activeTab === 'properties' && (
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
                  <ServerPropertiesEditor server={server} />
                </div>
              )}
              {activeTab === 'players' && (
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
                  {fileToken ? <PlayersTab server={server} token={fileToken} /> : <p className="text-center text-gray-500">Authenticating...</p>}
                </div>
              )}
              {activeTab === 'world' && (
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
                  {fileToken ? <WorldTab server={server} token={fileToken} /> : <p className="text-center text-gray-500">Authenticating...</p>}
                </div>
              )}
            </div>

          </Suspense>
        </div>
      </main>
      <Footer />
    </div>
  );
}

// Server Side Props (Preserved)
export async function getServerSideProps(context) {
  const { id } = context.params || {};
  if (!id) return { notFound: true };

  try {
    const { createClient } = require('@supabase/supabase-js');
    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return { props: { initialServer: null } };

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data, error } = await supabaseAdmin.from('servers').select('*').eq('id', id).single();

    if (error || !data) return { notFound: true };
    return { props: { initialServer: data } };
  } catch (err) {
    console.error('SSR Error:', err);
    return { props: { initialServer: null } };
  }
}