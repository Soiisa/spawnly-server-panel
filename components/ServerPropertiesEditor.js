import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../lib/supabaseClient'; 
import { useTranslation } from 'next-i18next';
import { 
  MagnifyingGlassIcon, 
  CommandLineIcon, 
  AdjustmentsHorizontalIcon,
  GlobeAmericasIcon,
  ShieldCheckIcon,
  CpuChipIcon,
  PuzzlePieceIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  TrashIcon,       
  PlusIcon,        
  WifiIcon         
} from '@heroicons/react/24/outline';

// --- Helper Functions ---

const parseProperties = (text) => {
  const map = {};
  text.split(/\r?\n/).forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const idx = trimmed.indexOf('=');
    if (idx === -1) return;
    map[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
  });
  return map;
};

const serializeProperties = (map) => {
  return Object.entries(map).map(([k, v]) => `${k}=${v}`).join('\n');
};

const toBool = (val) => ['true', '1', 'yes', 'on'].includes(String(val).toLowerCase());
const toNum = (val, def = 0) => {
  const n = Number(val);
  return Number.isFinite(n) ? n : def;
};

// --- Sub-components ---

const ToggleInput = ({ label, value, onChange }) => (
  <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-slate-700 rounded-xl border border-gray-200 dark:border-slate-600">
    <span className="text-sm font-medium text-gray-700 dark:text-gray-200">{label}</span>
    <button
      onClick={() => onChange(!value)}
      className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${value ? 'bg-indigo-600' : 'bg-gray-200 dark:bg-slate-600'}`}
    >
      <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${value ? 'translate-x-5' : 'translate-x-0'}`} />
    </button>
  </div>
);

const SelectInput = ({ label, value, options, onChange }) => (
  <div className="p-4 bg-gray-50 dark:bg-slate-700 rounded-xl border border-gray-200 dark:border-slate-600">
    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">{label}</label>
    <select
      value={value || options[0].value}
      onChange={(e) => onChange(e.target.value)}
      className="block w-full rounded-lg border-gray-300 dark:border-slate-600 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm py-2 dark:bg-slate-800 dark:text-gray-100"
    >
      {options.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
    </select>
  </div>
);

const NumberInput = ({ label, value, min = 0, max = 9999, onChange }) => (
  <div className="p-4 bg-gray-50 dark:bg-slate-700 rounded-xl border border-gray-200 dark:border-slate-600">
    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">{label}</label>
    <div className="flex items-center">
      <button 
        onClick={() => onChange(Math.max(min, Number(value) - 1))}
        className="w-8 h-8 flex items-center justify-center bg-white dark:bg-slate-600 border border-gray-300 dark:border-slate-500 rounded-l-lg hover:bg-gray-100 dark:hover:bg-slate-500 text-gray-600 dark:text-gray-200"
      >-</button>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Math.max(min, Math.min(max, Number(e.target.value))))}
        className="block w-full border-y border-gray-300 dark:border-slate-500 text-center focus:ring-0 focus:border-indigo-500 sm:text-sm py-1.5 z-10 dark:bg-slate-800 dark:text-gray-100"
      />
      <button 
        onClick={() => onChange(Math.min(max, Number(value) + 1))}
        className="w-8 h-8 flex items-center justify-center bg-white dark:bg-slate-600 border border-gray-300 dark:border-slate-500 rounded-r-lg hover:bg-gray-100 dark:hover:bg-slate-500 text-gray-600 dark:text-gray-200"
      >+</button>
    </div>
  </div>
);

const TextInput = ({ label, value, placeholder, onChange }) => (
  <div className="p-4 bg-gray-50 dark:bg-slate-700 rounded-xl border border-gray-200 dark:border-slate-600 md:col-span-2">
    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">{label}</label>
    <input
      type="text"
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="block w-full rounded-lg border-gray-300 dark:border-slate-600 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm dark:bg-slate-800 dark:text-gray-100"
    />
  </div>
);

// --- Allocations Component ---

