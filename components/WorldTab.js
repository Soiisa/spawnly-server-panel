import { useState } from 'react';
import { read, write } from 'nbtify';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  CloudArrowDownIcon, 
  CloudArrowUpIcon, 
  GlobeAltIcon, 
  AdjustmentsHorizontalIcon,
  XMarkIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  MapPinIcon,
  PuzzlePieceIcon,
  DocumentTextIcon
} from '@heroicons/react/24/outline';

export default function WorldTab({ server, token }) {
  // --- State ---
  const [isGenerateModalOpen, setIsGenerateModalOpen] = useState(false);
  const [isOptionsOpen, setIsOptionsOpen] = useState(false);
  
  // Forms
  const [formData, setFormData] = useState({
    levelName: 'world',
    seed: '',
    generatorSettings: '',
    worldType: 'default',
    generateStructures: true,
    hardcore: false,
    datapacks: '',
  });
  const [levelData, setLevelData] = useState(null);
  
  // Status
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingAction, setLoadingAction] = useState(null); // 'download', 'upload', 'generate', 'options'

  const isServerStopped = server?.status === 'Stopped';

  // --- Helpers ---
  const bigIntReviver = (key, value) => (typeof value === 'string' && /^-?\d+$/.test(value)) ? BigInt(value) : value;
  const bigIntReplacer = (key, value) => (typeof value === 'bigint' ? value.toString() : value);

  const showError = (msg) => { setError(msg); setTimeout(() => setError(null), 5000); };
  const showSuccess = (msg) => { setSuccess(msg); setTimeout(() => setSuccess(null), 5000); };

  // --- Handlers ---

  const handleDownload = async () => {
    if (!isServerStopped) return showError('Server must be stopped to download the world.');
    
    setLoadingAction('download');
    setError(null);
    try {
      const response = await fetch(`/api/servers/${server.id}/world`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error((await response.json()).error || 'Failed to download');
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${server.name}-world.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      showSuccess('World download started');
    } catch (err) {
      showError(err.message);
    } finally {
      setLoadingAction(null);
    }
  };

  const handleUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    if (!isServerStopped) return showError('Server must be stopped to upload a world.');
    if (!file.name.endsWith('.zip')) return showError('Please select a valid .zip file.');

    setLoadingAction('upload');
    setError(null);
    try {
      const formData = new FormData();
      formData.append('worldZip', file);
      
      const response = await fetch(`/api/servers/${server.id}/world`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      
      if (!response.ok) throw new Error((await response.json()).error || 'Upload failed');
      showSuccess('World uploaded and extracted successfully!');
    } catch (err) {
      showError(err.message);
    } finally {
      setLoadingAction(null);
      event.target.value = ''; // Reset input
    }
  };

  const handleGenerate = async () => {
    setLoadingAction('generate');
    setError(null);
    try {
      const response = await fetch(`/api/servers/${server.id}/world?action=generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(formData),
      });
      
      if (!response.ok) throw new Error((await response.json()).error || 'Generation failed');
      
      showSuccess('New world generated successfully!');
      setIsGenerateModalOpen(false);
    } catch (err) {
      showError(err.message);
    } finally {
      setLoadingAction(null);
    }
  };

  const handleOpenOptions = async () => {
    if (!isServerStopped) return showError('Server must be stopped to edit options.');
    
    setLoadingAction('options');
    setError(null);
    try {
      const res = await fetch(`/api/servers/${server.id}/file?path=world/level.dat`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      if (!res.ok) throw new Error('Could not find world/level.dat. Has the world been generated?');
      
      const content = await res.arrayBuffer();
      const nbtData = await read(new Uint8Array(content), { compression: 'gzip', endian: 'big' });
      // Clean parsing via JSON round-trip for BigInt safety
      const parsed = JSON.parse(JSON.stringify(nbtData.data, bigIntReplacer, 2), bigIntReviver);
      
      setLevelData(parsed);
      setIsOptionsOpen(true);
    } catch (err) {
      showError(err.message);
    } finally {
      setLoadingAction(null);
    }
  };

  const handleSaveOptions = async () => {
    setIsLoading(true);
    try {
      const nbtBuffer = await write(levelData, { compression: 'gzip', endian: 'big', name: '' });
      const response = await fetch(`/api/servers/${server.id}/files?path=world/level.dat`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/octet-stream' },
        body: nbtBuffer,
      });
      
      if (!response.ok) throw new Error('Failed to save level.dat');
      
      showSuccess('World configuration saved!');
      setIsOptionsOpen(false);
    } catch (err) {
      showError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // --- Input Handlers ---

  const handleLevelDataChange = (path, value) => {
    const parts = path.split('.');
    setLevelData((prev) => {
      const newData = { ...prev }; // Shallow copy
      let current = newData;
      
      for (let i = 0; i < parts.length - 1; i++) {
        current = current[parts[i]] = { ...current[parts[i]] }; // Deep copy path
      }
      
      const lastKey = parts[parts.length - 1];
      let typedValue = value;

      // Type safety for NBT specific fields
      if (path === 'Data.RandomSeed') {
        try { typedValue = BigInt(value); } catch { typedValue = 0n; }
      } else if (['Data.SpawnX', 'Data.SpawnY', 'Data.SpawnZ', 'Data.Difficulty'].includes(path)) {
        typedValue = parseInt(value) || 0;
      } else if (['Data.hardcore', 'Data.allowCommands', 'Data.MapFeatures'].includes(path)) {
        typedValue = value ? 1 : 0; // Boolean to Byte/Int
      } else if (path.startsWith('Data.GameRules.') || path.startsWith('Data.game_rules.')) {
        // Detect current type to preserve format (Int vs String)
        const currentVal = current[lastKey];
        if (typeof currentVal === 'number') {
           typedValue = value ? 1 : 0;
        } else {
           typedValue = value ? 'true' : 'false';
        }
      }

      current[lastKey] = typedValue;
      return newData;
    });
  };

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  };

  // --- Constants for UI ---
  const WORLD_TYPES = [
    { value: 'default', label: 'Normal' },
    { value: 'superflat', label: 'Superflat' },
    { value: 'amplified', label: 'Amplified' },
    { value: 'large_biomes', label: 'Large Biomes' },
    { value: 'single_biome', label: 'Single Biome' },
  ];

  // Helper to resolve the game rules object and path
  const getGameRulesInfo = () => {
    if (!levelData?.Data) return { rules: null, path: '' };
    if (levelData.Data.GameRules) return { rules: levelData.Data.GameRules, path: 'Data.GameRules' };
    if (levelData.Data.game_rules) return { rules: levelData.Data.game_rules, path: 'Data.game_rules' };
    return { rules: null, path: '' };
  };

  const { rules: gameRules, path: gameRulesPath } = getGameRulesInfo();

  return (
    <div className="space-y-6">
      
      {/* Warning Banner */}
      {!isServerStopped && (
        <div className="bg-amber-50 dark:bg-amber-900/30 border-l-4 border-amber-400 dark:border-amber-600 p-4 rounded-r-lg flex items-start gap-3">
          <ExclamationTriangleIcon className="w-5 h-5 text-amber-500 dark:text-amber-400 shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-medium text-amber-800 dark:text-amber-200">Server is Running</h3>
            <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
              You must stop the server to upload, download, or regenerate the world to prevent data corruption.
            </p>
          </div>
        </div>
      )}

      {/* Main Action Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        
        {/* Download Card */}
        <button
          onClick={handleDownload}
          disabled={!isServerStopped || loadingAction}
          className={`group relative overflow-hidden p-6 rounded-2xl border transition-all text-left flex flex-col justify-between h-40
            ${!isServerStopped 
              ? 'bg-gray-50 dark:bg-slate-800/50 border-gray-200 dark:border-slate-700 opacity-60 cursor-not-allowed' 
              : 'bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-500 hover:shadow-md'
            }`}
        >
          <div className="flex justify-between items-start">
            <div className={`p-3 rounded-xl ${!isServerStopped ? 'bg-gray-200 dark:bg-slate-700 text-gray-400 dark:text-gray-500' : 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 group-hover:bg-blue-100 dark:group-hover:bg-blue-900/50'}`}>
              <CloudArrowDownIcon className="w-6 h-6" />
            </div>
            {loadingAction === 'download' && <div className="animate-spin w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full" />}
          </div>
          <div>
            <h3 className="font-bold text-gray-900 dark:text-gray-100">Download World</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Backup your current world as a .zip file</p>
          </div>
        </button>

        {/* Upload Card */}
        <label
          className={`group relative overflow-hidden p-6 rounded-2xl border transition-all text-left flex flex-col justify-between h-40
            ${!isServerStopped 
              ? 'bg-gray-50 dark:bg-slate-800/50 border-gray-200 dark:border-slate-700 opacity-60 cursor-not-allowed' 
              : 'bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700 hover:border-emerald-300 dark:hover:border-emerald-500 hover:shadow-md cursor-pointer'
            }`}
        >
          <div className="flex justify-between items-start">
            <div className={`p-3 rounded-xl ${!isServerStopped ? 'bg-gray-200 dark:bg-slate-700 text-gray-400 dark:text-gray-500' : 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 group-hover:bg-emerald-100 dark:group-hover:bg-emerald-900/50'}`}>
              <CloudArrowUpIcon className="w-6 h-6" />
            </div>
            {loadingAction === 'upload' && <div className="animate-spin w-5 h-5 border-2 border-emerald-600 border-t-transparent rounded-full" />}
          </div>
          <div>
            <h3 className="font-bold text-gray-900 dark:text-gray-100">Upload World</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Restore a world from a .zip backup</p>
          </div>
          <input 
            type="file" 
            accept=".zip" 
            className="hidden" 
            disabled={!isServerStopped || loadingAction}
            onChange={handleUpload}
          />
        </label>

        {/* Generate Card */}
        <button
          onClick={() => setIsGenerateModalOpen(true)}
          disabled={!isServerStopped || loadingAction}
          className={`group relative overflow-hidden p-6 rounded-2xl border transition-all text-left flex flex-col justify-between h-40
            ${!isServerStopped 
              ? 'bg-gray-50 dark:bg-slate-800/50 border-gray-200 dark:border-slate-700 opacity-60 cursor-not-allowed' 
              : 'bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700 hover:border-purple-300 dark:hover:border-purple-500 hover:shadow-md'
            }`}
        >
          <div className="flex justify-between items-start">
            <div className={`p-3 rounded-xl ${!isServerStopped ? 'bg-gray-200 dark:bg-slate-700 text-gray-400 dark:text-gray-500' : 'bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 group-hover:bg-purple-100 dark:group-hover:bg-purple-900/50'}`}>
              <GlobeAltIcon className="w-6 h-6" />
            </div>
          </div>
          <div>
            <h3 className="font-bold text-gray-900 dark:text-gray-100">Generate New</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Create a fresh world with custom seeds</p>
          </div>
        </button>

        {/* Options Card */}
        <button
          onClick={handleOpenOptions}
          disabled={!isServerStopped || loadingAction}
          className={`group relative overflow-hidden p-6 rounded-2xl border transition-all text-left flex flex-col justify-between h-40
            ${!isServerStopped 
              ? 'bg-gray-50 dark:bg-slate-800/50 border-gray-200 dark:border-slate-700 opacity-60 cursor-not-allowed' 
              : 'bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700 hover:border-amber-300 dark:hover:border-amber-500 hover:shadow-md'
            }`}
        >
          <div className="flex justify-between items-start">
            <div className={`p-3 rounded-xl ${!isServerStopped ? 'bg-gray-200 dark:bg-slate-700 text-gray-400 dark:text-gray-500' : 'bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 group-hover:bg-amber-100 dark:group-hover:bg-amber-900/50'}`}>
              <AdjustmentsHorizontalIcon className="w-6 h-6" />
            </div>
            {loadingAction === 'options' && <div className="animate-spin w-5 h-5 border-2 border-amber-600 border-t-transparent rounded-full" />}
          </div>
          <div>
            <h3 className="font-bold text-gray-900 dark:text-gray-100">Level Config</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Edit level.dat, seeds, and game rules</p>
          </div>
        </button>
      </div>

      {/* --- Feedback Toasts --- */}
      <AnimatePresence>
        {error && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="fixed bottom-6 right-6 z-50 bg-red-600 text-white px-6 py-3 rounded-xl shadow-lg flex items-center gap-3">
            <ExclamationTriangleIcon className="w-5 h-5" /> {error}
          </motion.div>
        )}
        {success && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="fixed bottom-6 right-6 z-50 bg-green-600 text-white px-6 py-3 rounded-xl shadow-lg flex items-center gap-3">
            <CheckCircleIcon className="w-5 h-5" /> {success}
          </motion.div>
        )}
      </AnimatePresence>

      {/* --- Generate Modal --- */}
      <AnimatePresence>
        {isGenerateModalOpen && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          >
            <motion.div 
              initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="px-6 py-4 border-b border-gray-200 dark:border-slate-700 flex justify-between items-center bg-gray-50 dark:bg-slate-700">
                <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Generate World</h2>
                <button onClick={() => setIsGenerateModalOpen(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"><XMarkIcon className="w-6 h-6" /></button>
              </div>
              
              <div className="p-6 overflow-y-auto space-y-5">
                <div className="bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 p-3 rounded-lg text-sm border border-red-100 dark:border-red-800 flex gap-2">
                  <ExclamationTriangleIcon className="w-5 h-5 shrink-0" />
                  Warning: This will permanently delete the current world folder.
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Level Name</label>
                  <input type="text" name="levelName" value={formData.levelName} onChange={handleInputChange} className="w-full border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg shadow-sm focus:ring-indigo-500 focus:border-indigo-500" placeholder="world" />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Seed</label>
                    <input type="text" name="seed" value={formData.seed} onChange={handleInputChange} className="w-full border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg shadow-sm focus:ring-indigo-500 focus:border-indigo-500" placeholder="Leave empty for random" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">World Type</label>
                    <select name="worldType" value={formData.worldType} onChange={handleInputChange} className="w-full border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg shadow-sm focus:ring-indigo-500 focus:border-indigo-500">
                      {WORLD_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Datapacks (URLs)</label>
                  <input type="text" name="datapacks" value={formData.datapacks} onChange={handleInputChange} className="w-full border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg shadow-sm focus:ring-indigo-500 focus:border-indigo-500" placeholder="http://example.com/pack.zip" />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Comma separated direct download links.</p>
                </div>

                <div className="flex gap-6">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" name="generateStructures" checked={formData.generateStructures} onChange={handleInputChange} className="rounded text-indigo-600 focus:ring-indigo-500 dark:bg-slate-700 dark:border-slate-500" />
                    <span className="text-sm text-gray-700 dark:text-gray-300">Structures</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" name="hardcore" checked={formData.hardcore} onChange={handleInputChange} className="rounded text-indigo-600 focus:ring-indigo-500 dark:bg-slate-700 dark:border-slate-500" />
                    <span className="text-sm text-gray-700 dark:text-gray-300">Hardcore</span>
                  </label>
                </div>
              </div>

              <div className="px-6 py-4 border-t border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-700 flex justify-end gap-3">
                <button onClick={() => setIsGenerateModalOpen(false)} className="px-4 py-2 text-gray-700 dark:text-gray-200 font-medium hover:bg-gray-200 dark:hover:bg-slate-600 rounded-lg transition">Cancel</button>
                <button onClick={handleGenerate} disabled={loadingAction === 'generate'} className="px-4 py-2 bg-red-600 text-white font-medium hover:bg-red-700 rounded-lg shadow-sm transition disabled:opacity-50 flex items-center gap-2">
                  {loadingAction === 'generate' && <div className="animate-spin w-4 h-4 border-2 border-white/30 border-t-white rounded-full" />}
                  Generate World
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* --- Options (NBT) Modal --- */}
      <AnimatePresence>
        {isOptionsOpen && levelData && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          >
            <motion.div 
              initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[85vh]"
            >
              <div className="px-6 py-4 border-b border-gray-200 dark:border-slate-700 flex justify-between items-center bg-gray-50 dark:bg-slate-700">
                <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">World Configuration (level.dat)</h2>
                <button onClick={() => setIsOptionsOpen(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"><XMarkIcon className="w-6 h-6" /></button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-8">
                
                {/* General Section */}
                <section>
                  <h3 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2 border-b border-gray-200 dark:border-slate-700 pb-2">
                    <DocumentTextIcon className="w-4 h-4" /> General
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Level Name</label>
                      <input type="text" value={levelData.Data?.LevelName || ''} onChange={(e) => handleLevelDataChange('Data.LevelName', e.target.value)} className="w-full border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg shadow-sm focus:ring-indigo-500 sm:text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Seed</label>
                      <input type="text" value={(levelData.Data?.RandomSeed || '').toString()} onChange={(e) => handleLevelDataChange('Data.RandomSeed', e.target.value)} className="w-full border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg shadow-sm focus:ring-indigo-500 sm:text-sm font-mono" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Difficulty</label>
                      <select value={levelData.Data?.Difficulty || 0} onChange={(e) => handleLevelDataChange('Data.Difficulty', e.target.value)} className="w-full border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg shadow-sm focus:ring-indigo-500 sm:text-sm">
                        <option value={0}>Peaceful</option>
                        <option value={1}>Easy</option>
                        <option value={2}>Normal</option>
                        <option value={3}>Hard</option>
                      </select>
                    </div>
                    <div className="flex items-end gap-4 pb-2">
                      <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                        <input type="checkbox" checked={!!levelData.Data?.hardcore} onChange={(e) => handleLevelDataChange('Data.hardcore', e.target.checked)} className="rounded text-indigo-600 dark:bg-slate-700 dark:border-slate-500" />
                        Hardcore
                      </label>
                      <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                        <input type="checkbox" checked={!!levelData.Data?.allowCommands} onChange={(e) => handleLevelDataChange('Data.allowCommands', e.target.checked)} className="rounded text-indigo-600 dark:bg-slate-700 dark:border-slate-500" />
                        Cheats
                      </label>
                    </div>
                  </div>
                </section>

                {/* Spawn Section */}
                <section>
                  <h3 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2 border-b border-gray-200 dark:border-slate-700 pb-2">
                    <MapPinIcon className="w-4 h-4" /> Spawn Point
                  </h3>
                  <div className="grid grid-cols-3 gap-4">
                    {['X', 'Y', 'Z'].map((axis) => (
                      <div key={axis}>
                        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">{axis}</label>
                        <input type="number" value={levelData.Data?.[`Spawn${axis}`] || 0} onChange={(e) => handleLevelDataChange(`Data.Spawn${axis}`, e.target.value)} className="w-full border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg shadow-sm focus:ring-indigo-500 sm:text-sm text-center" />
                      </div>
                    ))}
                  </div>
                </section>

                {/* Game Rules Section */}
                <section>
                  <h3 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2 border-b border-gray-200 dark:border-slate-700 pb-2">
                    <PuzzlePieceIcon className="w-4 h-4" /> Game Rules
                  </h3>
                  {gameRules ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2">
                      {Object.entries(gameRules).map(([rule, val]) => (
                        <label key={rule} className="flex items-center justify-between py-1 text-sm text-gray-700 dark:text-gray-300 border-b border-gray-50 dark:border-slate-700/50">
                          <span className="truncate mr-2" title={rule}>{rule}</span>
                          <input 
                            type="checkbox" 
                            checked={val === 'true' || val === 1 || val === true} 
                            onChange={(e) => handleLevelDataChange(`${gameRulesPath}.${rule}`, e.target.checked)} 
                            className="rounded text-indigo-600 dark:bg-slate-700 dark:border-slate-500 focus:ring-indigo-500 shrink-0" 
                          />
                        </label>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-400 italic">No GameRules found in level.dat</p>
                  )}
                </section>

              </div>

              <div className="px-6 py-4 border-t border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-700 flex justify-end gap-3">
                <button onClick={() => setIsOptionsOpen(false)} className="px-4 py-2 text-gray-700 dark:text-gray-200 font-medium hover:bg-gray-200 dark:hover:bg-slate-600 rounded-lg transition">Cancel</button>
                <button onClick={handleSaveOptions} disabled={isLoading} className="px-4 py-2 bg-indigo-600 text-white font-medium hover:bg-indigo-700 rounded-lg shadow-sm transition disabled:opacity-50 flex items-center gap-2">
                  {isLoading && <div className="animate-spin w-4 h-4 border-2 border-white/30 border-t-white rounded-full" />}
                  Save Changes
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}