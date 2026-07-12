/* eslint-disable react-hooks/exhaustive-deps */
import { useRouter } from 'next/router';
import { supabase } from '../../lib/supabaseClient';
import { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { debounce } from 'lodash';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'next-i18next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import { 
  ClipboardDocumentIcon, PlayIcon, StopIcon, ArrowPathIcon, CpuChipIcon, 
  CurrencyDollarIcon, ClockIcon, ServerIcon, SignalIcon, UserGroupIcon, 
  PuzzlePieceIcon, PencilSquareIcon, CheckIcon, XMarkIcon, ArchiveBoxIcon, 
  CalendarDaysIcon, TrashIcon, ShieldCheckIcon, BanknotesIcon, PlusIcon,
  ArrowsPointingOutIcon, ExclamationTriangleIcon
} from '@heroicons/react/24/outline';

// Components
import ServerSoftwareTab from '../../components/ServerSoftwareTab';
import ServerSoftwareTabSteam from '../../components/ServerSoftwareTabSteam';
import ModsPluginsTab from '../../components/ModsPluginsTab';
import ModsPluginsTabSteam from '../../components/ModsPluginsTabSteam';
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
import AccessTab from '../../components/AccessTab';
import ServerTour from '../../components/ServerTour';
import { getAvailableRamTiers, getMonthlyCreditCost, getHourlyCreditCost } from '../../lib/config';

const getOnlinePlayersArray = (server) => {
  if (server?.game_status !== 'Running' || !server?.players_online) return [];
  return server.players_online.split(', ').filter(Boolean);
};

const showStatusNotification = (serverName, t) => {
  if (typeof window !== 'undefined' && 'Notification' in window) {
    if (Notification.permission === 'granted') {
      new Notification(t('notifications.ready_title', { serverName }), { body: t('notifications.ready_body', { serverName }), icon: '/logo.png', vibrate: [200, 100, 200] });
    } else if (Notification.permission !== 'denied') {
      Notification.requestPermission();
    }
  }
};

const getDisplayInfo = (server, t) => {
  if (!server) return { software: t ? t('software.unknown') : 'Unknown', version: t ? t('software.unknown') : 'Unknown' };
  let software = server.type || 'Vanilla';
  let version = server.version || '';
  if (server.type?.startsWith('modpack-')) {
    const providerRaw = server.type.replace('modpack-', '');
    const provider = providerRaw.charAt(0).toUpperCase() + providerRaw.slice(1);
    software = t ? `${t('software.modpack')} (${provider})` : `Modpack (${provider})`;
    if (server.version?.includes('::')) {
      const parts = server.version.split('::');
      if (parts[1]) version = parts[1];
      if (parts[2]) software = `${parts[2]} (${provider})`; 
    }
  }
  return { software, version };
};

