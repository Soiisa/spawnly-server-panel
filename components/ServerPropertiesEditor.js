import { useState, useEffect, useMemo } from 'react';

/**
 * ServerPropertiesEditor
 * - Parses server.properties text -> key/value map
 * - Renders two-column card UI for common keys (toggles, selects, steppers)
 * - Keeps textarea and cards in sync
 *
 * Requires Tailwind CSS.
 */
export default function ServerPropertiesEditor({ server }) {
  const [propertiesText, setPropertiesText] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [isServerOffline, setIsServerOffline] = useState(false);
  const [showRaw, setShowRaw] = useState(false);

  // Keys we want to show as cards in this UI (order matters)
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

  // ------------ Parsing Utilities ------------
  const parseProperties = (text) => {
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
  };

  const serializeProperties = (map) => {
    const keys = [...KEY_ORDER.filter((k) => k in map), ...Object.keys(map).filter((k) => !KEY_ORDER.includes(k))];
    return keys.map((k) => `${k}=${map[k]}`).join('\n');
  };

  // parsedProperties derived from propertiesText
  const parsed = useMemo(() => parseProperties(propertiesText || ''), [propertiesText]);

  // Helper to update a single key and sync textarea
  const setProperty = (key, value) => {
    const next = { ...parsed };
    if (value === '' || value === null || value === undefined) {
      delete next[key];
    } else {
      next[key] = String(value);
    }
    const serialized = serializeProperties(next);
    setPropertiesText(serialized);
  };

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
      <div className="bg-gray-900 rounded-lg shadow p-6 text-white">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold">Server Properties</h2>
        </div>
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-400 mx-auto"></div>
          <p className="mt-4 text-gray-300">Loading server properties...</p>
        </div>
      </div>
    );
  }

  // Build a list of cards to render in order
  const cards = KEY_ORDER.map((key) => {
    return { key, value: parsed[key] ?? '' };
  });

  // Helpers
  const boolValue = (val) => {
    if (val === undefined || val === null || val === '') return false;
    const v = String(val).toLowerCase();
    return v === 'true' || v === '1' || v === 'yes' || v === 'on';
  };

  const numberValue = (val, fallback = 0) => {
    const n = Number(val);
    return Number.isFinite(n) ? n : fallback;
  };

  // Card components
  const Toggle = ({ checked, onChange }) => (
    <button
      onClick={() => onChange(!checked)}
      className={`w-12 h-7 rounded-full flex items-center px-1 transition-colors ${checked ? 'bg-green-500 justify-end' : 'bg-gray-700 justify-start'}`}
      aria-pressed={checked}
      title={checked ? 'Enabled' : 'Disabled'}
    >
      <span className={`inline-block w-5 h-5 rounded-full bg-white shadow`} />
    </button>
  );

  const Stepper = ({ value, min = 0, max = 1000, onChange }) => (
    <div className="flex items-center space-x-2">
      <button
        onClick={() => onChange(Math.max(min, value - 1))}
        className="px-2 py-1 rounded bg-gray-800 hover:bg-gray-700"
        title="Decrease"
      >
        −
      </button>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Math.max(min, Math.min(max, Number(e.target.value || 0))))}
        className="w-20 text-center bg-gray-900 border border-gray-800 rounded px-2 py-1"
      />
      <button
        onClick={() => onChange(Math.min(max, value + 1))}
        className="px-2 py-1 rounded bg-gray-800 hover:bg-gray-700"
        title="Increase"
      >
        +
      </button>
    </div>
  );

  return (
    <div className="bg-gray-900 text-white rounded-lg shadow p-6">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold">Server Properties {isServerOffline && <span className="text-sm text-yellow-600">(Offline Mode)</span>}</h2>
          <p className="text-sm text-gray-400">
            Friendly editor for your <code>server.properties</code>. Changes sync to the raw file below.
            {isServerOffline && ' Changes will be applied when the server is restarted.'}
          </p>
        </div>

        <div className="flex items-center space-x-3">
          {isServerOffline && (
            <div className="px-3 py-1 bg-yellow-600 text-gray-900 rounded text-sm font-semibold">Server Offline</div>
          )}
          <button
            onClick={handleReset}
            disabled={isSaving}
            className="px-4 py-2 bg-gray-800 text-gray-200 rounded hover:bg-gray-700 disabled:opacity-50"
            title="Re-fetch properties"
          >
            Reset
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-500 disabled:opacity-50 flex items-center"
          >
            {isSaving && (
              <svg className="animate-spin -ml-1 mr-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
              </svg>
            )}
            Save Changes
          </button>
        </div>
      </div>

      <div className="space-y-3 mb-6">
        {error && (
          <div className="p-3 bg-red-800 text-red-100 rounded">
            <strong>Error:</strong> {error}
            <button onClick={() => setError('')} className="float-right text-red-200 font-bold">
              ×
            </button>
          </div>
        )}
        {message && (
          <div className="p-3 bg-green-800 text-green-100 rounded">
            {message}
            <button onClick={() => setMessage('')} className="float-right text-green-200 font-bold">
              ×
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {cards.map(({ key, value }) => {
          switch (key) {
            case 'max-players': {
              const v = numberValue(value || 20, 20);
              return (
                <div key={key} className="bg-gray-800 rounded-lg p-4 shadow-inner">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="text-lg font-semibold">{key === 'max-players' ? 'Vagas' : key}</div>
                      <div className="text-xs text-gray-400 mt-1">{key}</div>
                    </div>
                    <div>
                      <Stepper value={v} min={0} max={1000} onChange={(nv) => setProperty(key, nv)} />
                    </div>
                  </div>
                </div>
              );
            }

            case 'gamemode': {
              const v = value || 'survival';
              return (
                <div key={key} className="bg-gray-800 rounded-lg p-4 shadow-inner">
                  <div className="flex justify-between">
                    <div>
                      <div className="text-lg font-semibold">Modo de jogo</div>
                      <div className="text-xs text-gray-400 mt-1">{key}</div>
                    </div>
                    <div className="w-44">
                      <select
                        value={v}
                        onChange={(e) => setProperty(key, e.target.value)}
                        className="w-full bg-gray-900 border border-gray-800 rounded px-3 py-2"
                      >
                        {GAMEMODE_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              );
            }

            case 'difficulty': {
              const v = value || 'easy';
              return (
                <div key={key} className="bg-gray-800 rounded-lg p-4 shadow-inner">
                  <div className="flex justify-between">
                    <div>
                      <div className="text-lg font-semibold">Dificuldade</div>
                      <div className="text-xs text-gray-400 mt-1">{key}</div>
                    </div>
                    <div className="w-44">
                      <select
                        value={v}
                        onChange={(e) => setProperty(key, e.target.value)}
                        className="w-full bg-gray-900 border border-gray-800 rounded px-3 py-2"
                      >
                        {DIFFICULTY_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </div>
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
              const pretty = {
                'online-mode': 'Pirata',
                'white-list': 'Whitelist',
                pvp: 'PVP',
                'allow-flight': 'Voar',
                'enable-command-block': 'Blocos de Comando',
                'spawn-animals': 'Animais',
                'spawn-monsters': 'Monstro',
                'spawn-npcs': 'Aldeões',
                'force-gamemode': 'Forçar modo de jogo',
                'require-resource-pack': "É necessário um pacote de recursos",
              }[key] || key;

              return (
                <div key={key} className="bg-gray-800 rounded-lg p-4 shadow-inner flex justify-between items-center">
                  <div>
                    <div className="text-lg font-semibold">{pretty}</div>
                    <div className="text-xs text-gray-400 mt-1">{key}</div>
                  </div>
                  <Toggle checked={v} onChange={(nv) => setProperty(key, nv ? 'true' : 'false')} />
                </div>
              );
            }

            case 'player-idle-timeout': {
              const v = numberValue(value || 0, 0);
              return (
                <div key={key} className="bg-gray-800 rounded-lg p-4 shadow-inner">
                  <div className="flex justify-between items-center">
                    <div>
                      <div className="text-lg font-semibold">Tempo limite de inatividade</div>
                      <div className="text-xs text-gray-400 mt-1">{key}</div>
                    </div>
                    <Stepper value={v} min={0} max={1440} onChange={(nv) => setProperty(key, nv)} />
                  </div>
                </div>
              );
            }

            case 'resource-pack':
            case 'resource-pack-prompt': {
              const v = value || '';
              const pretty = key === 'resource-pack' ? 'Resource pack' : "Prompt do 'resource pack'";
              return (
                <div key={key} className="bg-gray-800 rounded-lg p-4 shadow-inner">
                  <div>
                    <div className="text-lg font-semibold">{pretty}</div>
                    <div className="text-xs text-gray-400 mt-1">{key}</div>
                    <input
                      value={v}
                      onChange={(e) => setProperty(key, e.target.value)}
                      placeholder={key === 'resource-pack' ? 'https://example.com/resource-pack.zip' : ''}
                      className="mt-3 w-full bg-gray-900 border border-gray-800 rounded px-3 py-2"
                    />
                  </div>
                </div>
              );
            }

            case 'spawn-protection': {
              const v = numberValue(value || 0, 0);
              return (
                <div key={key} className="bg-gray-800 rounded-lg p-4 shadow-inner flex justify-between items-center">
                  <div>
                    <div className="text-lg font-semibold">Proteção de Spawn</div>
                    <div className="text-xs text-gray-400 mt-1">{key}</div>
                  </div>
                  <div>
                    <Stepper value={v} min={0} max={100} onChange={(nv) => setProperty(key, nv)} />
                  </div>
                </div>
              );
            }

            case 'view-distance': {
              const v = numberValue(value || 10, 10);
              return (
                <div key={key} className="bg-gray-800 rounded-lg p-4 shadow-inner flex justify-between items-center">
                  <div>
                    <div className="text-lg font-semibold">Distância de visão</div>
                    <div className="text-xs text-gray-400 mt-1">{key}</div>
                  </div>
                  <div>
                    <Stepper value={v} min={3} max={32} onChange={(nv) => setProperty(key, nv)} />
                  </div>
                </div>
              );
            }

            default:
              return null;
          }
        })}
      </div>

      <div className="mt-6 border-t border-gray-800 pt-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm text-gray-400">
            Raw <code>server.properties</code> (editable)
          </div>
          <div className="flex items-center space-x-3">
            <label className="flex items-center text-sm text-gray-300">
              <input type="checkbox" className="mr-2" checked={showRaw} onChange={() => setShowRaw((s) => !s)} />
              Show raw
            </label>
            <button
              onClick={() => {
                navigator.clipboard?.writeText(propertiesText);
                setMessage('Copied raw properties to clipboard');
                setTimeout(() => setMessage(''), 2500);
              }}
              className="px-3 py-1 bg-gray-800 rounded hover:bg-gray-700"
            >
              Copy
            </button>
          </div>
        </div>

        {showRaw ? (
          <textarea
            value={propertiesText}
            onChange={(e) => setPropertiesText(e.target.value)}
            className="w-full min-h-[280px] p-4 bg-black text-green-300 border border-gray-800 rounded font-mono text-sm"
            spellCheck="false"
          />
        ) : (
          <div className="p-4 bg-gray-850 border border-gray-800 rounded text-sm text-gray-300 font-mono">
            <pre className="whitespace-pre-wrap break-words">{propertiesText || '# (no properties loaded)'}</pre>
          </div>
        )}

        <div className="mt-4 text-sm text-gray-400">
          <strong>Note:</strong> Some changes require a server restart to take effect.
          {isServerOffline && ' Changes are saved to storage and will be applied when the server is restarted.'}
        </div>
      </div>
    </div>
  );
}