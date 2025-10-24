import { useState } from 'react';
import { read, write } from 'nbtify';
import { XMarkIcon, CloudArrowDownIcon, CloudArrowUpIcon, CogIcon, GlobeAltIcon } from '@heroicons/react/24/solid';

export default function WorldTab({ server, token }) {
  const [isGenerateModalOpen, setIsGenerateModalOpen] = useState(false);
  const [isOptionsOpen, setIsOptionsOpen] = useState(false);
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
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  const isServerStopped = server?.status === 'Stopped';

  const bigIntReviver = (key, value) => {
    if (typeof value === 'string' && /^-?\d+$/.test(value)) {
      try {
        return BigInt(value);
      } catch (e) {
        return value;
      }
    }
    return value;
  };

  const bigIntReplacer = (key, value) => (typeof value === 'bigint' ? value.toString() : value);

  const handleDownload = async () => {
    if (!isServerStopped) {
      setError('Server must be stopped to download the world.');
      return;
    }
    setError(null);
    setIsLoading(true);
    try {
      const response = await fetch(`/api/servers/${server.id}/world`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to download world');
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'world.zip';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Download world error:', err);
      setError(`Failed to download world: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpload = async (event) => {
    if (!isServerStopped) {
      setError('Server must be stopped to upload a world.');
      return;
    }
    const file = event.target.files[0];
    if (!file || !file.name.endsWith('.zip')) {
      setError('Please select a valid .zip file.');
      return;
    }
    setError(null);
    setIsLoading(true);
    try {
      const formData = new FormData();
      formData.append('worldZip', file);
      const response = await fetch(`/api/servers/${server.id}/world`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to upload world');
      }
      alert('World uploaded successfully!');
    } catch (err) {
      console.error('Upload world error:', err);
      setError(`Failed to upload world: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerate = async () => {
    if (!isServerStopped) {
      setError('Server must be stopped to generate a new world.');
      return;
    }
    setError(null);
    setIsLoading(true);
    try {
      const response = await fetch(`/api/servers/${server.id}/world?action=generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(formData),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate world');
      }
      alert('World generated successfully!');
      setIsGenerateModalOpen(false);
    } catch (err) {
      console.error('Generate world error:', err);
      setError(`Failed to generate world: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenOptions = async () => {
    if (!isServerStopped) {
      setError('Server must be stopped to edit world options.');
      return;
    }
    setError(null);
    setIsLoading(true);
    try {
      const res = await fetch(`/api/servers/${server.id}/file?path=world/level.dat`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to fetch level.dat');
      }
      const content = await res.arrayBuffer();
      const nbtData = await read(new Uint8Array(content), { compression: 'gzip', endian: 'big' });
      const stringified = JSON.stringify(nbtData.data, bigIntReplacer, 2);
      const parsedData = JSON.parse(stringified, bigIntReviver);
      setLevelData(parsedData);
      setIsOptionsOpen(true);
    } catch (err) {
      console.error('Open options error:', err);
      setError(`Failed to open world options: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveOptions = async () => {
    setError(null);
    setIsLoading(true);
    try {
      const updatedData = { ...levelData };
      const nbtBuffer = await write(updatedData, { compression: 'gzip', endian: 'big', name: '' });
      const response = await fetch(`/api/servers/${server.id}/files?path=world/level.dat`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/octet-stream',
        },
        body: nbtBuffer,
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to save world options');
      }
      alert('World options saved successfully!');
      setIsOptionsOpen(false);
    } catch (err) {
      console.error('Save options error:', err);
      setError(`Failed to save world options: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLevelDataChange = (path, value) => {
    const parts = path.split('.');
    setLevelData((prev) => {
      let current = { ...prev };
      let ref = current;
      for (let i = 0; i < parts.length - 1; i++) {
        ref = ref[parts[i]] || {};
      }
      let newValue = value;
      if (path === 'Data.RandomSeed') {
        try {
          newValue = BigInt(value);
        } catch {
          newValue = 0n;
        }
      } else if (['Data.SpawnX', 'Data.SpawnY', 'Data.SpawnZ', 'Data.Difficulty'].includes(path)) {
        newValue = parseInt(value) || 0;
      } else if (['Data.hardcore', 'Data.allowCommands', 'Data.MapFeatures'].includes(path)) {
        newValue = value ? 1 : 0;
      } else if (path.startsWith('Data.GameRules.')) {
        newValue = value ? 'true' : 'false';
      }
      ref[parts[parts.length - 1]] = newValue;
      return current;
    });
  };

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  return (
    <div className="bg-white p-6 rounded-xl shadow-lg max-w-4xl mx-auto">
      {/* Error Toast */}
      {error && (
        <div className="mb-4 p-4 bg-red-100 text-red-800 rounded-lg border border-red-300 flex justify-between items-center transition-opacity duration-300">
          <span>{error}</span>
          <button
            onClick={() => setError(null)}
            className="text-red-900 hover:text-red-700 focus:outline-none focus:ring-2 focus:ring-red-500"
            aria-label="Dismiss error"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>
      )}

      {/* Action Buttons */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <button
          onClick={handleDownload}
          disabled={isLoading || !isServerStopped}
          className="flex items-center justify-center bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
          aria-label="Download world"
        >
          <CloudArrowDownIcon className="h-5 w-5 mr-2" />
          {isLoading ? 'Processing...' : 'Download World'}
        </button>
        <label
          className={`flex items-center justify-center bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg ${
            isLoading || !isServerStopped ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
          } transition-colors duration-200 focus-within:ring-2 focus-within:ring-green-500`}
          aria-label="Upload world"
        >
          <CloudArrowUpIcon className="h-5 w-5 mr-2" />
          <span>{isLoading ? 'Processing...' : 'Upload World'}</span>
          <input
            type="file"
            accept=".zip"
            onChange={handleUpload}
            disabled={isLoading || !isServerStopped}
            className="hidden"
          />
        </label>
        <button
          onClick={handleOpenOptions}
          disabled={isLoading || !isServerStopped}
          className="flex items-center justify-center bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-gray-500"
          aria-label="Edit world options"
        >
          <CogIcon className="h-5 w-5 mr-2" />
          {isLoading ? 'Loading...' : 'Options'}
        </button>
        <button
          onClick={() => setIsGenerateModalOpen(true)}
          disabled={isLoading || !isServerStopped}
          className="flex items-center justify-center bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-purple-500"
          aria-label="Generate new world"
        >
          <GlobeAltIcon className="h-5 w-5 mr-2" />
          {isLoading ? 'Processing...' : 'Generate New World'}
        </button>
      </div>

      {/* Generate World Modal */}
      {isGenerateModalOpen && (
        <div className="fixed inset-0 bg-gray-900 bg-opacity-75 flex items-center justify-center z-50 transition-opacity duration-300">
          <div className="bg-white p-6 rounded-xl shadow-2xl max-w-md w-full sm:max-w-lg transform transition-transform duration-300 scale-100">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-bold text-gray-800">Generate New World</h2>
              <button
                onClick={() => setIsGenerateModalOpen(false)}
                className="text-gray-600 hover:text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-500"
                aria-label="Close modal"
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>
            <div className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700">Level Name</label>
                <input
                  type="text"
                  name="levelName"
                  value={formData.levelName}
                  onChange={handleInputChange}
                  className="mt-1 w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-colors duration-200"
                  placeholder="world"
                  aria-describedby="levelName-help"
                />
                <p id="levelName-help" className="text-xs text-gray-500 mt-1">
                  Name of the world folder (default: world)
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Seed</label>
                <input
                  type="text"
                  name="seed"
                  value={formData.seed}
                  onChange={handleInputChange}
                  className="mt-1 w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-colors duration-200"
                  placeholder="Enter seed (optional)"
                  aria-describedby="seed-help"
                />
                <p id="seed-help" className="text-xs text-gray-500 mt-1">
                  Numeric or text seed for world generation
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Generator Settings</label>
                <input
                  type="text"
                  name="generatorSettings"
                  value={formData.generatorSettings}
                  onChange={handleInputChange}
                  className="mt-1 w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-colors duration-200"
                  placeholder="Custom settings (optional)"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">World Type</label>
                <select
                  name="worldType"
                  value={formData.worldType}
                  onChange={handleInputChange}
                  className="mt-1 w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-colors duration-200"
                >
                  <option value="default">Normal</option>
                  <option value="superflat">Superflat</option>
                  <option value="amplified">Amplified</option>
                  <option value="large_biomes">Large Biomes</option>
                  <option value="single_biome">Single Biome</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Datapacks (URLs, comma-separated)</label>
                <input
                  type="text"
                  name="datapacks"
                  value={formData.datapacks}
                  onChange={handleInputChange}
                  className="mt-1 w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-colors duration-200"
                  placeholder="https://example.com/datapack.zip,..."
                />
              </div>
              <div className="flex space-x-6">
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    name="generateStructures"
                    checked={formData.generateStructures}
                    onChange={handleInputChange}
                    className="h-4 w-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500"
                  />
                  <label className="ml-2 text-sm text-gray-700">Generate Structures</label>
                </div>
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    name="hardcore"
                    checked={formData.hardcore}
                    onChange={handleInputChange}
                    className="h-4 w-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500"
                  />
                  <label className="ml-2 text-sm text-gray-700">Hardcore Mode</label>
                </div>
              </div>
            </div>
            <div className="mt-6 flex justify-end space-x-3">
              <button
                onClick={() => setIsGenerateModalOpen(false)}
                className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-4 py-2 rounded-lg transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-gray-500"
              >
                Cancel
              </button>
              <button
                onClick={handleGenerate}
                disabled={isLoading}
                className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                {isLoading ? (
                  <span className="flex items-center">
                    <svg className="animate-spin h-5 w-5 mr-2 text-white" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                    </svg>
                    Generating...
                  </span>
                ) : (
                  'Generate'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* World Options Modal */}
      {isOptionsOpen && levelData && (
        <div className="fixed inset-0 bg-gray-900 bg-opacity-75 flex items-center justify-center z-50 transition-opacity duration-300">
          <div className="bg-white p-6 rounded-xl shadow-2xl max-w-lg w-full max-h-[80vh] overflow-y-auto transform transition-transform duration-300 scale-100">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-bold text-gray-800">World Options (level.dat)</h2>
              <button
                onClick={() => setIsOptionsOpen(false)}
                className="text-gray-600 hover:text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-500"
                aria-label="Close modal"
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>
            <div className="space-y-6">
              {/* General Section */}
              <div>
                <h3 className="text-lg font-semibold text-gray-800 mb-3">General</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Level Name</label>
                    <input
                      type="text"
                      value={levelData.Data?.LevelName || ''}
                      onChange={(e) => handleLevelDataChange('Data.LevelName', e.target.value)}
                      className="mt-1 w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors duration-200"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Seed</label>
                    <input
                      type="text"
                      value={(levelData.Data?.RandomSeed || '').toString()}
                      onChange={(e) => handleLevelDataChange('Data.RandomSeed', e.target.value)}
                      className="mt-1 w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors duration-200"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Difficulty</label>
                    <select
                      value={levelData.Data?.Difficulty || 2}
                      onChange={(e) => handleLevelDataChange('Data.Difficulty', parseInt(e.target.value))}
                      className="mt-1 w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors duration-200"
                    >
                      <option value={0}>Peaceful</option>
                      <option value={1}>Easy</option>
                      <option value={2}>Normal</option>
                      <option value={3}>Hard</option>
                    </select>
                  </div>
                  <div className="flex space-x-6">
                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        checked={!!levelData.Data?.hardcore}
                        onChange={(e) => handleLevelDataChange('Data.hardcore', e.target.checked ? 1 : 0)}
                        className="h-4 w-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                      />
                      <label className="ml-2 text-sm text-gray-700">Hardcore</label>
                    </div>
                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        checked={!!levelData.Data?.allowCommands}
                        onChange={(e) => handleLevelDataChange('Data.allowCommands', e.target.checked ? 1 : 0)}
                        className="h-4 w-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                      />
                      <label className="ml-2 text-sm text-gray-700">Allow Commands</label>
                    </div>
                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        checked={!!levelData.Data?.MapFeatures}
                        onChange={(e) => handleLevelDataChange('Data.MapFeatures', e.target.checked ? 1 : 0)}
                        className="h-4 w-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                      />
                      <label className="ml-2 text-sm text-gray-700">Generate Structures</label>
                    </div>
                  </div>
                </div>
              </div>

              {/* Spawn Point Section */}
              <div>
                <h3 className="text-lg font-semibold text-gray-800 mb-3">Spawn Point</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">X</label>
                    <input
                      type="number"
                      value={levelData.Data?.SpawnX || 0}
                      onChange={(e) => handleLevelDataChange('Data.SpawnX', parseInt(e.target.value))}
                      className="mt-1 w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors duration-200"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Y</label>
                    <input
                      type="number"
                      value={levelData.Data?.SpawnY || 64}
                      onChange={(e) => handleLevelDataChange('Data.SpawnY', parseInt(e.target.value))}
                      className="mt-1 w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors duration-200"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Z</label>
                    <input
                      type="number"
                      value={levelData.Data?.SpawnZ || 0}
                      onChange={(e) => handleLevelDataChange('Data.SpawnZ', parseInt(e.target.value))}
                      className="mt-1 w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors duration-200"
                    />
                  </div>
                </div>
              </div>

              {/* Game Rules Section */}
              <div>
                <h3 className="text-lg font-semibold text-gray-800 mb-3">Game Rules</h3>
                {levelData.Data?.GameRules ? (
                  <div className="space-y-2 max-h-48 overflow-y-auto border border-gray-200 p-3 rounded-lg">
                    {Object.entries(levelData.Data.GameRules).map(([rule, value]) => (
                      <div key={rule} className="flex items-center justify-between">
                        <span className="text-sm text-gray-700 truncate">{rule}</span>
                        <input
                          type="checkbox"
                          checked={value === 'true'}
                          onChange={(e) => handleLevelDataChange(`Data.GameRules.${rule}`, e.target.checked)}
                          className="h-4 w-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                        />
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-600">No game rules found.</p>
                )}
              </div>
            </div>
            <div className="mt-6 flex justify-end space-x-3">
              <button
                onClick={() => setIsOptionsOpen(false)}
                className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-4 py-2 rounded-lg transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-gray-500"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveOptions}
                disabled={isLoading}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {isLoading ? (
                  <span className="flex items-center">
                    <svg className="animate-spin h-5 w-5 mr-2 text-white" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                    </svg>
                    Saving...
                  </span>
                ) : (
                  'Save'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}