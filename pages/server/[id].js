/* eslint-disable react-hooks/exhaustive-deps */
import { useRouter } from 'next/router';
import { supabase } from '../../lib/supabaseClient';
import { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { debounce } from 'lodash';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'next-i18next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
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
  UserGroupIcon, 
  PuzzlePieceIcon, 
  PencilSquareIcon, 
  CheckIcon, 
  XMarkIcon,
  ArchiveBoxIcon,
  CalendarDaysIcon,
  TrashIcon
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
import BackupsTab from '../../components/BackupsTab';
import SchedulesTab from '../../components/SchedulesTab';

// Helper: Convert DB player string to array
const getOnlinePlayersArray = (server) => {
  if (server?.status !== 'Running' || !server?.players_online) {
    return [];
  }
  return server.players_online.split(', ').filter(Boolean);
};

// Helper for browser notifications
const showStatusNotification = (serverName, t) => {
  if (typeof window !== 'undefined' && 'Notification' in window) {
    if (Notification.permission === 'granted') {
      new Notification(t('notifications.ready_title', { serverName }), {
        body: t('notifications.ready_body', { serverName }),
        icon: '/logo.png', 
        vibrate: [200, 100, 200]
      });
    } else if (Notification.permission !== 'denied') {
      Notification.requestPermission();
    }
  }
};

// Helper for Displaying Software/Version
const getDisplayInfo = (server, t) => {
  if (!server) return { software: t ? t('software.unknown') : 'Unknown', version: t ? t('software.unknown') : 'Unknown' };

  let software = server.type || 'Vanilla';
  let version = server.version || '';

  // Handle Modpacks
  if (server.type?.startsWith('modpack-')) {
    const providerRaw = server.type.replace('modpack-', '');
    const provider = providerRaw.charAt(0).toUpperCase() + providerRaw.slice(1);
    
    // Default fallback
    software = t ? `${t('software.modpack')} (${provider})` : `Modpack (${provider})`;

    // Handle Version & Name extraction
    if (server.version?.includes('::')) {
      const parts = server.version.split('::');
      
      if (parts[1]) version = parts[1];
      if (parts[2]) {
        software = `${parts[2]} (${provider})`; 
      }
    }
  }

  return { software, version };
};


export default function ServerDetailPage({ initialServer }) {
  const router = useRouter();
  const { id } = router.query;
  const { t } = useTranslation('server');

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

  // MOTD State
  const [isEditingMotd, setIsEditingMotd] = useState(false);
  const [motdText, setMotdText] = useState(initialServer?.motd || '');
  const [savingMotd, setSavingMotd] = useState(false);

  // Refs
  const profileChannelRef = useRef(null);
  const serverChannelRef = useRef(null);
  const mountedRef = useRef(false);
  const pollRef = useRef(null);
  const countdownIntervalRef = useRef(null);
  const prevStatusRef = useRef(initialServer?.status); 

  // --- Effects ---

  useEffect(() => {
    const qTab = router?.query?.tab;
    if (qTab && typeof qTab === 'string') {
      setActiveTab(qTab);
    }
  }, [router?.query?.tab]);

  // Initial Data Fetch & Permissions
  useEffect(() => {
    mountedRef.current = true;

    // Request notification permission early
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }

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
        setError(t('errors.load_session'));
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
          setServer((prev) => {
            const updated = payload.new;
            // Prevent overwriting unsaved MOTD changes if the user is typing
            if (!isEditingMotd && updated.motd !== prev.motd) {
              setMotdText(updated.motd);
            }
            return updated;
          });
          setError(null);
        }
      )
      .subscribe();

    serverChannelRef.current = serverChannel;
    return () => { if (serverChannelRef.current) supabase.removeChannel(serverChannelRef.current); };
  }, [id, user?.id, isEditingMotd]);

  // Heartbeat Polling: Ensures UI stays in sync even if Realtime events are missed
  useEffect(() => {
    if (!id || !user?.id) return;

    const heartbeat = setInterval(() => {
      // Only poll if window is visible and we aren't already aggressively polling for an action
      if (!document.hidden && !pollRef.current && mountedRef.current) {
         fetchServer(id, user.id);
      }
    }, 15000); // Check every 15 seconds

    return () => clearInterval(heartbeat);
  }, [id, user?.id]);

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

  useEffect(() => {
    setOnlinePlayers(getOnlinePlayersArray(server));
  }, [server?.players_online, server?.status]);

  // Countdown Logic - Fixed Visibility
  useEffect(() => {
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);

    // FIX: Only check player_count > 0 to hide the timer.
    // If player_count is 0, we trust last_empty_at.
    // We ignore the 'players_online' string here as it can be stale or contain whitespace formatting.
    const hasActivePlayers = server?.player_count && server.player_count > 0;

    if (server?.status === 'Running' && server?.last_empty_at && server?.auto_stop_timeout > 0 && !hasActivePlayers) {
      const updateCountdown = () => {
        const lastEmpty = new Date(server.last_empty_at).getTime();
        const timeoutMs = (server.auto_stop_timeout || 0) * 60 * 1000;
        const diff = (lastEmpty + timeoutMs) - Date.now();

        if (diff <= 0) {
            // Time is up, but backend hasn't stopped it yet
            setAutoStopCountdown(t('config.stopping_soon'));
        } else {
          const minutes = Math.floor(diff / 60000);
          const seconds = Math.floor((diff % 60000) / 1000);
          setAutoStopCountdown(t('config.stopping_in', { time: `${minutes}m ${seconds}s` }));
        }
      };
      
      updateCountdown();
      countdownIntervalRef.current = setInterval(updateCountdown, 1000);
    } else {
      setAutoStopCountdown(null);
    }
    return () => { if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current); };
  }, [server?.status, server?.last_empty_at, server?.auto_stop_timeout, server?.player_count, t]);

  // Notifications Logic
  useEffect(() => {
    const prevStatus = prevStatusRef.current;
    const currentStatus = server?.status;
    const serverName = server?.name;

    const startingStatuses = ['Starting', 'Provisioning', 'Recreating'];
    const isTransitioning = startingStatuses.includes(prevStatus) && currentStatus === 'Running';

    if (isTransitioning) {
      showStatusNotification(serverName, t);
    }
    
    prevStatusRef.current = currentStatus;
  }, [server?.status, server?.name, t]); 


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
      if (data && mountedRef.current) {
        setServer(prev => (JSON.stringify(prev) === JSON.stringify(data) ? prev : data));
        if (!isEditingMotd) setMotdText(data.motd || '');
      }
    }, 1000), [isEditingMotd]
  );

  const pollUntilStatus = (expectedStatuses, timeout = 120000) => {
    // Clear existing poll to avoid duplicates
    if (pollRef.current) clearInterval(pollRef.current);

    const startTime = Date.now();
    pollRef.current = setInterval(() => {
      fetchServer(id, user?.id);
      
      // Stop polling if status matches or timeout reached
      if (expectedStatuses.includes(server?.status) || Date.now() - startTime > timeout) {
        clearInterval(pollRef.current);
        pollRef.current = null; // Free up the ref for the heartbeat
        if (Date.now() - startTime > timeout) setError(t('errors.timeout'));
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
    } catch (e) { setError(t('errors.update_auto_stop')); }
    finally { setSavingAutoStop(false); }
  };

  const handleServerAction = async (action) => {
    if (actionLoading) return;
    
    // CONFIRMATION FOR KILL
    if (action === 'kill') {
        if (!confirm(t('messages.confirm_kill', { defaultValue: 'Are you sure you want to FORCE KILL this server? This will immediately destroy the VPS without saving data. Only use this if the server is stuck.' }))) {
            return;
        }
    }

    setActionLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("No active session");
      const token = session.access_token;

      if (action === 'start') {
        setServer(p => ({ ...p, status: 'Starting' }));
        const { data: sData } = await supabase.from('servers').select('type, version, pending_type, pending_version').eq('id', server.id).single();
        const { data: installed } = await supabase.from('installed_software').select('*').eq('server_id', server.id);
        
        await safeFetchJson('/api/servers/provision', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
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
        // KILL / STOP / RESTART
        let targetStatus = 'Stopping';
        if (action === 'restart') targetStatus = 'Restarting';
        // For kill, we expect 'Stopped' eventually.
        const expected = action === 'restart' ? ['Running'] : ['Stopped'];
        
        setServer(p => ({ ...p, status: targetStatus }));
        
        await safeFetchJson('/api/servers/action', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ serverId: server.id, action }),
        });
        pollUntilStatus(expected);
      }
    } catch (e) {
      setError(t('errors.failed_action', { action, message: e.message }));
      await fetchServer(server.id, user.id);
    } finally {
      setActionLoading(false);
    }
  };

  const handleSaveRam = async () => {
    if (server.status !== 'Stopped') return setError(t('errors.stop_ram'));
    if (newRam < 2 || newRam > 32) return setError(t('errors.ram_range'));
    setActionLoading(true);
    try {
      const { error } = await supabase.from('servers').update({ ram: newRam }).eq('id', server.id);
      if (error) throw error;
      setServer(prev => ({ ...prev, ram: newRam }));
      setEditingRam(false);
    } catch (e) { setError(e.message); }
    finally { setActionLoading(false); }
  };

  const handleSaveMotd = async () => {
    setSavingMotd(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("No active session");

      const { error: dbError } = await supabase
        .from('servers')
        .update({ motd: motdText })
        .eq('id', server.id);
      
      if (dbError) throw dbError;

      const propsRes = await fetch(`/api/servers/${server.id}/properties`, {
        headers: { 'Authorization': `Bearer ${session.access_token}` }
      });
      
      if (propsRes.ok) {
        let propsText = await propsRes.text();
        if (propsText.includes('motd=')) {
          propsText = propsText.replace(/^motd=.*$/m, `motd=${motdText}`);
        } else {
          propsText += `\nmotd=${motdText}`;
        }
        
        await fetch(`/api/servers/${server.id}/properties`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'text/plain',
            'Authorization': `Bearer ${session.access_token}`
          },
          body: propsText
        });
      }

      setServer(prev => ({ ...prev, motd: motdText }));
      setIsEditingMotd(false);
    } catch (e) {
      setError(t('errors.save_motd'));
      console.error(e);
    } finally {
      setSavingMotd(false);
    }
  };

  // --- Render Helpers ---

  const { software: displaySoftware, version: displayVersion } = getDisplayInfo(server, t);

  if (!user || loading) return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900 flex items-center justify-center">
      <div className="flex flex-col items-center">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-indigo-600 border-t-transparent"></div>
        <p className="mt-4 text-gray-500 dark:text-gray-400 font-medium">{t('loading')}</p>
      </div>
    </div>
  );

  if (!server) return <div className="p-10 text-center dark:text-gray-400">{t('not_found')}</div>;

  const status = server.status || 'Unknown';
  const isRunning = status === 'Running';
  const isStopped = status === 'Stopped';
  const isUnknown = status === 'Unknown';
  const isBusy = !isRunning && !isStopped && !isUnknown;
  
  // Define stuck states where we show the KILL button
  const isStuck = ['Initializing', 'Provisioning', 'Starting', 'Recreating', 'Stopping', 'Restarting'].includes(status);
  
  // Show Kill button if explicitly stuck
  const canKill = isStuck;

  const sType = (server.type || '').toLowerCase();
  const moddedTypes = ['forge', 'neoforge', 'fabric', 'quilt'];
  const pluginTypes = ['paper', 'spigot', 'purpur', 'folia', 'velocity', 'waterfall', 'bukkit'];
  const hybridTypes = ['arclight', 'mohist', 'magma'];
  const showMods = moddedTypes.includes(sType) || pluginTypes.includes(sType) || hybridTypes.includes(sType);
  
  let modLabel = t('tabs.mods');
  if (pluginTypes.includes(sType)) modLabel = t('tabs.plugins');
  if (hybridTypes.includes(sType)) modLabel = t('tabs.mods_plugins');

  const tabs = [
    { id: 'overview', label: t('tabs.overview'), icon: SignalIcon },
    { id: 'schedules', label: t('tabs.schedules'), icon: CalendarDaysIcon }, 
    { id: 'properties', label: t('tabs.properties'), icon: ServerIcon },
    { id: 'console', label: t('tabs.console'), icon: ClockIcon },
    { id: 'players', label: t('tabs.players'), icon: UserGroupIcon },
    { id: 'software', label: t('tabs.software'), icon: CpuChipIcon },
    ...(showMods ? [{ id: 'mods', label: modLabel, icon: PuzzlePieceIcon }] : []),
    { id: 'world', label: t('tabs.world'), icon: ServerIcon },
    { id: 'files', label: t('tabs.files'), icon: ClipboardDocumentIcon },
    { id: 'backups', label: t('tabs.backups'), icon: ArchiveBoxIcon },
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900 font-sans text-slate-900 dark:text-gray-100">
      <Header user={user} credits={credits} isLoading={creditsLoading} onLogout={() => { supabase.auth.signOut(); router.push('/login'); }} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <AnimatePresence>
          {error && (
            <motion.div 
              initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="mb-6 p-4 bg-red-50 text-red-700 rounded-xl border border-red-200 flex justify-between items-center shadow-sm"
            >
              <div className="flex items-center gap-3">
                <span className="bg-red-200 p-1 rounded-full"><XMarkIcon className="w-4 h-4 text-red-700" /></span>
                <span>{error}</span>
              </div>
              <button onClick={() => setError(null)} className="text-sm font-semibold hover:underline">{t('messages.dismiss', { defaultValue: 'Dismiss' })}</button>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700 p-6 mb-8">
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
            
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-1">
                <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">{server.name}</h1>
                <ServerStatusIndicator server={server} />
              </div>
              
              <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 mb-2">
                <span className="bg-gray-100 dark:bg-slate-700 px-2 py-0.5 rounded text-gray-700 dark:text-gray-300 font-medium capitalize">{server.game}</span>
                <span>•</span>
                <button 
                  onClick={handleCopyIp}
                  className="group flex items-center gap-1 hover:text-indigo-600 transition-colors"
                >
                  <span className="font-mono">{server.name}.spawnly.net</span>
                  {copiedIp ? <span className="text-green-600 text-xs font-bold">{t('actions.copied')}</span> : <ClipboardDocumentIcon className="w-4 h-4 opacity-50 group-hover:opacity-100" />}
                </button>
              </div>

              <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 h-8">
                {isEditingMotd ? (
                  <div className="flex items-center gap-2 w-full max-w-md animate-in fade-in zoom-in duration-200">
                    <input 
                      type="text" 
                      value={motdText}
                      onChange={(e) => setMotdText(e.target.value)}
                      className="flex-1 px-2 py-1 border border-indigo-300 rounded text-gray-900 dark:bg-slate-700 dark:text-gray-100 dark:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                      placeholder={t('properties.labels.motd', { defaultValue: 'Enter Server MOTD...' })}
                      maxLength={64}
                    />
                    <button 
                      onClick={handleSaveMotd}
                      disabled={savingMotd}
                      className="p-1 bg-green-100 text-green-700 rounded hover:bg-green-200 disabled:opacity-50"
                    >
                      {savingMotd ? <div className="w-4 h-4 border-2 border-green-600 border-t-transparent rounded-full animate-spin" /> : <CheckIcon className="w-4 h-4" />}
                    </button>
                    <button 
                      onClick={() => { setIsEditingMotd(false); setMotdText(server.motd || ''); }}
                      className="p-1 bg-gray-100 text-gray-600 rounded hover:bg-gray-200"
                    >
                      <XMarkIcon className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 group">
                    <span className="italic text-gray-600 dark:text-gray-400">“{motdText || t('messages.default_motd', { defaultValue: 'A Spawnly Server' })}”</span>
                    <button 
                      onClick={() => setIsEditingMotd(true)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 dark:text-gray-500 hover:text-indigo-600"
                      title={t('actions.edit_motd')}
                    >
                      <PencilSquareIcon className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {isStopped && (
                <button
                  onClick={() => handleServerAction('start')}
                  disabled={actionLoading}
                  className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl font-semibold shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {actionLoading ? <div className="animate-spin w-5 h-5 border-2 border-white/30 border-t-white rounded-full" /> : <PlayIcon className="w-5 h-5" />}
                  {t('actions.start')}
                </button>
              )}
              
              {(isRunning || isUnknown) && (
                <>
                  {isRunning && (
                    <button
                      onClick={() => handleServerAction('restart')}
                      disabled={actionLoading}
                      className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-white px-5 py-2.5 rounded-xl font-semibold shadow-sm transition-all disabled:opacity-50"
                    >
                      {actionLoading ? <div className="animate-spin w-5 h-5 border-2 border-white/30 border-t-white rounded-full" /> : <ArrowPathIcon className="w-5 h-5" />}
                      {t('actions.restart')}
                    </button>
                  )}
                  <button
                    onClick={() => handleServerAction('stop')}
                    disabled={actionLoading}
                    className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-5 py-2.5 rounded-xl font-semibold shadow-sm transition-all disabled:opacity-50"
                  >
                    <StopIcon className="w-5 h-5" />
                    {t('actions.stop')}
                  </button>
                </>
              )}
              
              {isBusy && (
                <button disabled className="flex items-center gap-2 bg-gray-100 dark:bg-slate-700 text-gray-400 px-5 py-2.5 rounded-xl font-semibold cursor-not-allowed">
                  <div className="animate-spin w-5 h-5 border-2 border-gray-400 border-t-transparent rounded-full" />
                  {t('status.processing')}
                </button>
              )}

              {/* NEW FORCE KILL BUTTON - Specific for Stuck States */}
              {canKill && (
                <button
                    onClick={() => handleServerAction('kill')}
                    disabled={actionLoading}
                    title="Force Kill (Delete VM)"
                    className="flex items-center gap-2 bg-red-800 hover:bg-red-900 text-white px-4 py-2.5 rounded-xl font-semibold shadow-sm transition-all disabled:opacity-50"
                >
                    <TrashIcon className="w-5 h-5" />
                    {t('actions.kill', { defaultValue: 'Kill' })}
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="mb-8 overflow-x-auto">
          <div className="flex items-center gap-2 min-w-max border-b border-gray-200 dark:border-slate-700 pb-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`relative px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-medium transition-colors ${
                  activeTab === tab.id 
                    ? 'text-indigo-600 bg-indigo-50' 
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-slate-800'
                }`}
              >
                <tab.icon className="w-5 h-5" />
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

        <div className="min-h-[400px]">
          <Suspense fallback={<div className="text-center py-12 text-gray-400">{t('loading')}</div>}>
            
            {activeTab === 'overview' && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700 flex flex-col justify-between">
                  <div>
                    <h3 className="text-gray-500 dark:text-gray-400 text-sm font-semibold uppercase tracking-wider mb-4 flex items-center gap-2">
                      <SignalIcon className="w-4 h-4" /> {t('connection.title')}
                    </h3>
                    <div 
                      onClick={handleCopyIp}
                      className="group cursor-pointer bg-gray-50 dark:bg-slate-700 hover:bg-indigo-50 dark:hover:bg-indigo-900/50 border border-gray-200 dark:border-slate-600 hover:border-indigo-200 dark:hover:border-indigo-600 rounded-xl p-4 text-center transition-all"
                    >
                      <p className="text-sm text-gray-500 dark:text-gray-300 mb-1">{t('connection.address')}</p>
                      <p className="text-xl font-mono font-bold text-gray-900 dark:text-gray-100 break-all">{server.name}.spawnly.net</p>
                      <p className="text-xs text-indigo-600 mt-2 font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                        {copiedIp ? t('actions.copied') : t('actions.copy_ip')}
                      </p>
                    </div>
                  </div>
                  <div className="mt-6 pt-6 border-t border-gray-100 dark:border-slate-700">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm text-gray-600 dark:text-gray-300">{t('connection.software')}</span>
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100 capitalize truncate max-w-[150px] text-right" title={displaySoftware}>
                        {displaySoftware}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600 dark:text-gray-300">{t('connection.version')}</span>
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{displayVersion}</span>
                    </div>
                  </div>
                </div>

                <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700 md:col-span-2 flex flex-col">
                  <h3 className="text-gray-500 dark:text-gray-400 text-sm font-semibold uppercase tracking-wider mb-4 flex items-center gap-2">
                    <CpuChipIcon className="w-4 h-4" /> {t('resources.title')}
                  </h3>
                  <div className="flex flex-col flex-1 gap-4">
                    {isRunning ? (
                      <>
                        <ServerMetrics server={server} />
                        <div className="mt-auto pt-4 border-t border-gray-100 dark:border-slate-700 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <UserGroupIcon className="w-5 h-5 text-gray-400" />
                            <span className="text-sm font-medium text-gray-600 dark:text-gray-300">{t('resources.active_players')}</span>
                          </div>
                          <div className="text-right">
                            <span className="text-2xl font-bold text-gray-900 dark:text-gray-100">{server.player_count || 0}</span>
                            <span className="text-gray-400 text-sm font-medium ml-1">/ {server.max_players || 20}</span>
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="flex-1 flex flex-col items-center justify-center text-gray-400 bg-gray-50 dark:bg-slate-700 rounded-xl border border-dashed border-gray-200 dark:border-slate-600 h-40">
                        <ServerIcon className="w-8 h-8 mb-2 opacity-50" />
                        <p>{t('resources.server_offline')}</p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700">
                  <h3 className="text-gray-500 dark:text-gray-400 text-sm font-semibold uppercase tracking-wider mb-4 flex items-center gap-2">
                    <ClockIcon className="w-4 h-4" /> {t('config.title')}
                  </h3>
                  
                  <div className="mb-6">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{t('config.auto_stop')}</label>
                    <div className="flex items-center gap-2">
                      <select
                        value={server.auto_stop_timeout ?? 30}
                        onChange={handleAutoStopChange}
                        disabled={savingAutoStop}
                        className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm bg-gray-50 dark:bg-slate-700"
                      >
                        <option value="0">{t('config.auto_stop_never')}</option>
                        <option value="5">{t('config.auto_stop_5m')}</option>
                        <option value="15">{t('config.auto_stop_15m')}</option>
                        <option value="30">{t('config.auto_stop_30m')}</option>
                        <option value="60">{t('config.auto_stop_1h')}</option>
                      </select>
                      {savingAutoStop && <div className="animate-spin h-4 w-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />}
                    </div>
                    {autoStopCountdown && (
                      <div className="mt-2 p-2 bg-amber-50 dark:bg-amber-900/50 text-amber-800 dark:text-amber-300 text-xs rounded-lg flex items-center gap-2 animate-pulse border border-amber-100 dark:border-amber-900">
                        <ClockIcon className="w-3 h-3" /> {autoStopCountdown}
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{t('config.ram_allocation')}</label>
                    {editingRam ? (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <input
                            type="range" min="2" max="32" step="1"
                            value={newRam} onChange={(e) => setNewRam(Number(e.target.value))}
                            className="w-full h-2 bg-gray-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                          />
                          <span className="text-sm font-bold w-12 text-right">{newRam}GB</span>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={handleSaveRam} className="flex-1 bg-indigo-600 text-white text-xs py-1.5 rounded-lg hover:bg-indigo-700">{t('actions.save')}</button>
                          <button onClick={() => setEditingRam(false)} className="flex-1 bg-gray-200 text-gray-700 text-xs py-1.5 rounded-lg hover:bg-gray-300">{t('actions.cancel')}</button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex justify-between items-center bg-gray-50 dark:bg-slate-700 p-3 rounded-xl border border-gray-200 dark:border-slate-600">
                        <span className="font-mono font-bold text-gray-800 dark:text-gray-100">{server.ram} GB</span>
                        {isStopped && (
                          <button 
                            onClick={() => { setNewRam(server.ram); setEditingRam(true); }} 
                            className="text-xs text-indigo-600 font-medium hover:text-indigo-800"
                          >
                            {t('config.edit_ram')}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700 md:col-span-2">
                  <h3 className="text-gray-500 dark:text-gray-400 text-sm font-semibold uppercase tracking-wider mb-4 flex items-center gap-2">
                    <CurrencyDollarIcon className="w-4 h-4" /> {t('billing.title')}
                  </h3>
                  <div className="flex items-center gap-8">
                    <div>
                      <p className="text-sm text-gray-500 dark:text-gray-400">{t('billing.hourly_cost')}</p>
                      <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{server.cost_per_hour} <span className="text-sm font-normal text-gray-500 dark:text-gray-400">{t('billing.credits_hr')}</span></p>
                    </div>
                    <div className="h-10 w-px bg-gray-200 dark:bg-slate-700"></div>
                    <div>
                      <p className="text-sm text-gray-500 dark:text-gray-400">{t('billing.est_runtime')}</p>
                      <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                        {(credits / (server.cost_per_hour || 1)).toFixed(1)} <span className="text-sm font-normal text-gray-500 dark:text-gray-400">{t('billing.hours_left')}</span>
                      </p>
                    </div>
                  </div>
                  {credits < server.cost_per_hour && (
                    <div className="mt-4 bg-red-50 text-red-700 text-sm p-3 rounded-lg flex items-center gap-2">
                      <span className="font-bold">{t('billing.warning_low')}</span>
                    </div>
                  )}
                </div>

              </div>
            )}

            <div className={activeTab === 'overview' ? 'hidden' : 'block animate-in fade-in duration-300'}>
              {activeTab === 'properties' && (
                <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700">
                  <ServerPropertiesEditor server={server} />
                </div>
              )}

              {activeTab === 'schedules' && (
                <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700">
                  <SchedulesTab server={server} />
                </div>
              )}

              {activeTab === 'console' && (
                <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700">
                  <ConsoleViewer server={server} />
                </div>
              )}

              {activeTab === 'players' && (
                <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700">
                  {fileToken ? <PlayersTab server={server} token={fileToken} /> : <p className="text-center text-gray-500 dark:text-gray-400">{t('status.authenticating', { defaultValue: 'Authenticating...' })}</p>}
                </div>
              )}

              {activeTab === 'software' && <ServerSoftwareTab server={server} onSoftwareChange={handleSoftwareChange} />}
              {activeTab === 'mods' && <ModsPluginsTab server={server} />}

              {activeTab === 'world' && (
                <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700">
                  {fileToken ? <WorldTab server={server} token={fileToken} /> : <p className="text-center text-gray-500 dark:text-gray-400">{t('status.authenticating', { defaultValue: 'Authenticating...' })}</p>}
                </div>
              )}

              {activeTab === 'files' && (
                <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700">
                  {fileToken ? <FileManager server={server} token={fileToken} setActiveTab={setActiveTab} /> : <p className="text-center text-gray-500 dark:text-gray-400">{t('status.authenticating_files', { defaultValue: 'Authenticating file access...' })}</p>}
                </div>
              )}

              {activeTab === 'backups' && (
                <BackupsTab server={server} />
              )}
            </div>

          </Suspense>
        </div>
      </main>
      <Footer />
    </div>
  );
}

// --- REQUIRED FOR NEXT-I18NEXT ---
export async function getServerSideProps(context) {
  const { id } = context.params || {};
  if (!id) return { notFound: true };

  const translations = await serverSideTranslations(context.locale, [
    'common',
    'server',
    'dashboard' // Ensure dismissal texts etc are loaded
  ]);

  try {
    const { createClient } = require('@supabase/supabase-js');
    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return { props: { ...translations, initialServer: null } };

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data, error } = await supabaseAdmin.from('servers').select('*').eq('id', id).single();

    if (error || !data) return { notFound: true };

    return { 
      props: { 
        ...translations, 
        initialServer: data 
      } 
    };

  } catch (err) {
    console.error('SSR Error:', err);
    return { 
      props: { 
        ...translations, 
        initialServer: null 
      } 
    };
  }
}