const AllocationsManager = ({ serverId, t }) => {
  const [allocations, setAllocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newPort, setNewPort] = useState('');
  const [newNote, setNewNote] = useState('');
  const [error, setError] = useState(null);

  const fetchAllocations = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('allocations')
      .select('*')
      .eq('server_id', serverId)
      .order('port_number', { ascending: true });
    
    if (data) setAllocations(data);
    setLoading(false);
  };

  useEffect(() => {
    if (serverId) fetchAllocations();
  }, [serverId]);

  const handleAdd = async () => {
    setError(null);
    const port = parseInt(newPort);
    
    // Validation
    if (isNaN(port) || port < 1024 || port > 65535) {
      setError(t('allocations.errors.invalid_range', { defaultValue: 'Port must be between 1024 and 65535' }));
      return;
    }
    if ([25565, 25575].includes(port)) {
      setError(t('allocations.errors.reserved', { defaultValue: 'This port is reserved by Minecraft' }));
      return;
    }
    if (allocations.find(a => a.port_number === port)) {
      setError(t('allocations.errors.duplicate', { defaultValue: 'Port already allocated' }));
      return;
    }

    const { error: dbError } = await supabase
      .from('allocations')
      .insert({ server_id: serverId, port_number: port, notes: newNote });

    if (dbError) {
      setError(dbError.message);
    } else {
      setNewPort('');
      setNewNote('');
      fetchAllocations();
    }
  };

  const handleDelete = async (id) => {
    if (!confirm(t('allocations.confirm_delete', { defaultValue: 'Release this port?' }))) return;
    await supabase.from('allocations').delete().eq('id', id);
    fetchAllocations();
  };

  return (
    <div className="mt-8 pt-8 border-t border-gray-100 dark:border-slate-700 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
        <WifiIcon className="w-5 h-5 text-indigo-500" />
        {t('allocations.title', { defaultValue: 'Network Allocations' })}
      </h3>
      
      <div className="bg-gray-50 dark:bg-slate-700 rounded-xl border border-gray-200 dark:border-slate-600 overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-12 gap-4 p-4 border-b border-gray-200 dark:border-slate-600 bg-gray-100 dark:bg-slate-800 text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
          <div className="col-span-3">Port</div>
          <div className="col-span-7">Notes</div>
          <div className="col-span-2 text-right">Action</div>
        </div>

        {/* List */}
        <div className="divide-y divide-gray-200 dark:divide-slate-600">
          {allocations.length === 0 && !loading && (
            <div className="p-8 text-center text-gray-500 dark:text-gray-400 text-sm italic">
              {t('allocations.empty', { defaultValue: 'No extra ports allocated.' })}
            </div>
          )}
          
          {allocations.map((alloc) => (
            <div key={alloc.id} className="grid grid-cols-12 gap-4 p-4 items-center hover:bg-white dark:hover:bg-slate-600 transition-colors">
              <div className="col-span-3 font-mono font-bold text-indigo-600 dark:text-indigo-400">{alloc.port_number}</div>
              <div className="col-span-7 text-sm text-gray-700 dark:text-gray-300 truncate">{alloc.notes || '-'}</div>
              <div className="col-span-2 text-right">
                <button 
                  onClick={() => handleDelete(alloc.id)}
                  className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                  title={t('actions.delete')}
                >
                  <TrashIcon className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Footer / Add New */}
        <div className="p-4 bg-white dark:bg-slate-800 border-t border-gray-200 dark:border-slate-600">
          <div className="flex gap-2 items-start">
            <div className="w-1/4">
               <input 
                 type="number" 
                 placeholder="1234" 
                 value={newPort}
                 onChange={e => setNewPort(e.target.value)}
                 className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-slate-600 rounded-lg dark:bg-slate-700 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
               />
            </div>
            <div className="flex-1">
               <input 
                 type="text" 
                 placeholder={t('allocations.notes_placeholder', { defaultValue: 'e.g. Simple Voice Chat' })}
                 value={newNote}
                 onChange={e => setNewNote(e.target.value)}
                 className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-slate-600 rounded-lg dark:bg-slate-700 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
               />
            </div>
            <button 
              onClick={handleAdd}
              disabled={!newPort}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <PlusIcon className="w-5 h-5" />
            </button>
          </div>
          {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
          <p className="text-xs text-gray-400 mt-2">
            {t('allocations.help', { defaultValue: 'Allocated ports will be automatically opened in the firewall on the next server restart.' })}
          </p>
        </div>
      </div>
    </div>
  );
};


// --- Main Component ---

// --- CHANGED: Added isAdmin prop ---
export default function ServerPropertiesEditor({ server, isAdmin }) {
  const { t } = useTranslation('server'); 
  
  const [propertiesText, setPropertiesText] = useState('');
  const [originalText, setOriginalText] = useState('');
  const [viewMode, setViewMode] = useState('visual'); // 'visual' | 'raw'
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);

  // Derived state
  const properties = useMemo(() => parseProperties(propertiesText), [propertiesText]);
  const hasChanges = propertiesText !== originalText;

  // --- Configuration Data (Memoized for Translation) ---
  const CONFIG = useMemo(() => {
    const GROUPS = {
      GAMEPLAY: {
        id: 'gameplay',
        label: t('properties.groups.gameplay'),
        icon: PuzzlePieceIcon,
        keys: ['gamemode', 'difficulty', 'pvp', 'allow-flight', 'force-gamemode', 'hardcore']
      },
      WORLD: {
        id: 'world',
        label: t('properties.groups.world'),
        icon: GlobeAmericasIcon,
        keys: ['level-name', 'level-seed', 'level-type', 'generate-structures', 'spawn-protection', 'spawn-animals', 'spawn-monsters', 'spawn-npcs']
      },
      PERFORMANCE: {
        id: 'performance',
        label: t('properties.groups.performance'),
        icon: CpuChipIcon,
        keys: ['max-players', 'view-distance', 'simulation-distance', 'player-idle-timeout', 'rate-limit']
      },
      SECURITY: {
        id: 'security',
        label: t('properties.groups.security'),
        icon: ShieldCheckIcon,
        keys: ['online-mode', 'white-list', 'enable-command-block', 'enforce-whitelist', 'server-port', 'enable-rcon']
      },
      ADVANCED: {
        id: 'advanced',
        label: t('properties.groups.advanced'),
        icon: AdjustmentsHorizontalIcon,
        keys: ['resource-pack', 'resource-pack-prompt', 'require-resource-pack', 'motd']
      }
    };

    // Map keys to their group (helper)
    const KEY_TO_GROUP = Object.values(GROUPS).reduce((acc, group) => {
      group.keys.forEach(k => acc[k] = group.id);
      return acc;
    }, {});

    const PRETTY_LABELS = {
      'max-players': t('properties.labels.max-players'),
      'gamemode': t('properties.labels.gamemode'),
      'difficulty': t('properties.labels.difficulty'),
      'online-mode': t('properties.labels.online-mode'),
      'white-list': t('properties.labels.white-list'),
      'pvp': t('properties.labels.pvp'),
      'allow-flight': t('properties.labels.allow-flight'),
      'enable-command-block': t('properties.labels.enable-command-block'),
      'spawn-animals': t('properties.labels.spawn-animals'),
      'spawn-monsters': t('properties.labels.spawn-monsters'),
      'spawn-npcs': t('properties.labels.spawn-npcs'),
      'force-gamemode': t('properties.labels.force-gamemode'),
      'player-idle-timeout': t('properties.labels.player-idle-timeout'),
      'require-resource-pack': t('properties.labels.require-resource-pack'),
      'resource-pack': t('properties.labels.resource-pack'),
      'resource-pack-prompt': t('properties.labels.resource-pack-prompt'),
      'spawn-protection': t('properties.labels.spawn-protection'),
      'simulation-distance': t('properties.labels.simulation-distance'),
      'view-distance': t('properties.labels.view-distance'),
      'level-seed': t('properties.labels.level-seed'),
      'level-name': t('properties.labels.level-name'),
      'motd': t('properties.labels.motd'),
      'hardcore': t('properties.labels.hardcore'),
      'rate-limit': t('properties.labels.rate-limit'),
      'server-port': t('properties.labels.server-port'),
      'enforce-whitelist': t('properties.labels.enforce-whitelist'),
      'enable-rcon': t('properties.labels.enable-rcon'),
      'level-type': t('properties.labels.level-type'),
      'generate-structures': t('properties.labels.generate-structures')
    };

    const GAMEMODE_OPTIONS = [
      { label: t('properties.options.survival'), value: 'survival' },
      { label: t('properties.options.creative'), value: 'creative' },
      { label: t('properties.options.adventure'), value: 'adventure' },
      { label: t('properties.options.spectator'), value: 'spectator' },
    ];

    const DIFFICULTY_OPTIONS = [
      { label: t('properties.options.peaceful'), value: 'peaceful' },
      { label: t('properties.options.easy'), value: 'easy' },
      { label: t('properties.options.normal'), value: 'normal' },
      { label: t('properties.options.hard'), value: 'hard' },
    ];

    return { GROUPS, KEY_TO_GROUP, PRETTY_LABELS, GAMEMODE_OPTIONS, DIFFICULTY_OPTIONS };
  }, [t]);

  // --- Fetch Data ---
  useEffect(() => {
    if (!server?.id) return;
    const load = async () => {
      try {
        setIsLoading(true);
        // --- AUTH FIX: Get Token ---
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error("No active session");
        // --------------------------

        const res = await fetch(`/api/servers/${server.id}/properties`, {
           headers: { 'Authorization': `Bearer ${session.access_token}` }
        });

        if (!res.ok) throw new Error('Failed to load properties');
        const text = await res.text();
        setPropertiesText(text);
        setOriginalText(text);
      } catch (err) {
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [server.id]);

  // --- Handlers ---

  const updateProperty = (key, value) => {
    const newProps = { ...properties };
    if (value === undefined || value === null) delete newProps[key];
    else newProps[key] = String(value);
    setPropertiesText(serializeProperties(newProps));
  };

  const handleSave = async () => {
    try {
      setIsSaving(true);
      setError(null);
      setMessage(null);
      
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("No active session");

      const res = await fetch(`/api/servers/${server.id}/properties`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'text/plain',
          'Authorization': `Bearer ${session.access_token}` 
        },
        body: propertiesText,
      });
      
      if (!res.ok) throw new Error('Failed to save properties');
      
      const propsMap = parseProperties(propertiesText);
      const isWhitelistOn = toBool(propsMap['white-list']);
      
      await supabase
        .from('servers')
        .update({ whitelist_enabled: isWhitelistOn })
        .eq('id', server.id);

      setOriginalText(propertiesText);
      setMessage(t('properties.ui.save_success')); 
      setTimeout(() => setMessage(null), 5000);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    if (confirm(t('properties.ui.confirm_discard'))) { 
      setPropertiesText(originalText);
    }
  };

  // --- Render Helpers ---

  const renderField = (key) => {
    const val = properties[key];
    const label = CONFIG.PRETTY_LABELS[key] || key;

    // Toggle Types
    if ([
      'online-mode', 'white-list', 'pvp', 'allow-flight', 
      'enable-command-block', 'spawn-animals', 'spawn-monsters', 
      'spawn-npcs', 'force-gamemode', 'require-resource-pack', 
      'generate-structures', 'hardcore', 'enforce-whitelist', 'enable-rcon'
    ].includes(key)) {
      return <ToggleInput key={key} label={label} value={toBool(val)} onChange={(v) => updateProperty(key, v)} />;
    }

    // Select Types
    if (key === 'gamemode') return <SelectInput key={key} label={label} value={val} options={CONFIG.GAMEMODE_OPTIONS} onChange={(v) => updateProperty(key, v)} />;
    if (key === 'difficulty') return <SelectInput key={key} label={label} value={val} options={CONFIG.DIFFICULTY_OPTIONS} onChange={(v) => updateProperty(key, v)} />;

    // Number Types
    if ([
      'max-players', 'view-distance', 'simulation-distance', 
      'player-idle-timeout', 'spawn-protection', 'server-port', 'rate-limit'
    ].includes(key)) {
      return <NumberInput key={key} label={label} value={toNum(val)} onChange={(v) => updateProperty(key, v)} />;
    }

    // Text Types
    return <TextInput key={key} label={label} value={val} placeholder={`...`} onChange={(v) => updateProperty(key, v)} />;
  };

  if (isLoading) return (
    <div className="flex justify-center items-center py-20 bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700">
      <div className="animate-spin rounded-full h-10 w-10 border-4 border-indigo-600 border-t-transparent"></div>
    </div>
  );

  return (
    <div className="space-y-6">
      
      {/* Header & Controls */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white dark:bg-slate-800 p-4 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700">
        <div className="relative flex-1 w-full md:w-auto md:max-w-md">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 dark:text-gray-500" />
          <input 
            type="text" 
            placeholder={t('properties.ui.search_placeholder')} 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 pr-4 py-2 w-full border border-gray-300 dark:border-slate-600 dark:bg-slate-800 dark:text-gray-100 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
          />
        </div>
        
        {/* --- CHANGED: Only show Raw/Visual toggle if Admin --- */}
        {isAdmin && (
          <div className="flex items-center gap-2 w-full md:w-auto bg-gray-100 dark:bg-slate-700 p-1 rounded-xl">
            <button
              onClick={() => setViewMode('visual')}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                viewMode === 'visual' ? 'bg-white dark:bg-slate-800 text-indigo-600 shadow-sm' : 'text-gray-500 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100'
              }`}
            >
              <AdjustmentsHorizontalIcon className="w-4 h-4" /> {t('properties.ui.visual_view')} 
            </button>
            <button
              onClick={() => setViewMode('raw')}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                viewMode === 'raw' ? 'bg-white dark:bg-slate-800 text-indigo-600 shadow-sm' : 'text-gray-500 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100'
              }`}
            >
              <CommandLineIcon className="w-4 h-4" /> {t('properties.ui.raw_view')} 
            </button>
          </div>
        )}
      </div>

      {/* Main Content Area */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700 overflow-hidden min-h-[500px]">
        {viewMode === 'raw' ? (
          <div className="h-full flex flex-col">
            <div className="bg-gray-50 dark:bg-slate-700 px-6 py-3 border-b border-gray-200 dark:border-slate-700 text-xs text-gray-500 dark:text-gray-400 font-mono">
              {t('properties.ui.file_name')} 
            </div>
            <textarea
              value={propertiesText}
              onChange={(e) => setPropertiesText(e.target.value)}
              className="w-full h-[600px] p-6 font-mono text-sm bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-300 border-none outline-none resize-y"
              spellCheck="false"
            />
          </div>
        ) : (
          <div className="p-6 space-y-8">
            {Object.values(CONFIG.GROUPS).map((group) => {
              // Filter keys based on search
              const activeKeys = group.keys.filter(k => {
                const label = CONFIG.PRETTY_LABELS[k] || k;
                return !searchQuery || 
                       k.toLowerCase().includes(searchQuery.toLowerCase()) || 
                       label.toLowerCase().includes(searchQuery.toLowerCase());
              });

              if (activeKeys.length === 0) return null;

              return (
                <div key={group.id} className="animate-in fade-in slide-in-from-bottom-2 duration-500">
                  <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2 border-b border-gray-100 dark:border-slate-700 pb-2">
                    <group.icon className="w-5 h-5 text-indigo-500" />
                    {group.label}
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {activeKeys.map(key => renderField(key))}
                  </div>
                </div>
              );
            })}
            
            {/* Show "Other" properties not in our strict groups if searched */}
            {searchQuery && (
              <div className="pt-4">
                <h4 className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-2 uppercase">{t('properties.ui.other_matches')}</h4> 
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {Object.keys(properties)
                    .filter(k => !CONFIG.KEY_TO_GROUP[k] && k.toLowerCase().includes(searchQuery.toLowerCase()))
                    .map(key => <TextInput key={key} label={key} value={properties[key]} onChange={(v) => updateProperty(key, v)} />)
                  }
                </div>
              </div>
            )}

            {/* --- NEW: Allocations Manager (Inside Visual View) --- */}
            {!searchQuery && (
              <AllocationsManager serverId={server.id} t={t} />
            )}

          </div>
        )}
      </div>

      {/* Floating Action Bar (Only shows when changes exist) */}
      <AnimatePresence>
        {hasChanges && (
          <motion.div 
            initial={{ y: 100, opacity: 0 }} 
            animate={{ y: 0, opacity: 1 }} 
            exit={{ y: 100, opacity: 0 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-white/90 dark:bg-slate-800/90 backdrop-blur-md border border-indigo-200 dark:border-indigo-900 shadow-2xl rounded-2xl px-6 py-4 flex items-center gap-6 max-w-lg w-[90%]"
          >
            <div className="flex-1">
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{t('properties.ui.unsaved_title')}</p> 
              <p className="text-xs text-gray-500 dark:text-gray-400">{t('properties.ui.unsaved_desc')}</p> 
            </div>
            <div className="flex items-center gap-3">
              <button 
                onClick={handleReset}
                disabled={isSaving}
                className="text-sm font-medium text-gray-600 dark:text-gray-300 hover:text-red-600 transition-colors"
              >
                {t('properties.ui.discard')} 
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl font-bold shadow-lg shadow-indigo-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSaving ? <ArrowPathIcon className="w-4 h-4 animate-spin" /> : <CheckCircleIcon className="w-4 h-4" />}
                {t('properties.ui.save')} 
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Feedback Toasts (No change needed) */}
      <AnimatePresence>
        {message && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="fixed bottom-6 right-6 z-50 bg-green-600 text-white px-6 py-3 rounded-xl shadow-lg flex items-center gap-3">
            <CheckCircleIcon className="w-5 h-5" /> {message}
          </motion.div>
        )}
        {error && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="fixed bottom-6 right-6 z-50 bg-red-600 text-white px-6 py-3 rounded-xl shadow-lg flex items-center gap-3">
            <ExclamationCircleIcon className="w-5 h-5" /> {error}
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}