import { useState, useEffect, useMemo, memo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// Move constants and pure functions outside the component to prevent re-renders
const KEY_ORDER = [
  'max-players',
  'gamemode',
  'difficulty',
  'online-mode',
  'white-list',
  'pvp',
  'allow-flight',
  'enable-command-block',
  'spawn-animals',
  'spawn-monsters',
  'spawn-npcs',
  'force-gamemode',
  'player-idle-timeout',
  'require-resource-pack',
  'resource-pack',
  'resource-pack-prompt',
  'spawn-protection',
  'simulation-distance',
  'view-distance',
];

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

const prettyLabels = {
  'max-players': 'Vagas',
  'gamemode': 'Modo de jogo',
  'difficulty': 'Dificuldade',
  'online-mode': 'Pirata',
  'white-list': 'Whitelist',
  pvp: 'PVP',
  'allow-flight': 'Voar',
  'enable-command-block': 'Blocos de Comando',
  'spawn-animals': 'Animais',
  'spawn-monsters': 'Monstro',
  'spawn-npcs': 'Aldeões',
  'force-gamemode': 'Forçar modo de jogo',
  'player-idle-timeout': 'Tempo limite de inatividade',
  'require-resource-pack': 'É necessário um pacote de recursos',
  'resource-pack': 'Resource pack',
  'resource-pack-prompt': "Prompt do 'resource pack'",
  'spawn-protection': 'Proteção de Spawn',
  'simulation-distance': 'Distância de simulação',
  'view-distance': 'Distância de visão',
};

// Pure helper functions - defined outside component
const boolValue = (val) => {
  if (val === undefined || val === null || val === '') return false;
  const v = String(val).toLowerCase();
  return v === 'true' || v === '1' || v === 'yes' || v === 'on';
};

const numberValue = (val, fallback = 0) => {
  const n = Number(val);
  return Number.isFinite(n) ? n : fallback;
};

// Memoized card components with stable references
const Toggle = memo(({ checked, onChange, label }) => (
  <div className="relative group">
    <button
      onClick={() => onChange(!checked)}
      className={`w-12 h-6 rounded-full flex items-center px-1 transition-all duration-300 ${checked ? 'bg-green-500' : 'bg-gray-300'}`}
      aria-pressed={checked}
      title={label}
    >
      <motion.span
        className="inline-block w-4 h-4 rounded-full bg-white shadow"
        animate={{ x: checked ? 24 : 2 }}
        transition={{ type: 'spring', stiffness: 700, damping: 30 }}
      />
    </button>
    <span className="absolute -top-8 left-1/2 transform -translate-x-1/2 bg-gray-800 text-xs text-gray-200 px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity">
      {label}
    </span>
  </div>
));

const Stepper = memo(({ value, min = 0, max = 1000, onChange, label }) => (
  <div className="relative group flex items-center space-x-2">
    <button
      onClick={() => onChange(Math.max(min, value - 1))}
      className="px-3 py-1 rounded bg-gray-200 hover:bg-gray-300 transition-colors"
      title="Decrease"
    >
      −
    </button>
    <input
      type="number"
      value={value}
      onChange={(e) => onChange(Math.max(min, Math.min(max, Number(e.target.value || 0))))}
      className="w-20 text-center bg-white border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-600"
    />
    <button
      onClick={() => onChange(Math.min(max, value + 1))}
      className="px-3 py-1 rounded bg-gray-200 hover:bg-gray-300 transition-colors"
      title="Increase"
    >
      +
    </button>
    <span className="absolute -top-8 left-1/2 transform -translate-x-1/2 bg-gray-800 text-xs text-gray-200 px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity">
      {label}
    </span>
  </div>
));

const MemoCard = memo(function Card({ propKey, value, setProperty }) {
  const pretty = prettyLabels[propKey] || propKey;

  switch (propKey) {
    case 'max-players': {
      const v = numberValue(value || 20, 20);
      return (
        <div className="bg-gray-100 rounded-lg p-5 shadow-sm">
          <div className="flex justify-between items-center">
            <div>
              <div className="text-lg font-semibold text-gray-900">{pretty}</div>
              <div className="text-xs text-gray-500 mt-1">{propKey}</div>
            </div>
            <Stepper value={v} min={0} max={1000} onChange={(nv) => setProperty(propKey, nv)} label="Maximum players" />
          </div>
        </div>
      );
    }

    case 'gamemode': {
      const v = value || 'survival';
      return (
        <div className="bg-gray-100 rounded-lg p-5 shadow-sm">
          <div className="flex justify-between items-center">
            <div>
              <div className="text-lg font-semibold text-gray-900">{pretty}</div>
              <div className="text-xs text-gray-500 mt-1">{propKey}</div>
            </div>
            <select
              value={v}
              onChange={(e) => setProperty(propKey, e.target.value)}
              className="w-44 bg-white border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-600"
            >
              {GAMEMODE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      );
    }

    case 'difficulty': {
      const v = value || 'easy';
      return (
        <div className="bg-gray-100 rounded-lg p-5 shadow-sm">
          <div className="flex justify-between items-center">
            <div>
              <div className="text-lg font-semibold text-gray-900">{pretty}</div>
              <div className="text-xs text-gray-500 mt-1">{propKey}</div>
            </div>
            <select
              value={v}
              onChange={(e) => setProperty(propKey, e.target.value)}
              className="w-44 bg-white border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-600"
            >
              {DIFFICULTY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      );
    }

    case 'online-mode':
    case 'white-list':
    case 'pvp':
    case 'allow-flight':
    case 'enable-command-block':
    case 'spawn-animals':
    case 'spawn-monsters':
    case 'spawn-npcs':
    case 'force-gamemode':
    case 'require-resource-pack': {
      const v = boolValue(value);
      return (
        <div className="bg-gray-100 rounded-lg p-5 shadow-sm flex justify-between items-center">
          <div>
            <div className="text-lg font-semibold text-gray-900">{pretty}</div>
            <div className="text-xs text-gray-500 mt-1">{propKey}</div>
          </div>
          <Toggle checked={v} onChange={(nv) => setProperty(propKey, nv ? 'true' : 'false')} label={pretty} />
        </div>
      );
    }

    case 'player-idle-timeout': {
      const v = numberValue(value || 0, 0);
      return (
        <div className="bg-gray-100 rounded-lg p-5 shadow-sm">
          <div className="flex justify-between items-center">
            <div>
              <div className="text-lg font-semibold text-gray-900">{pretty}</div>
              <div className="text-xs text-gray-500 mt-1">{propKey}</div>
            </div>
            <Stepper value={v} min={0} max={1440} onChange={(nv) => setProperty(propKey, nv)} label="Idle timeout (minutes)" />
          </div>
        </div>
      );
    }

    case 'resource-pack':
    case 'resource-pack-prompt': {
      const v = value || '';
      return (
        <div className="bg-gray-100 rounded-lg p-5 shadow-sm">
          <div>
            <div className="text-lg font-semibold text-gray-900">{pretty}</div>
            <div className="text-xs text-gray-500 mt-1">{propKey}</div>
            <input
              value={v}
              onChange={(e) => setProperty(propKey, e.target.value)}
              placeholder={propKey === 'resource-pack' ? 'https://example.com/resource-pack.zip' : ''}
              className="mt-3 w-full bg-white border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-600"
            />
          </div>
        </div>
      );
    }

    case 'spawn-protection': {
      const v = numberValue(value || 0, 0);
      return (
        <div className="bg-gray-100 rounded-lg p-5 shadow-sm">
          <div className="flex justify-between items-center">
            <div>
              <div className="text-lg font-semibold text-gray-900">{pretty}</div>
              <div className="text-xs text-gray-500 mt-1">{propKey}</div>
            </div>
            <Stepper value={v} min={0} max={100} onChange={(nv) => setProperty(propKey, nv)} label="Spawn protection radius" />
          </div>
        </div>
      );
    }

    case 'view-distance': {
      const v = numberValue(value || 10, 10);
      return (
        <div className="bg-gray-100 rounded-lg p-5 shadow-sm">
          <div className="flex justify-between items-center">
            <div>
              <div className="text-lg font-semibold text-gray-900">{pretty}</div>
              <div className="text-xs text-gray-500 mt-1">{propKey}</div>
            </div>
            <Stepper value={v} min={3} max={32} onChange={(nv) => setProperty(propKey, nv)} label="View distance (chunks)" />
          </div>
        </div>
      );
    }

    case 'simulation-distance': {
      const v = numberValue(value || 10, 10);
      return (
        <div className="bg-gray-100 rounded-lg p-5 shadow-sm">
          <div className="flex justify-between items-center">
            <div>
              <div className="text-lg font-semibold text-gray-900">{pretty}</div>
              <div className="text-xs text-gray-500 mt-1">{propKey}</div>
            </div>
            <Stepper value={v} min={3} max={32} onChange={(nv) => setProperty(propKey, nv)} label="Simulation distance (chunks)" />
          </div>
        </div>
      );
    }

    default:
      return null;
  }
});

/**
 * ServerPropertiesEditor
 * - Parses server.properties text -> key/value map
 * - Renders two-column card UI for common keys (toggles, selects, steppers)
 * - Keeps textarea and cards in sync
 * - White background with high-contrast colors
 * - Animations only on initial mount of container or specific state changes
 * - Memoized cards to prevent unnecessary re-renders and animation triggers
 *
 * Requires Tailwind CSS and Framer Motion.
 */
export default function ServerPropertiesEditor({ server }) {
  const [propertiesText, setPropertiesText] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [isServerOffline, setIsServerOffline] = useState(false);
  const [showRaw, setShowRaw] = useState(false);

  // ------------ Parsing Utilities ------------
  const parseProperties = useCallback((text) => {
    const lines = text.split(/\r?\n/);
    const map = {};
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx === -1) continue;
      const key = trimmed.slice(0, idx).trim();
      const value = trimmed.slice(idx + 1).trim();
      map[key] = value;
    }
    return map;
  }, []);

  const serializeProperties = useCallback((map) => {
    const keys = [...KEY_ORDER.filter((k) => k in map), ...Object.keys(map).filter((k) => !KEY_ORDER.includes(k))];
    return keys.map((k) => `${k}=${map[k]}`).join('\n');
  }, []);

  // parsedProperties derived from propertiesText
  const parsed = useMemo(() => parseProperties(propertiesText || ''), [propertiesText, parseProperties]);

  // Helper to update a single key and sync textarea - memoized with useCallback
  const setProperty = useCallback((key, value) => {
    const next = { ...parsed };
    if (value === '' || value === null || value === undefined) {
      delete next[key];
    } else {
      next[key] = String(value);
    }
    const serialized = serializeProperties(next);
    setPropertiesText(serialized);
  }, [parsed, serializeProperties]);

  // Build a list of cards to render in order - memoized
  const cards = useMemo(() => 
    KEY_ORDER.map((key) => ({ key, value: parsed[key] ?? '' })),
    [parsed]
  );

  // Fetch properties
  useEffect(() => {
    if (!server) return;

    const fetchProperties = async () => {
      try {
        setIsLoading(true);
        setError('');
        setIsServerOffline(server.status !== 'Running' || !server.ipv4);

        const response = await fetch(`/api/servers/${server.id}/properties`);
        if (!response.ok) {
          if (response.status === 404) {
            throw new Error('Server not found');
          } else {
            throw new Error(`Failed to fetch properties: ${response.statusText}`);
          }
        }
        const text = await response.text();
        setPropertiesText(text);
      } catch (err) {
        setError(err.message || String(err));
        console.error('Error fetching server properties:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchProperties();
  }, [server]);

  // Save handler (POST plain text)
  const handleSave = async () => {
    try {
      setIsSaving(true);
      setError('');
      setMessage('');
      const response = await fetch(`/api/servers/${server.id}/properties`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: propertiesText,
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.error || 'Failed to save properties');
      }
      setMessage(
        isServerOffline
          ? 'Properties saved to storage successfully! Changes will apply when the server is restarted.'
          : 'Properties saved successfully! Server restart may be required for some changes to take effect.'
      );
      setTimeout(() => setMessage(''), 5000);
    } catch (err) {
      setError(err.message || String(err));
      console.error('Error saving server properties:', err);
    } finally {
      setIsSaving(false);
    }
  };

  // Reset handler
  const handleReset = () => {
    if (!confirm('Are you sure you want to reset all changes?')) return;
    (async () => {
      setIsLoading(true);
      setError('');
      try {
        const response = await fetch(`/api/servers/${server.id}/properties`);
        if (!response.ok) throw new Error('Failed to reload properties');
        const text = await response.text();
        setPropertiesText(text);
      } catch (err) {
        setError(err.message || String(err));
      } finally {
        setIsLoading(false);
      }
    })();
  };

  if (isLoading) {
    return (
      <div className="bg-white rounded-xl shadow-lg p-6 text-gray-900">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold">Server Properties</h2>
        </div>
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-indigo-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading server properties...</p>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="bg-white text-gray-900 rounded-xl shadow-lg p-6"
    >
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-3xl font-bold">Server Properties</h2>
          <p className="text-sm text-gray-600 mt-1">
            {isServerOffline
              ? 'Server is offline. Changes will apply on restart.'
              : 'Edit server settings. Some changes require a restart.'}
          </p>
        </div>
        <div className="flex items-center space-x-4">
          {isServerOffline && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="px-3 py-1 bg-yellow-400 text-gray-900 rounded-full text-sm font-semibold"
            >
              Offline
            </motion.div>
          )}
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setShowRaw(!showRaw)}
            className="px-4 py-2 bg-gray-200 text-gray-900 rounded-lg hover:bg-gray-300 transition-colors"
          >
            {showRaw ? 'Hide Raw' : 'Edit Raw'}
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleReset}
            disabled={isSaving}
            className="px-4 py-2 bg-gray-200 text-gray-900 rounded-lg hover:bg-gray-300 disabled:opacity-50 transition-colors"
            title="Reset to original properties"
          >
            Reset
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleSave}
            disabled={isSaving}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 disabled:opacity-50 flex items-center transition-colors"
          >
            {isSaving && (
              <svg className="animate-spin -ml-1 mr-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
              </svg>
            )}
            Save Changes
          </motion.button>
        </div>
      </div>

      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="p-4 bg-red-100 text-red-800 rounded-lg mb-6 flex justify-between items-center"
          >
            <span>
              <strong>Error:</strong> {error}
            </span>
            <button onClick={() => setError('')} className="text-red-600 font-bold hover:text-red-700">
              ×
            </button>
          </motion.div>
        )}
        {message && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="p-4 bg-green-100 text-green-800 rounded-lg mb-6 flex justify-between items-center"
          >
            <span>{message}</span>
            <button onClick={() => setMessage('')} className="text-green-600 font-bold hover:text-green-700">
              ×
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showRaw && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="mb-6"
          >
            <textarea
              value={propertiesText}
              onChange={(e) => setPropertiesText(e.target.value)}
              className="w-full h-48 bg-white border border-gray-300 rounded-lg p-4 font-mono text-sm resize-y focus:outline-none focus:ring-2 focus:ring-indigo-600"
              placeholder="Raw server.properties content"
            />
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {cards.map(({ key, value }) => (
          <MemoCard
            key={key}
            propKey={key}
            value={value}
            setProperty={setProperty}
          />
        ))}
      </div>
    </motion.div>
  );
}