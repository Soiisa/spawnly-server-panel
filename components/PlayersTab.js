import { useState, useEffect, useMemo } from 'react';
import md5 from 'md5';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../lib/supabaseClient';
import { useTranslation } from 'next-i18next';
import {
  UserGroupIcon,
  ShieldCheckIcon,
  NoSymbolIcon,
  GlobeAltIcon,
  ArrowPathIcon,
  MagnifyingGlassIcon,
  UserPlusIcon,
  TrashIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  SignalIcon,
  SignalSlashIcon,
  ClockIcon,
  IdentificationIcon
} from '@heroicons/react/24/outline';

export default function PlayersTab({ server, token }) {
  const { t } = useTranslation('server');
  // --- State ---
  const [activeSubTab, setActiveSubTab] = useState('whitelist');
  const [whitelist, setWhitelist] = useState([]);
  const [ops, setOps] = useState([]);
  const [bannedPlayers, setBannedPlayers] = useState([]);
  const [bannedIps, setBannedIps] = useState([]);
  const [userCache, setUserCache] = useState([]);
  
  // Form State
  const [searchQuery, setSearchQuery] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  
  // Inputs
  const [newPlayerName, setNewPlayerName] = useState('');
  const [newPlayerIp, setNewPlayerIp] = useState('');
  const [newPlayerReason, setNewPlayerReason] = useState('Banned by an operator.');
  const [newPlayerExpires, setNewPlayerExpires] = useState('forever');
  const [newOpLevel, setNewOpLevel] = useState(4);
  const [newOpBypasses, setNewOpBypasses] = useState(false);

  // Status
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const isRunning = server.status === 'Running';

  // --- Constants ---
  const TABS = [
    { id: 'whitelist', label: t('players.tabs.whitelist'), icon: UserGroupIcon, color: 'text-indigo-600', bg: 'bg-indigo-50' },
    { id: 'ops', label: t('players.tabs.ops'), icon: ShieldCheckIcon, color: 'text-amber-600', bg: 'bg-amber-50' },
    { id: 'banned-players', label: t('players.tabs.banned_players'), icon: NoSymbolIcon, color: 'text-red-600', bg: 'bg-red-50' },
    { id: 'banned-ips', label: t('players.tabs.banned_ips'), icon: GlobeAltIcon, color: 'text-slate-600', bg: 'bg-slate-50' },
  ];

  // --- Effects ---
  useEffect(() => {
    fetchAllData();
  }, [server.id, token]);

  // --- Data Fetching Helpers ---
  const showError = (msg) => { setError(msg); setTimeout(() => setError(null), 5000); };
  const showSuccess = (msg) => { setSuccess(msg); setTimeout(() => setSuccess(null), 5000); };

  const fetchJsonFile = async (filePath, retries = 3) => {
    for (let i = 0; i < retries; i++) {
      try {
        const res = await fetch(`/api/servers/${server.id}/file?path=${filePath}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.status === 404) return [];
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        if (!text.trim()) return [];
        return JSON.parse(text);
      } catch (e) {
        if (i === retries - 1) console.error(`Failed to load ${filePath}:`, e);
        await new Promise(r => setTimeout(r, 1000));
      }
    }
    return [];
  };

  const saveJsonFile = async (filePath, data) => {
    try {
      setLoading(true);
      const res = await fetch(`/api/servers/${server.id}/files?path=${filePath}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(data, null, 2),
      });
      if (!res.ok) throw new Error((await res.json()).error || `HTTP ${res.status}`);
      return true;
    } catch (e) {
      showError(`Save failed: ${e.message}`);
      return false;
    } finally {
      setLoading(false);
    }
  };

  const sendRcon = async (command) => {
    try {
      const res = await fetch(`/api/servers/rcon`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ serverId: server.id, command }),
      });
      if (!res.ok) throw new Error('RCON command failed');
      const json = await res.json();
      return json.response;
    } catch (e) {
      throw e;
    }
  };

  const fetchAllData = async () => {
    setLoading(true);
    try {
      const [wl, op, bp, bi, uc] = await Promise.all([
        fetchJsonFile('whitelist.json'),
        fetchJsonFile('ops.json'),
        fetchJsonFile('banned-players.json'),
        fetchJsonFile('banned-ips.json'),
        fetchJsonFile('usercache.json'),
      ]);
      setWhitelist(Array.isArray(wl) ? wl : []);
      setOps(Array.isArray(op) ? op : []);
      setBannedPlayers(Array.isArray(bp) ? bp : []);
      setBannedIps(Array.isArray(bi) ? bi : []);
      setUserCache(Array.isArray(uc) ? uc : []);
    } catch (e) {
      showError('Failed to refresh data.');
    } finally {
      setLoading(false);
    }
  };

  // --- Logic Helpers ---
  const getOfflineUuid = (name) => {
    if (!name) return null;
    const hash = md5(`OfflinePlayer:${name}`);
    const parts = [
      hash.slice(0, 8), hash.slice(8, 12),
      (parseInt(hash.slice(12, 16), 16) & 0x0fff) | 0x3000,
      (parseInt(hash.slice(16, 20), 16) & 0x3fff) | 0x8000,
      hash.slice(20, 32),
    ];
    return parts.map((p, i) => (i < 2 ? p : p.toString(16).padStart(4, '0'))).join('-');
  };

  const addToList = async () => {
    const isIP = activeSubTab === 'banned-ips';
    const target = isIP ? newPlayerIp : newPlayerName;
    
    if (!target) return showError(`${isIP ? t('players.form.ip_address') : t('players.form.player_name')} is required`);

    setLoading(true);
    setError(null);

    // Prepare data
    const uuid = !isIP ? getOfflineUuid(target) : null;
    let file, currentList, entry, command;

    switch (activeSubTab) {
      case 'whitelist':
        file = 'whitelist.json'; currentList = whitelist;
        entry = { uuid, name: target };
        command = `whitelist add ${target}`;
        break;
      case 'ops':
        file = 'ops.json'; currentList = ops;
        entry = { uuid, name: target, level: newOpLevel, bypassesPlayerLimit: newOpBypasses };
        command = `op ${target}`;
        break;
      case 'banned-players':
        file = 'banned-players.json'; currentList = bannedPlayers;
        entry = { 
          uuid, name: target, created: new Date().toISOString(), source: 'Console', 
          expires: newPlayerExpires === 'forever' ? 'forever' : new Date(newPlayerExpires).toISOString(), 
          reason: newPlayerReason 
        };
        command = newPlayerExpires === 'forever' ? `ban ${target} ${newPlayerReason}` : null;
        break;
      case 'banned-ips':
        file = 'banned-ips.json'; currentList = bannedIps;
        entry = { 
          ip: target, created: new Date().toISOString(), source: 'Console', 
          expires: newPlayerExpires === 'forever' ? 'forever' : new Date(newPlayerExpires).toISOString(), 
          reason: newPlayerReason 
        };
        command = newPlayerExpires === 'forever' ? `ban-ip ${target} ${newPlayerReason}` : null;
        break;
    }

    // Check duplicates
    if (currentList.some(item => isIP ? item.ip === target : item.name?.toLowerCase() === target.toLowerCase())) {
      setLoading(false);
      return showError('Already in the list.');
    }

    // Execute
    try {
      if (isRunning && command) {
        const resp = await sendRcon(command);
        showSuccess(`RCON: ${resp}`);
        // Wait briefly for server to write file before fetching
        setTimeout(fetchAllData, 1000);
      } else {
        const newList = [...currentList, entry];
        if (await saveJsonFile(file, newList)) {
          showSuccess(`Added to ${activeSubTab} (File update)`);
          await fetchAllData();
        }
      }

      // [AUDIT LOG START]
      try {
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
              await supabase.from('server_audit_logs').insert({
                  server_id: server.id,
                  user_id: user.id,
                  action_type: 'player_manage',
                  details: `Added ${target} to ${activeSubTab}`,
                  created_at: new Date().toISOString()
              });
          }
      } catch (logErr) {
          console.error("Failed to log player action:", logErr);
      }
      // [AUDIT LOG END]

      // Sync whitelist to Supabase
      if (activeSubTab === 'whitelist') {
        const { error: dbError } = await supabase
          .from('server_whitelist')
          .insert({
            server_id: server.id,
            username: target,
            uuid: uuid
          });
        if (dbError) console.error('Failed to sync whitelist to DB:', dbError);
      }

      setIsAdding(false);
      setNewPlayerName('');
      setNewPlayerIp('');
    } catch (e) {
      showError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const removeFromList = async (identifier) => {
    if (!confirm(`${t('actions.confirm')} ${identifier}?`)) return;
    setLoading(true);

    let file, currentList, command;
    switch (activeSubTab) {
      case 'whitelist': file = 'whitelist.json'; currentList = whitelist; command = `whitelist remove ${identifier}`; break;
      case 'ops': file = 'ops.json'; currentList = ops; command = `deop ${identifier}`; break;
      case 'banned-players': file = 'banned-players.json'; currentList = bannedPlayers; command = `pardon ${identifier}`; break;
      case 'banned-ips': file = 'banned-ips.json'; currentList = bannedIps; command = `pardon-ip ${identifier}`; break;
    }

    try {
      if (isRunning && command) {
        const resp = await sendRcon(command);
        showSuccess(`RCON: ${resp}`);
        setTimeout(fetchAllData, 1000);
      } else {
        const newList = currentList.filter(item => 
          activeSubTab === 'banned-ips' ? item.ip !== identifier : item.name !== identifier
        );
        if (await saveJsonFile(file, newList)) {
          showSuccess('Removed successfully (File update)');
          await fetchAllData();
        }
      }

      // [AUDIT LOG START]
      try {
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
              await supabase.from('server_audit_logs').insert({
                  server_id: server.id,
                  user_id: user.id,
                  action_type: 'player_manage',
                  details: `Removed ${identifier} from ${activeSubTab}`,
                  created_at: new Date().toISOString()
              });
          }
      } catch (logErr) {
          console.error("Failed to log player action:", logErr);
      }
      // [AUDIT LOG END]

      // Sync removal to Supabase
      if (activeSubTab === 'whitelist') {
        const { error: dbError } = await supabase
          .from('server_whitelist')
          .delete()
          .eq('server_id', server.id)
          .eq('username', identifier);
        
        if (dbError) console.error('Failed to remove from DB whitelist:', dbError);
      }

    } catch (e) {
      showError(e.message);
    } finally {
      setLoading(false);
    }
  };

  // --- Derived State ---
  const onlineList = useMemo(() => 
    server.status === 'Running' && server.players_online ? server.players_online.split(', ').filter(Boolean) : []
  , [server.status, server.players_online]);

  const displayedList = useMemo(() => {
    let list = [];
    switch(activeSubTab) {
      case 'whitelist': list = whitelist; break;
      case 'ops': list = ops; break;
      case 'banned-players': list = bannedPlayers; break;
      case 'banned-ips': list = bannedIps; break;
    }
    if (searchQuery) {
      const lower = searchQuery.toLowerCase();
      list = list.filter(item => 
        (item.name && item.name.toLowerCase().includes(lower)) || 
        (item.ip && item.ip.includes(lower)) ||
        (item.uuid && item.uuid.includes(lower))
      );
    }
    return list;
  }, [activeSubTab, whitelist, ops, bannedPlayers, bannedIps, searchQuery]);

  // --- Render Helpers ---
  const renderEmptyState = () => (
    <div className="flex flex-col items-center justify-center py-12 text-gray-400 bg-white dark:bg-slate-800 rounded-xl border border-dashed border-gray-200 dark:border-slate-700">
      <UserGroupIcon className="w-12 h-12 mb-3 opacity-50" />
      <p>{t('players.empty_list')}</p>
    </div>
  );

  return (
    <div className="flex flex-col gap-6">
      
      {/* 1. Header & Online Status */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Online Players Card */}
        <div className="md:col-span-2 bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700 p-6 flex flex-col">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <SignalIcon className="w-5 h-5 text-green-500" />
              {t('players.online_title')}
              <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                {onlineList.length}
              </span>
            </h3>
            <button 
              onClick={fetchAllData} 
              disabled={loading}
              className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
              title={t('files.refresh')}
            >
              <ArrowPathIcon className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
          
          <div className="flex-1 bg-gray-50 dark:bg-slate-700 rounded-xl p-4 border border-gray-100 dark:border-slate-600 min-h-[120px]">
            {onlineList.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {onlineList.map((player, i) => (
                  <div key={i} 
                    className="flex items-center gap-2 bg-white dark:bg-slate-800 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-slate-600 shadow-sm">
                    <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{player}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-gray-400">
                <SignalSlashIcon className="w-8 h-8 mb-2 opacity-50" />
                <span className="text-sm">{t('players.no_online')}</span>
              </div>
            )}
          </div>
        </div>

        {/* Quick Actions / Summary */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700 p-6 flex flex-col justify-center gap-4">
          <div className="flex items-center justify-between p-3 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg border border-indigo-100 dark:border-indigo-600">
            <div className="flex items-center gap-3">
              <UserGroupIcon className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              <span className="text-sm font-medium text-indigo-900 dark:text-indigo-300">{t('players.tabs.whitelist')}</span>
            </div>
            <span className="font-bold text-indigo-700 dark:text-indigo-400">{whitelist.length}</span>
          </div>
          <div className="flex items-center justify-between p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-100 dark:border-amber-600">
            <div className="flex items-center gap-3">
              <ShieldCheckIcon className="w-5 h-5 text-amber-600 dark:text-amber-400" />
              <span className="text-sm font-medium text-amber-900 dark:text-amber-300">{t('players.tabs.ops')}</span>
            </div>
            <span className="font-bold text-amber-700 dark:text-amber-400">{ops.length}</span>
          </div>
          <div className="flex items-center justify-between p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-100 dark:border-red-600">
            <div className="flex items-center gap-3">
              <NoSymbolIcon className="w-5 h-5 text-red-600 dark:text-red-400" />
              <span className="text-sm font-medium text-red-900 dark:text-red-300">{t('players.tabs.banned_players')}</span>
            </div>
            <span className="font-bold text-red-700 dark:text-red-400">{bannedPlayers.length + bannedIps.length}</span>
          </div>
        </div>
      </div>

      {/* 2. Management Tabs */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700 overflow-hidden min-h-[500px] flex flex-col">
        
        {/* Navigation */}
        <div className="flex border-b border-gray-200 dark:border-slate-700 overflow-x-auto">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => { setActiveSubTab(tab.id); setIsAdding(false); setSearchQuery(''); }}
              className={`flex-1 flex items-center justify-center gap-2 py-4 px-6 text-sm font-medium transition-colors border-b-2 whitespace-nowrap
                ${activeSubTab === tab.id 
                  ? `border-indigo-500 text-indigo-600 bg-gray-50 dark:bg-slate-700` 
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-700/50'
                }`}
            >
              <tab.icon className={`w-5 h-5 ${activeSubTab === tab.id ? tab.color : 'text-gray-400 dark:text-gray-500'}`} />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Toolbar */}
        <div className="p-4 border-b border-gray-200 dark:border-slate-700 flex flex-col sm:flex-row justify-between gap-4 items-center bg-gray-50 dark:bg-slate-700">
          <div className="relative w-full sm:w-64">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
            <input 
              type="text" 
              placeholder={t('players.search_placeholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm border border-gray-300 dark:border-slate-600 dark:bg-slate-800 dark:text-gray-100 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>
          <button
            onClick={() => setIsAdding(!isAdding)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all shadow-sm
              ${isAdding 
                ? 'bg-gray-200 dark:bg-slate-600 text-gray-700 dark:text-gray-100 hover:bg-gray-300 dark:hover:bg-slate-500' 
                : 'bg-indigo-600 text-white hover:bg-indigo-700'
              }`}
          >
            {isAdding ? t('actions.cancel') : <><UserPlusIcon className="w-4 h-4" /> {t('players.add_new')}</>}
          </button>
        </div>

        {/* Add Form Area */}
        <AnimatePresence>
          {isAdding && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }} 
              animate={{ height: 'auto', opacity: 1 }} 
              exit={{ height: 0, opacity: 0 }}
              className="border-b border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-700 overflow-hidden"
            >
              <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 items-end">
                {/* Dynamic Inputs based on active tab */}
                {activeSubTab !== 'banned-ips' && (
                  <div className="col-span-1">
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase mb-1">{t('players.form.player_name')}</label>
                    <input 
                      type="text" 
                      value={newPlayerName} 
                      onChange={(e) => setNewPlayerName(e.target.value)}
                      className="w-full border-gray-300 dark:border-slate-600 dark:bg-slate-800 dark:text-gray-100 rounded-lg shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                      placeholder="e.g. Steve"
                    />
                  </div>
                )}
                
                {activeSubTab === 'banned-ips' && (
                  <div className="col-span-1">
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase mb-1">{t('players.form.ip_address')}</label>
                    <input 
                      type="text" 
                      value={newPlayerIp} 
                      onChange={(e) => setNewPlayerIp(e.target.value)}
                      className="w-full border-gray-300 dark:border-slate-600 dark:bg-slate-800 dark:text-gray-100 rounded-lg shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                      placeholder="e.g. 192.168.1.1"
                    />
                  </div>
                )}

                {activeSubTab === 'ops' && (
                  <>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase mb-1">{t('players.form.op_level')}</label>
                      <select 
                        value={newOpLevel} 
                        onChange={(e) => setNewOpLevel(Number(e.target.value))}
                        className="w-full border-gray-300 dark:border-slate-600 dark:bg-slate-800 dark:text-gray-100 rounded-lg shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                      >
                        <option value="1">{t('players.levels.l1')}</option>
                        <option value="2">{t('players.levels.l2')}</option>
                        <option value="3">{t('players.levels.l3')}</option>
                        <option value="4">{t('players.levels.l4')}</option>
                      </select>
                    </div>
                    <div className="flex items-center h-10 mt-6">
                      <input 
                        id="bypass" 
                        type="checkbox" 
                        checked={newOpBypasses} 
                        onChange={(e) => setNewOpBypasses(e.target.checked)}
                        className="h-4 w-4 text-indigo-600 border-gray-300 dark:border-slate-600 dark:bg-slate-800 rounded focus:ring-indigo-500"
                      />
                      <label htmlFor="bypass" className="ml-2 text-sm text-gray-700 dark:text-gray-300">{t('players.form.bypass_limit')}</label>
                    </div>
                  </>
                )}

                {(activeSubTab === 'banned-players' || activeSubTab === 'banned-ips') && (
                  <>
                    <div className="col-span-1 md:col-span-2">
                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase mb-1">{t('players.form.reason')}</label>
                      <input 
                        type="text" 
                        value={newPlayerReason} 
                        onChange={(e) => setNewPlayerReason(e.target.value)}
                        className="w-full border-gray-300 dark:border-slate-600 dark:bg-slate-800 dark:text-gray-100 rounded-lg shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                        placeholder="Reason for ban"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase mb-1">{t('players.form.expires')}</label>
                      <select 
                        value={newPlayerExpires === 'forever' ? 'forever' : 'date'} 
                        onChange={(e) => setNewPlayerExpires(e.target.value === 'forever' ? 'forever' : new Date().toISOString().split('T')[0])}
                        className="w-full border-gray-300 dark:border-slate-600 dark:bg-slate-800 dark:text-gray-100 rounded-lg shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                      >
                        <option value="forever">{t('players.form.forever')}</option>
                        <option value="date">{t('players.form.specific_date')}</option>
                      </select>
                      {newPlayerExpires !== 'forever' && (
                        <input 
                          type="date" 
                          value={newPlayerExpires} 
                          onChange={(e) => setNewPlayerExpires(e.target.value)}
                          className="mt-2 w-full border-gray-300 dark:border-slate-600 dark:bg-slate-800 dark:text-gray-100 rounded-lg shadow-sm focus:ring-indigo-500 sm:text-sm"
                        />
                      )}
                    </div>
                  </>
                )}

                <div className="col-span-1 flex justify-end">
                  <button 
                    onClick={addToList}
                    disabled={loading}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium shadow-sm transition-all disabled:opacity-50"
                  >
                    {loading ? t('files.editor.saving') : t('players.form.confirm')}
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Feedback Messages */}
        <AnimatePresence>
          {error && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="p-4 bg-red-50 text-red-700 border-b border-red-100 flex gap-2 items-center">
              <ExclamationCircleIcon className="w-5 h-5" /> {error}
            </motion.div>
          )}
          {success && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="p-4 bg-green-50 text-green-700 border-b border-green-100 flex gap-2 items-center">
              <CheckCircleIcon className="w-5 h-5" /> {success}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Main List */}
        <div className="flex-1 overflow-y-auto p-0">
          {displayedList.length === 0 ? renderEmptyState() : (
            <div className="divide-y divide-gray-100 dark:divide-slate-700">
              {displayedList.map((item, idx) => (
                <div key={idx} 
                  className="p-4 hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  
                  {/* Item Details */}
                  <div className="flex items-start gap-4">
                    <div className={`p-2 rounded-full ${TABS.find(t => t.id === activeSubTab)?.bg}`}>
                      <IdentificationIcon className={`w-6 h-6 ${TABS.find(t => t.id === activeSubTab)?.color}`} />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-gray-900 dark:text-gray-100">{item.name || item.ip}</h4>
                      
                      {activeSubTab !== 'banned-ips' && item.uuid && (
                        <p className="text-xs text-gray-400 font-mono mt-0.5">{item.uuid}</p>
                      )}
                      
                      {/* Contextual Badges */}
                      <div className="flex flex-wrap gap-2 mt-2">
                        {item.level && <span className="text-xs bg-amber-100 text-amber-800 dark:bg-amber-900/20 dark:text-amber-300 px-2 py-0.5 rounded">Level {item.level}</span>}
                        {item.bypassesPlayerLimit && <span className="text-xs bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300 px-2 py-0.5 rounded">Bypass Limit</span>}
                        {item.source && <span className="text-xs bg-gray-100 text-gray-600 dark:bg-slate-700 dark:text-gray-300 px-2 py-0.5 rounded">Source: {item.source}</span>}
                        {item.created && <span className="text-xs bg-gray-100 text-gray-600 dark:bg-slate-700 dark:text-gray-300 px-2 py-0.5 rounded">Banned: {item.created.split(' ')[0]}</span>}
                      </div>
                      
                      {/* Ban Reason */}
                      {item.reason && (
                        <p className="text-xs text-red-600 dark:text-red-400 mt-1 italic">Reason: "{item.reason}"</p>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-4">
                    {item.expires && (
                      <div className="text-right text-xs text-gray-500 dark:text-gray-400">
                        <div className="flex items-center gap-1 justify-end">
                          <ClockIcon className="w-3 h-3" />
                          <span>Expires</span>
                        </div>
                        <span className="font-medium text-gray-700 dark:text-gray-300">{item.expires === 'forever' ? 'Never' : item.expires.split(' ')[0]}</span>
                      </div>
                    )}
                    
                    <button
                      onClick={() => removeFromList(item.name || item.ip)}
                      disabled={loading}
                      className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all"
                      title="Remove / Pardon"
                    >
                      <TrashIcon className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}