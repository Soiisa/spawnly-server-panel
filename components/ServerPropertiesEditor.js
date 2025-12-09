import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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
  ExclamationCircleIcon
} from '@heroicons/react/24/outline';

// --- Configuration Constants ---

const GROUPS = {
  GAMEPLAY: {
    id: 'gameplay',
    label: 'Gameplay',
    icon: PuzzlePieceIcon,
    keys: ['gamemode', 'difficulty', 'pvp', 'allow-flight', 'force-gamemode', 'hardcore']
  },
  WORLD: {
    id: 'world',
    label: 'World Generation',
    icon: GlobeAmericasIcon,
    keys: ['level-name', 'level-seed', 'level-type', 'generate-structures', 'spawn-protection', 'spawn-animals', 'spawn-monsters', 'spawn-npcs']
  },
  PERFORMANCE: {
    id: 'performance',
    label: 'Performance & Limits',
    icon: CpuChipIcon,
    keys: ['max-players', 'view-distance', 'simulation-distance', 'player-idle-timeout', 'rate-limit']
  },
  SECURITY: {
    id: 'security',
    label: 'Security & Network',
    icon: ShieldCheckIcon,
    keys: ['online-mode', 'white-list', 'enable-command-block', 'enforce-whitelist', 'server-port', 'enable-rcon']
  },
  ADVANCED: {
    id: 'advanced',
    label: 'Advanced / Other',
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
  'max-players': 'Max Players',
  'gamemode': 'Game Mode',
  'difficulty': 'Difficulty',
  'online-mode': 'Online Mode (Premium)',
  'white-list': 'Enable Whitelist',
  'pvp': 'PvP Enabled',
  'allow-flight': 'Allow Flight',
  'enable-command-block': 'Command Blocks',
  'spawn-animals': 'Spawn Animals',
  'spawn-monsters': 'Spawn Monsters',
  'spawn-npcs': 'Spawn NPCs',
  'force-gamemode': 'Force Game Mode',
  'player-idle-timeout': 'Idle Timeout (min)',
  'require-resource-pack': 'Require Resource Pack',
  'resource-pack': 'Resource Pack URL',
  'resource-pack-prompt': 'Resource Pack Prompt',
  'spawn-protection': 'Spawn Protection Radius',
  'simulation-distance': 'Sim Distance (Chunks)',
  'view-distance': 'View Distance (Chunks)',
  'level-seed': 'Level Seed',
  'level-name': 'Level Name',
  'motd': 'MOTD',
  'hardcore': 'Hardcore Mode'
};

const GAMEMODE_OPTIONS = [
  { label: 'Survival', value: 'survival' },
  { label: 'Creative', value: 'creative' },
  { label: 'Adventure', value: 'adventure' },
  { label: 'Spectator', value: 'spectator' },
];

const DIFFICULTY_OPTIONS = [
  { label: 'Peaceful', value: 'peaceful' },
  { label: 'Easy', value: 'easy' },
  { label: 'Normal', value: 'normal' },
  { label: 'Hard', value: 'hard' },
];

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
  <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-200">
    <span className="text-sm font-medium text-gray-700">{label}</span>
    <button
      onClick={() => onChange(!value)}
      className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${value ? 'bg-indigo-600' : 'bg-gray-200'}`}
    >
      <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${value ? 'translate-x-5' : 'translate-x-0'}`} />
    </button>
  </div>
);

const SelectInput = ({ label, value, options, onChange }) => (
  <div className="p-4 bg-gray-50 rounded-xl border border-gray-200">
    <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">{label}</label>
    <select
      value={value || options[0].value}
      onChange={(e) => onChange(e.target.value)}
      className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm py-2"
    >
      {options.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
    </select>
  </div>
);

const NumberInput = ({ label, value, min = 0, max = 9999, onChange }) => (
  <div className="p-4 bg-gray-50 rounded-xl border border-gray-200">
    <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">{label}</label>
    <div className="flex items-center">
      <button 
        onClick={() => onChange(Math.max(min, Number(value) - 1))}
        className="w-8 h-8 flex items-center justify-center bg-white border border-gray-300 rounded-l-lg hover:bg-gray-100 text-gray-600"
      >-</button>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Math.max(min, Math.min(max, Number(e.target.value))))}
        className="block w-full border-y border-gray-300 text-center focus:ring-0 focus:border-indigo-500 sm:text-sm py-1.5 z-10"
      />
      <button 
        onClick={() => onChange(Math.min(max, Number(value) + 1))}
        className="w-8 h-8 flex items-center justify-center bg-white border border-gray-300 rounded-r-lg hover:bg-gray-100 text-gray-600"
      >+</button>
    </div>
  </div>
);

const TextInput = ({ label, value, placeholder, onChange }) => (
  <div className="p-4 bg-gray-50 rounded-xl border border-gray-200 md:col-span-2">
    <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">{label}</label>
    <input
      type="text"
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
    />
  </div>
);

// --- Main Component ---