const ContributeModal = ({ isOpen, onClose, pool, userCredits, onContribute }) => {
  const { t } = useTranslation('server');
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async () => {
    if (!amount || isNaN(amount) || amount <= 0) return;
    setLoading(true); await onContribute(Number(amount)); setLoading(false); setAmount('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl w-full max-w-sm shadow-2xl border border-gray-200 dark:border-slate-700">
        <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">{t('contribute.title', 'Contribute to Server')}</h3>
        <p className="text-sm text-gray-500 mb-4">{t('contribute.desc_prefix', 'Add credits to ')}<span className="font-semibold text-indigo-600">{pool?.name || 'Pool'}</span>.</p>
        <div className="bg-gray-50 dark:bg-slate-700 p-3 rounded-lg mb-4 flex justify-between items-center"><span className="text-xs text-gray-500 dark:text-gray-300">{t('contribute.wallet', 'Your Wallet')}</span><span className="font-bold text-slate-900 dark:text-white">{userCredits.toFixed(2)}</span></div>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">{t('contribute.amount', 'Amount')}</label>
            <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full px-3 py-2 border rounded-lg dark:bg-slate-900 dark:border-slate-600 dark:text-white focus:ring-2 focus:ring-indigo-500" placeholder="100" />
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={onClose} className="flex-1 py-2 text-sm font-medium text-gray-500 hover:text-gray-700 dark:hover:text-gray-200">{t('actions.cancel', 'Cancel')}</button>
            <button onClick={handleSubmit} disabled={loading || !amount} className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-bold shadow-md disabled:opacity-50 flex justify-center items-center gap-2">
              {loading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <BanknotesIcon className="w-4 h-4" />} {t('contribute.donate', 'Donate')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// --- RESTORED SCALE MODAL ---
const ScaleServerModal = ({ isOpen, onClose, server, userCredits, onScale }) => {
    const { t } = useTranslation('server');
    const [targetRam, setTargetRam] = useState(server?.ram || 4);
    const [loading, setLoading] = useState(false);
  
    if (!isOpen || !server) return null;
  
    const availableTiers = getAvailableRamTiers();
    const now = new Date();
    const lastBilled = new Date(server.last_billed_at || server.created_at);
    const elapsedDays = Math.max(0, (now - lastBilled) / (1000 * 60 * 60 * 24));
    const remainingDays = Math.min(30, Math.max(0, 30 - elapsedDays));
    const oldMonthlyCost = getMonthlyCreditCost(server.ram);
    const newMonthlyCost = getMonthlyCreditCost(targetRam);
    const oldDaily = oldMonthlyCost / 30;
    const newDaily = newMonthlyCost / 30;
    const netCharge = Number(((newDaily - oldDaily) * remainingDays).toFixed(2));
    const currentBalance = server.pool ? server.pool.balance : userCredits;
    const isInsufficient = netCharge > 0 && currentBalance < netCharge;
  
    const handleSubmit = async () => {
      if (targetRam === server.ram) return;
      setLoading(true); await onScale(targetRam); setLoading(false);
    };
  
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
        <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl w-full max-w-md shadow-2xl border border-gray-200 dark:border-slate-700 flex flex-col max-h-[90vh] overflow-y-auto">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-indigo-100 dark:bg-indigo-900/50 rounded-lg text-indigo-600 dark:text-indigo-400"><ArrowsPointingOutIcon className="w-6 h-6" /></div>
            <div><h3 className="text-lg font-bold text-slate-900 dark:text-white leading-tight">{t('scale.title', 'Scale Server RAM')}</h3><p className="text-sm text-gray-500 dark:text-gray-400">{t('scale.desc', 'Modify hardware allocation dynamically.')}</p></div>
          </div>
          <div className="space-y-5">
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 rounded-xl p-4 flex gap-3 text-amber-800 dark:text-amber-300">
                <ExclamationTriangleIcon className="w-5 h-5 flex-shrink-0 mt-0.5" />
                <div className="text-sm"><strong>{t('scale.downtime_label', 'Expected Downtime:')}</strong> {t('scale.downtime_desc', 'Scaling requires the server to be forcefully stopped and re-provisioned. Expect ~60 seconds of downtime.')}</div>
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">{t('scale.select_tier', 'Select New RAM Tier')}</label>
              <select value={targetRam} onChange={(e) => setTargetRam(Number(e.target.value))} className="w-full px-3 py-2.5 border rounded-xl bg-gray-50 dark:bg-slate-900 border-gray-300 dark:border-slate-600 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 font-medium">
                {availableTiers.map(tier => (<option key={tier} value={tier}>{t('scale.tier_option', { tier, cost: getMonthlyCreditCost(tier), defaultValue: '{{tier}} GB RAM — {{cost}} Credits/mo' })}</option>))}
              </select>
            </div>
            <div className="bg-gray-50 dark:bg-slate-700/50 p-4 rounded-xl border border-gray-200 dark:border-slate-600 space-y-2">
                <div className="flex justify-between text-sm text-gray-600 dark:text-gray-300"><span>{t('scale.current_plan', 'Current Plan')}</span><span>{oldMonthlyCost} cr</span></div>
                <div className="flex justify-between text-sm text-gray-600 dark:text-gray-300"><span>{t('scale.new_plan', 'New Plan')}</span><span>{newMonthlyCost} cr</span></div>
                <div className="flex justify-between items-center pt-2 border-t border-gray-200 dark:border-slate-600">
                    <span className="text-sm font-bold text-gray-900 dark:text-white">{netCharge > 0 ? t('scale.prorated_due', 'Prorated Cost Due') : t('scale.prorated_refund', 'Prorated Refund')}</span>
                    <span className={`text-lg font-bold ${netCharge > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>{netCharge > 0 ? `-${netCharge.toFixed(2)} cr` : `+${Math.abs(netCharge).toFixed(2)} cr`}</span>
                </div>
            </div>
            {netCharge > 0 && (
                <div className={`text-sm p-3 rounded-lg flex justify-between items-center ${isInsufficient ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-slate-700'}`}>
                    <span>{t('scale.available_balance', 'Available Balance:')}</span><span className="font-bold font-mono">{Number(currentBalance).toFixed(2)} cr</span>
                </div>
            )}
            <div className="flex gap-3 pt-2">
              <button onClick={onClose} disabled={loading} className="flex-1 py-2.5 text-sm font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 dark:bg-slate-700 dark:text-gray-200 dark:hover:bg-slate-600 rounded-xl transition-colors">{t('actions.cancel')}</button>
              <button onClick={handleSubmit} disabled={loading || targetRam === server.ram || isInsufficient} className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold shadow-md disabled:opacity-50 transition-colors flex justify-center items-center gap-2">
                {loading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : t('scale.confirm', 'Confirm & Scale')}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
};

export default function ServerDetailPage({ initialServer }) {
  const router = useRouter();
  const { id } = router.query;
  const { t } = useTranslation('server');

  const [server, setServer] = useState(initialServer);
  const [loading, setLoading] = useState(!initialServer);
  const [activeTab, setActiveTab] = useState('overview');
  const [user, setUser] = useState(null);
  const [credits, setCredits] = useState(0);
  const [creditsLoading, setCreditsLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState(null);
  const [fileToken, setFileToken] = useState(null);
  
  const [isLocalProvisioning, setIsLocalProvisioning] = useState(false);
  
  const [editingRam, setEditingRam] = useState(false);
  const [newRam, setNewRam] = useState(null);
  const [showScaleModal, setShowScaleModal] = useState(false);
  const [savingAutoUpdate, setSavingAutoUpdate] = useState(false);
  
  const [onlinePlayers, setOnlinePlayers] = useState(getOnlinePlayersArray(initialServer));
  const [runTour, setRunTour] = useState(false);

  const [isOwner, setIsOwner] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false); 
  const [myPerms, setMyPerms] = useState({}); 

  const [autoStopCountdown, setAutoStopCountdown] = useState(null);
  const [savingAutoStop, setSavingAutoStop] = useState(false);
  const [copiedIp, setCopiedIp] = useState(false);
  const [isEditingMotd, setIsEditingMotd] = useState(false);
  const [motdText, setMotdText] = useState(initialServer?.motd || '');
  const [savingMotd, setSavingMotd] = useState(false);

  const [pools, setPools] = useState([]);
  const [savingPool, setSavingPool] = useState(false);
  const [showContributeModal, setShowContributeModal] = useState(false);

  const profileChannelRef = useRef(null);
  const serverChannelRef = useRef(null);
  const mountedRef = useRef(false);
  const pollRef = useRef(null);
  const countdownIntervalRef = useRef(null);
  const prevGameStatusRef = useRef(initialServer?.game_status); 

  useEffect(() => {
    const qTab = router?.query?.tab;
    if (qTab && typeof qTab === 'string') setActiveTab(qTab);
  }, [router?.query?.tab]);

  useEffect(() => {
    mountedRef.current = true;
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') Notification.requestPermission();

    const fetchSessionAndData = async () => {
      setLoading(true); setCreditsLoading(true);
      try {
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (sessionError || !sessionData?.session) return router.push('/login');

        const userData = sessionData.session.user;
        setUser(userData);
        
        const { data: profile } = await supabase.from('profiles').select('credits, server_tour_completed, is_admin').eq('id', userData.id).single();

        if (profile) {
            setCredits(profile.credits || 0);
            setIsAdmin(!!profile.is_admin); 
            if (!profile.server_tour_completed) setRunTour(true);
        }
        setCreditsLoading(false);

        let currentServer = server;
        if (id) {
          const { data } = await supabase.from('servers').select('*, pool:credit_pools(*)').eq('id', id).single();
          if (data) { currentServer = data; setServer(data); setMotdText(data.motd || ''); }
        }

        if (currentServer && userData) {
            const owner = currentServer.user_id === userData.id;
            setIsOwner(owner);

            if (owner) {
                setMyPerms({ control: true, console: true, files: true, settings: true, schedules: true, players: true, software: true, mods: true, world: true, backups: true });
                const { data: userPools } = await supabase.from('credit_pools').select('*').eq('owner_id', userData.id);
                if (userPools) setPools(userPools);
            } else {
                const { data: perm } = await supabase.from('server_permissions').select('permissions').eq('server_id', id).eq('user_id', userData.id).single();
                setMyPerms(perm?.permissions || {});
            }
        }
      } catch (err) { setError(t('errors.load_session')); } finally { setLoading(false); }
    };

    fetchSessionAndData();
    return () => { mountedRef.current = false; cleanupResources(); };
  }, [id]);

  useEffect(() => {
    if (!id || !user?.id) return;
    if (serverChannelRef.current) supabase.removeChannel(serverChannelRef.current);

    const serverChannel = supabase
      .channel(`server-changes-${id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'servers', filter: `id=eq.${id}` }, async (payload) => {
          if (!mountedRef.current) return;
          const updated = payload.new;
          setServer((prev) => {
             const merged = { ...prev, ...updated };
             if (!isEditingMotd && updated.motd !== prev.motd) setMotdText(updated.motd);
             return merged;
          });
          if (updated.pool_id) {
             const { data: poolData } = await supabase.from('credit_pools').select('*').eq('id', updated.pool_id).single();
             setServer(prev => ({ ...prev, pool: poolData }));
          } else setServer(prev => ({ ...prev, pool: null }));
          setError(null);
        }
      ).subscribe();

    serverChannelRef.current = serverChannel;
    return () => { if (serverChannelRef.current) supabase.removeChannel(serverChannelRef.current); };
  }, [id, user?.id, isEditingMotd]);

  useEffect(() => {
    if (!id || !user?.id) return;
    const heartbeat = setInterval(() => { if (!document.hidden && !pollRef.current && mountedRef.current) fetchServer(id); }, 15000); 
    return () => clearInterval(heartbeat);
  }, [id, user?.id]);

  useEffect(() => {
    if (!server?.id || fileToken || !user) return;
    if (myPerms.files || myPerms.world || myPerms.players) {
        const fetchFileToken = async (retries = 3, delay = 1000) => {
        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                const { data: { session } } = await supabase.auth.getSession();
                if (!session) return;
                const response = await fetch(`/api/servers/get-token?serverId=${server.id}`, { headers: { Authorization: `Bearer ${session.access_token}` } });
                const data = await response.json();
                if (response.ok && data.token && mountedRef.current) return setFileToken(data.token);
            } catch (err) { await new Promise((resolve) => setTimeout(resolve, delay)); }
        }
        };
        fetchFileToken();
    }
  }, [server?.id, user, myPerms]);

  useEffect(() => { setOnlinePlayers(getOnlinePlayersArray(server)); }, [server?.players_online, server?.game_status]);

  useEffect(() => {
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    const hasActivePlayers = server?.player_count && server.player_count > 0;
    if (server?.game_status === 'Running' && server?.last_empty_at && server?.auto_stop_timeout > 0 && !hasActivePlayers && server?.billing_type !== 'monthly') {
      const updateCountdown = () => {
        const diff = (new Date(server.last_empty_at).getTime() + (server.auto_stop_timeout * 60 * 1000)) - Date.now();
        if (diff <= 0) setAutoStopCountdown(t('config.stopping_soon'));
        else setAutoStopCountdown(t('config.stopping_in', { time: `${Math.floor(diff / 60000)}m ${Math.floor((diff % 60000) / 1000)}s` }));
      };
      updateCountdown(); countdownIntervalRef.current = setInterval(updateCountdown, 1000);
    } else setAutoStopCountdown(null);
    return () => { if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current); };
  }, [server?.game_status, server?.last_empty_at, server?.auto_stop_timeout, server?.player_count, server?.billing_type, t]);

  useEffect(() => {
    const currentStatus = server?.game_status;
    if (['Starting', 'Running'].includes(currentStatus)) {
        setIsLocalProvisioning(false);
    }
    const prevStatus = prevGameStatusRef.current;
    if (['Starting', 'Provisioning', 'Recreating', 'Installing'].includes(prevStatus) && currentStatus === 'Running') {
        showStatusNotification(server?.name, t);
    }
    prevGameStatusRef.current = currentStatus;
  }, [server?.game_status, server?.name, t]); 

  const cleanupResources = () => {
    try {
      if (profileChannelRef.current) supabase.removeChannel(profileChannelRef.current);
      if (serverChannelRef.current) supabase.removeChannel(serverChannelRef.current);
      if (pollRef.current) clearInterval(pollRef.current);
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    } catch (e) {}
  };

  const fetchUserCredits = async (userId) => {
    setCreditsLoading(true);
    const { data } = await supabase.from('profiles').select('credits').eq('id', userId).single();
    if (data && mountedRef.current) { setCredits(data.credits || 0); setCreditsLoading(false); }
  };

  const safeFetchJson = async (url, opts = {}) => {
    const res = await fetch(url, opts);
    if (!res.ok) throw new Error((await res.json()).error || `HTTP ${res.status}`);
    return res.json();
  };

  const fetchServer = useCallback(
    debounce(async (serverId) => {
      const { data } = await supabase.from('servers').select('*, pool:credit_pools(*)').eq('id', serverId).single();
      if (data && mountedRef.current) {
        setServer(prev => (JSON.stringify(prev) === JSON.stringify(data) ? prev : data));
        if (!isEditingMotd) setMotdText(data.motd || '');
      }
    }, 1000), [isEditingMotd]
  );

  const pollUntilStatus = (expectedStatuses, timeout = 120000) => {
    if (pollRef.current) clearInterval(pollRef.current);
    const startTime = Date.now();
    pollRef.current = setInterval(() => {
      fetchServer(id);
      if (expectedStatuses.includes(server?.game_status) || Date.now() - startTime > timeout) {
        clearInterval(pollRef.current); pollRef.current = null; 
        if (Date.now() - startTime > timeout) setError(t('errors.timeout'));
      }
    }, 3000);
  };

  const handleCopyIp = () => {
    if (!server?.name) return;
    navigator.clipboard.writeText(`${server.name}.spawnly.net`);
    setCopiedIp(true); setTimeout(() => setCopiedIp(false), 2000);
  };

  const handleSoftwareChange = (newConfig) => setServer(prev => ({ ...prev, ...newConfig }));

  const handleAutoStopChange = async (e) => {
    if (!isOwner && !myPerms.settings) return setError(t('errors.no_permission', 'Permission denied'));
    const val = parseInt(e.target.value, 10);
    setSavingAutoStop(true);
    try {
      await supabase.from('servers').update({ auto_stop_timeout: val }).eq('id', server.id);
      setServer(prev => ({ ...prev, auto_stop_timeout: val }));
    } catch (e) { setError(t('errors.update_auto_stop')); } finally { setSavingAutoStop(false); }
  };

  const handleAutoUpdateChange = async (e) => {
    if (!isOwner && !myPerms.settings) return setError(t('errors.no_permission', 'Permission denied'));
    const val = e.target.checked;
    setSavingAutoUpdate(true);
    try {
      await supabase.from('servers').update({ auto_update: val }).eq('id', server.id);
      setServer(prev => ({ ...prev, auto_update: val }));
    } catch (e) { 
      setError(t('errors.update_auto_update', "Failed to update auto-update settings.")); 
    } finally { 
      setSavingAutoUpdate(false); 
    }
  };

  const handlePoolChange = async (e) => {
    if (!isOwner) return;
    const val = e.target.value === 'personal' ? null : e.target.value;
    setSavingPool(true);
    try {
        await supabase.from('servers').update({ pool_id: val }).eq('id', server.id);
        let newPoolData = null;
        if (val) newPoolData = (await supabase.from('credit_pools').select('*').eq('id', val).single()).data;
        setServer(prev => ({ ...prev, pool_id: val, pool: newPoolData }));
    } catch (err) { setError(t('errors.update_billing', "Failed to update billing source.")); } finally { setSavingPool(false); }
  };

  const handleContribute = async (amount) => {
      if (!server.pool_id) return;
      try {
        await supabase.rpc('transfer_credits_to_pool', { p_pool_id: server.pool_id, p_amount: amount });
        await fetchUserCredits(user.id); await fetchServer(server.id); setShowContributeModal(false); alert(t('contribute.success', "Contribution successful!"));
      } catch (e) { alert(t('contribute.failed', { message: e.message, defaultValue: "Contribution failed: {{message}}" })); }
  };

  const handleScaleServer = async (targetRam) => {
    setError(null);
    try {
        const { data: { session } } = await supabase.auth.getSession();
        await safeFetchJson(`/api/servers/${server.id}/scale`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` }, body: JSON.stringify({ newRam: targetRam }) });
        setShowScaleModal(false); await fetchServer(server.id); await fetchUserCredits(user.id);
        if (server.game_status !== 'Stopped') pollUntilStatus(['Running', 'Stopped']);
    } catch (e) { setError(e.message); }
  };

  const handleServerAction = async (action, event = null) => {
    if (!myPerms.control) return setError(t('errors.no_permission_control', "You do not have permission to control this server."));
    if (actionLoading) return;
    
    let finalAction = action;
    if (action === 'restart' && event?.shiftKey) {
        finalAction = 'hard_restart';
        if (!confirm(t('messages.confirm_hard_restart', 'Are you sure you want to perform a HARD RESTART? This will power-cycle the entire VPS hardware instead of just safely restarting the game.'))) return;
    }
    if (finalAction === 'kill' && !confirm(t('messages.confirm_kill', 'Are you sure you want to force kill the server?'))) return;

    setActionLoading(true); setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error(t('errors.no_session', "No active session"));

      const hasHardware = !!server.hetzner_id;

      if (finalAction === 'start' && !hasHardware) {
        setIsLocalProvisioning(true);
        setServer(p => ({ ...p, status: 'Installing', game_status: 'Installing' }));
        
        const { data: sData } = await supabase.from('servers').select('type, version, pending_type, pending_version').eq('id', server.id).single();
        const { data: installed } = await supabase.from('installed_software').select('*').eq('server_id', server.id);
        
        await safeFetchJson('/api/servers/provision', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` }, body: JSON.stringify({ serverId: server.id, type: sData.pending_type || sData.type, version: sData.pending_version || sData.version, installedSoftware: installed }) });
        
        if (sData.pending_type || sData.pending_version) await supabase.from('servers').update({ pending_type: null, pending_version: null }).eq('id', server.id);
        pollUntilStatus(['Starting', 'Running']);
      } else {
        let targetStatus = 'Stopping';
        if (finalAction === 'restart' || finalAction === 'hard_restart') targetStatus = 'Restarting';
        if (finalAction === 'start') targetStatus = 'Starting';
        
        setServer(p => ({ ...p, game_status: targetStatus }));
        await safeFetchJson('/api/servers/action', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` }, body: JSON.stringify({ serverId: server.id, action: finalAction }) });
        pollUntilStatus((finalAction === 'restart' || finalAction === 'hard_restart' || finalAction === 'start') ? ['Running'] : ['Stopped']);
      }
    } catch (e) {
      setError(t('errors.failed_action', { action: finalAction, message: e.message }));
      await fetchServer(server.id);
    } finally { setActionLoading(false); }
  };

  const handleSaveRam = async () => {
    if (!isOwner) return setError(t('errors.only_owner_ram', "Only owner can change RAM billing"));
    if (server.status !== 'Stopped') return setError(t('errors.stop_ram'));
    if (!getAvailableRamTiers().includes(newRam)) return setError(t('errors.ram_range'));

    setActionLoading(true);
    try {
      const newHourlyCost = getHourlyCreditCost(newRam);
      await supabase.from('servers').update({ ram: newRam, cost_per_hour: newHourlyCost }).eq('id', server.id);
      setServer(prev => ({ ...prev, ram: newRam, cost_per_hour: newHourlyCost })); setEditingRam(false);
    } catch (e) { setError(e.message); } finally { setActionLoading(false); }
  };

  const handleSaveMotd = async () => {
    if (!isOwner && !myPerms.settings) return setError(t('errors.permission_denied', "Permission denied"));
    setSavingMotd(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      await supabase.from('servers').update({ motd: motdText }).eq('id', server.id);

      if (!server.game || server.game === 'minecraft') {
        const propsRes = await fetch(`/api/servers/${server.id}/properties`, { headers: { 'Authorization': `Bearer ${session.access_token}` } });
        if (propsRes.ok) {
          let propsText = await propsRes.text();
          propsText = propsText.includes('motd=') ? propsText.replace(/^motd=.*$/m, `motd=${motdText}`) : propsText + `\nmotd=${motdText}`;
          await fetch(`/api/servers/${server.id}/properties`, { method: 'POST', headers: { 'Content-Type': 'text/plain', 'Authorization': `Bearer ${session.access_token}` }, body: propsText });
        }
      }
      setServer(prev => ({ ...prev, motd: motdText })); setIsEditingMotd(false);
    } catch (e) { setError(t('errors.save_motd')); } finally { setSavingMotd(false); }
  };

  const getNextBillingDate = () => {
    if (!server.created_at) return t('billing.unknown', 'Unknown');
    const created = new Date(server.created_at); const now = new Date(); let next = new Date(created);
    while (next <= now) next.setMonth(next.getMonth() + 1);
    return next.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const { software: displaySoftware, version: displayVersion } = getDisplayInfo(server, t);

  if (!user || loading) return <div className="min-h-screen bg-gray-50 dark:bg-slate-900 flex items-center justify-center"><div className="flex flex-col items-center"><div className="animate-spin rounded-full h-12 w-12 border-4 border-indigo-600 border-t-transparent"></div><p className="mt-4 text-gray-500 dark:text-gray-400 font-medium">{t('loading')}</p></div></div>;
  if (!server) return <div className="p-10 text-center dark:text-gray-400">{t('not_found')}</div>;

  const vpsStatus = server.status || 'Unknown';
  let gameStatus = server.game_status || server.status || 'Stopped'; 

  if (vpsStatus === 'Installing' || vpsStatus === 'Provisioning' || isLocalProvisioning) {
      gameStatus = 'Installing';
  }

  const isVpsRunning = vpsStatus === 'Running';
  const isGameRunning = gameStatus === 'Running';
  const isGameStopped = gameStatus === 'Stopped';
  const isGameBusy = ['Initializing', 'Provisioning', 'Starting', 'Recreating', 'Stopping', 'Restarting', 'Installing'].includes(gameStatus);

  const isMinecraft = !server.game || server.game === 'minecraft';
  const sType = (server.type || '').toLowerCase();
  const showMods = ['forge', 'neoforge', 'fabric', 'quilt', 'paper', 'spigot', 'purpur', 'folia', 'velocity', 'waterfall', 'bukkit', 'arclight', 'mohist', 'magma'].includes(sType);
  
  const allTabs = [
    { id: 'overview', label: t('tabs.overview'), icon: SignalIcon, perm: null },
    { id: 'schedules', label: t('tabs.schedules'), icon: CalendarDaysIcon, perm: 'schedules' },
    ...(isMinecraft ? [{ id: 'properties', label: t('tabs.properties'), icon: ServerIcon, perm: 'settings' }] : []),
    { id: 'console', label: t('tabs.console'), icon: ClockIcon, perm: 'console' },
    ...(isMinecraft ? [{ id: 'players', label: t('tabs.players'), icon: UserGroupIcon, perm: 'players' }] : []), 
    { id: 'software', label: isMinecraft ? t('tabs.software') : t('tabs.release_branch', 'Release Branch'), icon: CpuChipIcon, perm: 'software' },
    ...(!isMinecraft ? [{ id: 'mods', label: t('tabs.mods', 'Mods'), icon: PuzzlePieceIcon, perm: 'mods' }] : (showMods ? [{ id: 'mods', label: t('tabs.mods', 'Mods'), icon: PuzzlePieceIcon, perm: 'mods' }] : [])),
    ...(isMinecraft ? [{ id: 'world', label: t('tabs.world'), icon: ServerIcon, perm: 'world' }] : []),
    { id: 'files', label: t('tabs.files'), icon: ClipboardDocumentIcon, perm: 'files' },
    { id: 'backups', label: t('tabs.backups'), icon: ArchiveBoxIcon, perm: 'backups' },
    ...(isOwner ? [{ id: 'access', label: t('tabs.access', 'Access'), icon: ShieldCheckIcon, perm: 'owner' }] : []),
  ];

  const tabs = allTabs.filter(tab => tab.perm === null || (tab.perm === 'owner' ? isOwner : myPerms[tab.perm]));

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900 font-sans text-slate-900 dark:text-gray-100">
      <Header user={user} credits={credits} isLoading={creditsLoading} onLogout={() => { supabase.auth.signOut(); router.push('/login'); }} />
      <ServerTour run={runTour} userId={user?.id} onFinish={() => setRunTour(false)} />

      <main className="w-full mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-24">
        <AnimatePresence>
          {error && (
            <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mb-6 p-4 bg-red-50 text-red-700 rounded-xl border border-red-200 flex justify-between items-center shadow-sm">
              <div className="flex items-center gap-3"><span className="bg-red-200 p-1 rounded-full"><XMarkIcon className="w-4 h-4 text-red-700" /></span><span>{error}</span></div>
              <button onClick={() => setError(null)} className="text-sm font-semibold hover:underline">{t('messages.dismiss', 'Dismiss')}</button>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700 p-6 mb-8">
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
            
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-1">
                <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">{server.name}</h1>
                <div className="flex items-center gap-2 tour-status-indicator">
                    {server.billing_type === 'monthly' && (
                        <span className={`px-2.5 py-1 rounded-full text-[10px] uppercase tracking-wider font-bold border ${isVpsRunning ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-gray-100 text-gray-600 border-gray-200 dark:bg-slate-700 dark:text-gray-400'}`}>
                            {t('status.vps_status', { status: vpsStatus, defaultValue: `VPS ${vpsStatus}` })}
                        </span>
                    )}
                    <ServerStatusIndicator server={{...server, status: gameStatus}} />
                </div>
              </div>
              
              <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 mb-2">
                <span className="bg-gray-100 dark:bg-slate-700 px-2 py-0.5 rounded text-gray-700 dark:text-gray-300 font-medium capitalize">{server.game}</span>
                <span>•</span>
                <button onClick={handleCopyIp} className="group flex items-center gap-1 hover:text-indigo-600 transition-colors">
                  <span className="font-mono">{server.name}.spawnly.net</span>
                  {copiedIp ? <span className="text-green-600 text-xs font-bold">{t('actions.copied')}</span> : <ClipboardDocumentIcon className="w-4 h-4 opacity-50 group-hover:opacity-100" />}
                </button>
              </div>

              <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 h-8">
                {isEditingMotd ? (
                  <div className="flex items-center gap-2 w-full max-w-md animate-in fade-in zoom-in duration-200">
                    <input type="text" value={motdText} onChange={(e) => setMotdText(e.target.value)} className="flex-1 px-2 py-1 border border-indigo-300 rounded text-gray-900 dark:bg-slate-700 dark:text-gray-100 dark:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm" placeholder={t('properties.labels.motd')} maxLength={64} />
                    <button onClick={handleSaveMotd} disabled={savingMotd} className="p-1 bg-green-100 text-green-700 rounded hover:bg-green-200 disabled:opacity-50">{savingMotd ? <div className="w-4 h-4 border-2 border-green-600 border-t-transparent rounded-full animate-spin" /> : <CheckIcon className="w-4 h-4" />}</button>
                    <button onClick={() => { setIsEditingMotd(false); setMotdText(server.motd || ''); }} className="p-1 bg-gray-100 text-gray-600 rounded hover:bg-gray-200"><XMarkIcon className="w-4 h-4" /></button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 group">
                    <span className="italic text-gray-600 dark:text-gray-400">“{motdText || t('messages.default_motd', 'A Spawnly Server')}”</span>
                    {(isOwner || myPerms.settings) && (<button onClick={() => setIsEditingMotd(true)} className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 dark:text-gray-500 hover:text-indigo-600" title={t('actions.edit_motd')}><PencilSquareIcon className="w-4 h-4" /></button>)}
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 tour-server-controls">
              {myPerms.control && isGameStopped && (
                <button onClick={(e) => handleServerAction('start', e)} disabled={actionLoading} className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl font-semibold shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                  {actionLoading ? <div className="animate-spin w-5 h-5 border-2 border-white/30 border-t-white rounded-full" /> : <PlayIcon className="w-5 h-5" />}
                  {t('actions.start')}
                </button>
              )}
              
              {myPerms.control && (isGameRunning || gameStatus === 'Unknown') && (
                <>
                  {isGameRunning && (
                    <button onClick={(e) => handleServerAction('restart', e)} disabled={actionLoading} title={!isMinecraft ? t('actions.hard_restart_tooltip', "Shift+Click for Hard Restart (Reboot VPS Hardware)") : t('actions.restart_tooltip', "Restart Server")} className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-white px-5 py-2.5 rounded-xl font-semibold shadow-sm transition-all disabled:opacity-50">
                      {actionLoading ? <div className="animate-spin w-5 h-5 border-2 border-white/30 border-t-white rounded-full" /> : <ArrowPathIcon className="w-5 h-5" />}
                      {t('actions.restart')}
                    </button>
                  )}
                  <button onClick={(e) => handleServerAction('stop', e)} disabled={actionLoading} className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-5 py-2.5 rounded-xl font-semibold shadow-sm transition-all disabled:opacity-50">
                    <StopIcon className="w-5 h-5" />
                    {t('actions.stop')}
                  </button>
                </>
              )}
              
              {isGameBusy && (
                <button disabled className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold cursor-not-allowed transition-all ${
                    gameStatus === 'Installing' 
                    ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800' 
                    : gameStatus === 'Starting'
                    ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800'
                    : 'bg-gray-100 dark:bg-slate-700 text-gray-400 border border-transparent'
                }`}>
                  <div className={`animate-spin w-5 h-5 border-2 border-t-transparent rounded-full ${
                      gameStatus === 'Installing' ? 'border-amber-500 dark:border-amber-400' 
                      : gameStatus === 'Starting' ? 'border-indigo-500 dark:border-indigo-400' 
                      : 'border-gray-400'
                  }`} />
                  {gameStatus === 'Installing' 
                    ? t('status.installing', 'Installing Game Data...') 
                    : gameStatus === 'Starting' 
                      ? t('status.booting', 'Booting Engine...') 
                      : t('status.processing', 'Processing...')}
                </button>
              )}

              {myPerms.control && isGameBusy && (
                <button onClick={(e) => handleServerAction('kill', e)} disabled={actionLoading} title={t('actions.force_kill_tooltip', "Force Kill")} className="flex items-center gap-2 bg-red-800 hover:bg-red-900 text-white px-4 py-2.5 rounded-xl font-semibold shadow-sm transition-all disabled:opacity-50">
                    <TrashIcon className="w-5 h-5" />
                    {t('actions.kill')}
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="mb-8 overflow-x-auto tour-server-tabs">
          <div className="flex items-center gap-2 min-w-max border-b border-gray-200 dark:border-slate-700 pb-1">
            {tabs.map((tab) => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`tour-tab-${tab.id} relative px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-medium transition-colors ${activeTab === tab.id ? 'text-indigo-600 bg-indigo-50 dark:bg-indigo-900/30 dark:text-indigo-400' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-slate-800'}`}>
                <tab.icon className="w-5 h-5" /> {tab.label}
                {activeTab === tab.id && <motion.div layoutId="activeTab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600 translate-y-1.5 rounded-full" />}
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
                    <h3 className="text-gray-500 dark:text-gray-400 text-sm font-semibold uppercase tracking-wider mb-4 flex items-center gap-2"><SignalIcon className="w-4 h-4" /> {t('connection.title')}</h3>
                    <div onClick={handleCopyIp} className="group cursor-pointer bg-gray-50 dark:bg-slate-700 hover:bg-indigo-50 dark:hover:bg-indigo-900/50 border border-gray-200 dark:border-slate-600 hover:border-indigo-200 dark:hover:border-indigo-600 rounded-xl p-4 text-center transition-all tour-server-address">
                      <p className="text-sm text-gray-500 dark:text-gray-300 mb-1">{t('connection.address')}</p>
                      <p className="text-xl font-mono font-bold text-gray-900 dark:text-gray-100 break-all">{server.name}.spawnly.net</p>
                      <p className="text-xs text-indigo-600 mt-2 font-medium opacity-0 group-hover:opacity-100 transition-opacity">{copiedIp ? t('actions.copied') : t('actions.copy_ip')}</p>
                    </div>
                  </div>
                  <div className="mt-6 pt-6 border-t border-gray-100 dark:border-slate-700">
                    <div className="flex justify-between items-center mb-2"><span className="text-sm text-gray-600 dark:text-gray-300">{isMinecraft ? t('connection.software') : t('connection.game', 'Game')}</span><span className="text-sm font-medium text-gray-900 dark:text-gray-100 capitalize truncate max-w-[150px] text-right" title={isMinecraft ? displaySoftware : server.game}>{isMinecraft ? displaySoftware : server.game}</span></div>
                    <div className="flex justify-between items-center"><span className="text-sm text-gray-600 dark:text-gray-300">{isMinecraft ? t('connection.version') : t('connection.branch', 'Branch')}</span><span className="text-sm font-medium text-gray-900 dark:text-gray-100">{displayVersion}</span></div>
                  </div>
                </div>

                <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700 md:col-span-2 flex flex-col tour-server-resources">
                  <h3 className="text-gray-500 dark:text-gray-400 text-sm font-semibold uppercase tracking-wider mb-4 flex items-center gap-2"><CpuChipIcon className="w-4 h-4" /> {t('resources.title')}</h3>
                  <div className="flex flex-col flex-1 gap-4">
                    {isVpsRunning ? (
                      <>
                        <ServerMetrics server={server} />
                        <div className="mt-auto pt-4 border-t border-gray-100 dark:border-slate-700 flex items-center justify-between">
                          <div className="flex items-center gap-2"><UserGroupIcon className="w-5 h-5 text-gray-400" /><span className="text-sm font-medium text-gray-600 dark:text-gray-300">{t('resources.active_players')}</span></div>
                            <div className="text-right">
                              <span className="text-2xl font-bold text-gray-900 dark:text-gray-100">{server.player_count || 0}</span>
                              <span className="text-gray-400 text-sm font-medium ml-1">
                                / {server.max_players || (server.game === 'rust' ? 50 : server.game === 'satisfactory' ? 4 : 20)}
                              </span>
                            </div>
                        </div>
                      </>
                    ) : (
                      <div className="flex-1 flex flex-col items-center justify-center text-gray-400 bg-gray-50 dark:bg-slate-700 rounded-xl border border-dashed border-gray-200 dark:border-slate-600 h-40">
                        <ServerIcon className="w-8 h-8 mb-2 opacity-50" />
                        <p>{t('resources.server_offline', { defaultValue: 'Server is currently offline.' })}</p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700">
                  <h3 className="text-gray-500 dark:text-gray-400 text-sm font-semibold uppercase tracking-wider mb-4 flex items-center gap-2">
                    <ClockIcon className="w-4 h-4" /> {t('config.title')}
                  </h3>
                  
                  {/* Auto-Stop Setting */}
                  {server.billing_type !== 'monthly' && (
                    <div className="mb-6">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{t('config.auto_stop')}</label>
                      <div className="flex items-center gap-2">
                        <select value={server.auto_stop_timeout ?? 30} onChange={handleAutoStopChange} disabled={savingAutoStop || (!isOwner && !myPerms.settings)} className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm bg-gray-50 dark:bg-slate-700 disabled:opacity-50">
                          <option value="0">{t('config.auto_stop_never')}</option><option value="5">{t('config.auto_stop_5m')}</option><option value="15">{t('config.auto_stop_15m')}</option><option value="30">{t('config.auto_stop_30m')}</option><option value="60">{t('config.auto_stop_1h')}</option>
                        </select>
                        {savingAutoStop && <div className="animate-spin h-4 w-4 border-2 border-indigo-600 border-t-transparent rounded-full" />}
                      </div>
                      {autoStopCountdown && (<div className="mt-2 p-2 bg-amber-50 dark:bg-amber-900/50 text-amber-800 dark:text-amber-300 text-xs rounded-lg flex items-center gap-2 animate-pulse border border-amber-100 dark:border-amber-900"><ClockIcon className="w-3 h-3" /> {autoStopCountdown}</div>)}
                    </div>
                  )}

                  {/* Update on Start Toggle (Steam Games Only) */}
                  {!isMinecraft && (
                    <div className="mb-6 pb-6 border-b border-gray-100 dark:border-slate-700">
                      <label className="flex items-center justify-between cursor-pointer group">
                        <div className="pr-4">
                          <span className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-0.5">{t('config.update_on_start_title', 'Update on Start')}</span>
                          <span className="block text-xs text-gray-500 dark:text-gray-400 leading-relaxed">{t('config.update_on_start_desc', 'Automatically verify and install base game updates via SteamCMD when booting up.')}</span>
                        </div>
                        <div className="relative flex items-center shrink-0">
                          {savingAutoUpdate && <div className="absolute -left-6 animate-spin h-4 w-4 border-2 border-indigo-600 border-t-transparent rounded-full" />}
                          <input 
                            type="checkbox" 
                            className="sr-only peer" 
                            checked={!!server.auto_update} 
                            onChange={handleAutoUpdateChange} 
                            disabled={savingAutoUpdate || (!isOwner && !myPerms.settings)} 
                          />
                          <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 dark:peer-focus:ring-indigo-800 rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-indigo-600 group-hover:after:scale-95 disabled:opacity-50"></div>
                        </div>
                      </label>
                    </div>
                  )}

                  {/* RAM Allocation Setting */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{t('config.ram_allocation')}</label>
                    {editingRam ? (
                      <div className="space-y-3">
                        <select value={newRam} onChange={(e) => setNewRam(Number(e.target.value))} className="w-full px-3 py-2 border rounded-lg dark:bg-slate-700 dark:border-slate-600 focus:ring-2 focus:ring-indigo-500 text-sm font-medium">
                          {getAvailableRamTiers().map(tier => (<option key={tier} value={tier}>{tier} GB RAM</option>))}
                        </select>
                        <div className="flex gap-2">
                          <button onClick={handleSaveRam} className="flex-1 bg-indigo-600 text-white text-xs font-bold py-2 rounded-lg hover:bg-indigo-700">{t('actions.save')}</button>
                          <button onClick={() => setEditingRam(false)} className="flex-1 bg-gray-200 text-gray-700 text-xs font-bold py-2 rounded-lg hover:bg-gray-300">{t('actions.cancel')}</button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex justify-between items-center bg-gray-50 dark:bg-slate-700 p-3 rounded-xl border border-gray-200 dark:border-slate-600">
                        <span className="font-mono font-bold text-gray-800 dark:text-gray-100">{server.ram} GB</span>
                        {isOwner && (
                            server.billing_type !== 'monthly' ? (
                                isVpsRunning === false && (<button onClick={() => { setNewRam(server.ram); setEditingRam(true); }} className="text-xs text-indigo-600 font-medium hover:text-indigo-800">{t('config.edit_ram')}</button>)
                            ) : (
                                <button onClick={() => setShowScaleModal(true)} className="text-xs text-indigo-600 font-medium hover:text-indigo-800 bg-indigo-50 dark:bg-indigo-900/30 px-3 py-1.5 rounded-lg border border-indigo-200 dark:border-indigo-800 transition-colors">{t('config.scale_ram', 'Scale RAM')}</button>
                            )
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {(isOwner || server.pool_id) && (
                    <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700 md:col-span-2 tour-billing-card flex flex-col">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="text-gray-500 dark:text-gray-400 text-sm font-semibold uppercase tracking-wider flex items-center gap-2"><CurrencyDollarIcon className="w-4 h-4" /> {t('billing.title')}</h3>
                        {server.pool_id && (<button onClick={() => setShowContributeModal(true)} className="text-xs flex items-center gap-1 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 px-3 py-1.5 rounded-lg font-medium transition-colors border border-indigo-200 dark:border-indigo-800"><PlusIcon className="w-3 h-3" /> {t('billing.contribute', 'Contribute')}</button>)}
                    </div>
                    {isOwner && (
                        <div className="mb-4 p-3 bg-gray-50 dark:bg-slate-700 rounded-lg border border-gray-100 dark:border-slate-600">
                            <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase block mb-1">{t('billing.source')}</label>
                            <select value={server.pool_id || 'personal'} onChange={handlePoolChange} disabled={savingPool} className="w-full bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-600 rounded-md text-sm py-1.5 focus:ring-indigo-500 dark:text-white">
                                <option value="personal">{t('billing.personal_wallet')}</option>
                                {pools.map(pool => (<option key={pool.id} value={pool.id}>{pool.name} ({Number(pool.balance).toFixed(2)} cr)</option>))}
                            </select>
                        </div>
                    )}
                    {!isOwner && server.pool && (
                        <div className="mb-4 p-3 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg border border-indigo-100 dark:border-indigo-800 flex justify-between items-center">
                            <div><span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase block">{t('billing.active_pool', 'Active Pool')}</span><span className="text-sm font-semibold dark:text-gray-200">{server.pool.name}</span></div>
                            <div className="text-right"><span className="text-xs text-gray-500 block">{t('billing.balance', 'Balance')}</span><span className="font-mono font-bold text-slate-800 dark:text-white">{Number(server.pool.balance).toFixed(2)}</span></div>
                        </div>
                    )}
                    <div className="flex items-center gap-8 mt-auto pt-2">
                        {server.billing_type === 'monthly' ? (
                            <>
                                <div><p className="text-sm text-gray-500 dark:text-gray-400">{t('billing.flat_monthly_cost')}</p><p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{Math.round((server.cost_per_hour || 0) * 720)} <span className="text-sm font-normal text-gray-500 dark:text-gray-400">{t('billing.credits_mo')}</span></p></div>
                                <div className="h-10 w-px bg-gray-200 dark:bg-slate-700"></div>
                                <div><p className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-1"><CalendarIcon className="w-3.5 h-3.5" />{t('billing.next_billing')}</p><p className="text-lg font-bold text-gray-900 dark:text-gray-100 pt-0.5">{getNextBillingDate()}</p></div>
                                {isOwner && !server.pool_id && (<button onClick={() => router.push(`/credits?auto_add=${Math.round((server.cost_per_hour || 0) * 720)}`)} className="ml-auto flex items-center gap-2 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 px-4 py-2 rounded-xl text-sm font-bold border border-indigo-200 dark:border-indigo-800 transition-all"><ArrowPathIcon className="w-4 h-4" />{t('billing.setup_autopay')}</button>)}
                            </>
                        ) : (
                            <>
                                <div><p className="text-sm text-gray-500 dark:text-gray-400">{t('billing.hourly_cost')}</p><p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{server.cost_per_hour} <span className="text-sm font-normal text-gray-500 dark:text-gray-400">{t('billing.credits_hr')}</span></p></div>
                                <div className="h-10 w-px bg-gray-200 dark:bg-slate-700"></div>
                                <div><p className="text-sm text-gray-500 dark:text-gray-400">{t('billing.est_runtime')}</p><p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{((server.pool ? server.pool.balance : (isOwner ? credits : 0)) / (server.cost_per_hour || 1)).toFixed(1)} <span className="text-sm font-normal text-gray-500 dark:text-gray-400 pl-1">{t('billing.hours_left')}</span></p></div>
                            </>
                        )}
                    </div>
                    </div>
                )}
              </div>
            )}

            <div className={activeTab === 'overview' ? 'hidden' : 'block animate-in fade-in duration-300'}>
              {activeTab === 'properties' && isMinecraft && myPerms.settings && (
                <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700">
                  <ServerPropertiesEditor server={server} isAdmin={isAdmin} />
                </div>
              )}

              {activeTab === 'schedules' && myPerms.schedules && (
                <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700">
                  <SchedulesTab server={server} />
                </div>
              )}

              {activeTab === 'console' && myPerms.console && (
                <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700">
                  {isVpsRunning ? <ConsoleViewer server={server} /> : <div className="text-center py-10 text-gray-500">{t('console.start_to_access', 'Please start the server to access the live console.')}</div>}
                </div>
              )}

              {activeTab === 'players' && isMinecraft && myPerms.players && (
                <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700">
                  {isVpsRunning ? (fileToken ? <PlayersTab server={server} token={fileToken} /> : <p className="text-center text-gray-500 dark:text-gray-400">{t('status.authenticating')}</p>) : <div className="text-center py-10 text-gray-500">{t('players.start_to_access', 'Please start the server to manage players.')}</div>}
                </div>
              )}

              {activeTab === 'software' && myPerms.software && (isMinecraft ? <ServerSoftwareTab server={server} onSoftwareChange={handleSoftwareChange} /> : <ServerSoftwareTabSteam server={server} onSoftwareChange={handleSoftwareChange} />)}
              
              {activeTab === 'mods' && myPerms.mods && (isMinecraft ? <ModsPluginsTab server={server} /> : <ModsPluginsTabSteam server={server} />)}

              {activeTab === 'world' && isMinecraft && myPerms.world && (
                <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700">
                  {isVpsRunning ? (fileToken ? <WorldTab server={server} token={fileToken} /> : <p className="text-center text-gray-500 dark:text-gray-400">{t('status.authenticating')}</p>) : <div className="text-center py-10 text-gray-500">{t('world.start_to_manage', 'Please start the server to manage worlds.')}</div>}
                </div>
              )}

              {activeTab === 'files' && myPerms.files && (
                <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700">
                  {fileToken ? <FileManager server={server} token={fileToken} setActiveTab={setActiveTab} isAdmin={isAdmin} /> : <p className="text-center text-gray-500 dark:text-gray-400">{t('status.authenticating_files', { defaultValue: 'Authenticating file access...' })}</p>}
                </div>
              )}

              {activeTab === 'backups' && myPerms.backups && (<BackupsTab server={server} />)}
              {activeTab === 'access' && isOwner && (<AccessTab server={server} />)}
            </div>

          </Suspense>
        </div>

        <ContributeModal isOpen={showContributeModal} onClose={() => setShowContributeModal(false)} pool={server.pool} userCredits={credits} onContribute={handleContribute} />
        <ScaleServerModal isOpen={showScaleModal} onClose={() => setShowScaleModal(false)} server={server} userCredits={credits} onScale={handleScaleServer} />
      </main>
      <Footer />
    </div>
  );
}

export async function getServerSideProps(context) {
  const { id } = context.params || {};
  if (!id) return { notFound: true };
  const translations = await serverSideTranslations(context.locale, ['common', 'server', 'dashboard']);
  try {
    const { createClient } = require('@supabase/supabase-js');
    const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE);
    const { data, error } = await supabaseAdmin.from('servers').select('*, pool:credit_pools(*)').eq('id', id).single();
    if (error || !data) return { notFound: true };
    return { props: { ...translations, initialServer: data } };
  } catch (err) {
    return { props: { ...translations, initialServer: null } };
  }
}