export default function ServerPropertiesEditor({ server }) {
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

  // --- Fetch Data ---
  useEffect(() => {
    if (!server?.id) return;
    const load = async () => {
      try {
        setIsLoading(true);
        const res = await fetch(`/api/servers/${server.id}/properties`);
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
      
      const res = await fetch(`/api/servers/${server.id}/properties`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: propertiesText,
      });
      
      if (!res.ok) throw new Error('Failed to save properties');
      
      setOriginalText(propertiesText);
      setMessage('Properties saved successfully! Restart server to apply.');
      setTimeout(() => setMessage(null), 5000);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    if (confirm('Discard all unsaved changes?')) {
      setPropertiesText(originalText);
    }
  };

  // --- Render Helpers ---

  const renderField = (key) => {
    const val = properties[key];
    const label = PRETTY_LABELS[key] || key;

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
    if (key === 'gamemode') return <SelectInput key={key} label={label} value={val} options={GAMEMODE_OPTIONS} onChange={(v) => updateProperty(key, v)} />;
    if (key === 'difficulty') return <SelectInput key={key} label={label} value={val} options={DIFFICULTY_OPTIONS} onChange={(v) => updateProperty(key, v)} />;

    // Number Types
    if ([
      'max-players', 'view-distance', 'simulation-distance', 
      'player-idle-timeout', 'spawn-protection', 'server-port', 'rate-limit'
    ].includes(key)) {
      return <NumberInput key={key} label={label} value={toNum(val)} onChange={(v) => updateProperty(key, v)} />;
    }

    // Text Types
    return <TextInput key={key} label={label} value={val} placeholder={`Enter ${label}...`} onChange={(v) => updateProperty(key, v)} />;
  };

  if (isLoading) return (
    <div className="flex justify-center items-center py-20">
      <div className="animate-spin rounded-full h-10 w-10 border-4 border-indigo-600 border-t-transparent"></div>
    </div>
  );

  return (
    <div className="space-y-6">
      
      {/* Header & Controls */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-4 rounded-2xl shadow-sm border border-gray-200">
        <div className="relative flex-1 w-full md:w-auto md:max-w-md">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input 
            type="text" 
            placeholder="Search settings..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 pr-4 py-2 w-full border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
          />
        </div>
        
        <div className="flex items-center gap-2 w-full md:w-auto bg-gray-100 p-1 rounded-xl">
          <button
            onClick={() => setViewMode('visual')}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              viewMode === 'visual' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-900'
            }`}
          >
            <AdjustmentsHorizontalIcon className="w-4 h-4" /> Visual
          </button>
          <button
            onClick={() => setViewMode('raw')}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              viewMode === 'raw' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-900'
            }`}
          >
            <CommandLineIcon className="w-4 h-4" /> Raw File
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden min-h-[500px]">
        {viewMode === 'raw' ? (
          <div className="h-full flex flex-col">
            <div className="bg-gray-50 px-6 py-3 border-b border-gray-200 text-xs text-gray-500 font-mono">
              server.properties
            </div>
            <textarea
              value={propertiesText}
              onChange={(e) => setPropertiesText(e.target.value)}
              className="w-full h-[600px] p-6 font-mono text-sm bg-white text-slate-800 border-none outline-none resize-y"
              spellCheck="false"
            />
          </div>
        ) : (
          <div className="p-6 space-y-8">
            {Object.values(GROUPS).map((group) => {
              // Filter keys based on search
              const activeKeys = group.keys.filter(k => {
                const label = PRETTY_LABELS[k] || k;
                return !searchQuery || 
                       k.toLowerCase().includes(searchQuery.toLowerCase()) || 
                       label.toLowerCase().includes(searchQuery.toLowerCase());
              });

              if (activeKeys.length === 0) return null;

              return (
                <div key={group.id} className="animate-in fade-in slide-in-from-bottom-2 duration-500">
                  <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2 border-b border-gray-100 pb-2">
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
                <h4 className="text-sm font-semibold text-gray-500 mb-2 uppercase">Other Matches</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {Object.keys(properties)
                    .filter(k => !KEY_TO_GROUP[k] && k.toLowerCase().includes(searchQuery.toLowerCase()))
                    .map(key => <TextInput key={key} label={key} value={properties[key]} onChange={(v) => updateProperty(key, v)} />)
                  }
                </div>
              </div>
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
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-white/90 backdrop-blur-md border border-indigo-200 shadow-2xl rounded-2xl px-6 py-4 flex items-center gap-6 max-w-lg w-[90%]"
          >
            <div className="flex-1">
              <p className="text-sm font-semibold text-gray-900">Unsaved Changes</p>
              <p className="text-xs text-gray-500">Changes will apply after a server restart.</p>
            </div>
            <div className="flex items-center gap-3">
              <button 
                onClick={handleReset}
                disabled={isSaving}
                className="text-sm font-medium text-gray-600 hover:text-red-600 transition-colors"
              >
                Discard
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl font-bold shadow-lg shadow-indigo-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSaving ? <ArrowPathIcon className="w-4 h-4 animate-spin" /> : <CheckCircleIcon className="w-4 h-4" />}
                Save Changes
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Feedback Toasts */}
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