import { useState } from 'react';

export default function WorldTab({ server, token }) {
  const [isGenerateModalOpen, setIsGenerateModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    levelName: 'world',
    seed: '',
    generatorSettings: '',
    worldType: 'default',
    generateStructures: true,
    hardcore: false,
    datapacks: '',
  });
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  const isServerStopped = server?.status === 'Stopped';

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

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow-md">
      {error && (
        <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-md border border-red-200">
          {error}
          <button
            onClick={() => setError(null)}
            className="float-right text-red-800 font-bold"
          >
            ×
          </button>
        </div>
      )}

      <div className="flex space-x-4 mb-6">
        <button
          onClick={handleDownload}
          disabled={isLoading || !isServerStopped}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded disabled:opacity-50 transition-colors"
        >
          {isLoading ? 'Processing...' : 'Download World'}
        </button>
        <label
          className={`bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded disabled:opacity-50 transition-colors ${isLoading || !isServerStopped ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
        >
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
          onClick={() => alert('Options feature coming soon!')}
          className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded transition-colors"
        >
          Options
        </button>
        <button
          onClick={() => setIsGenerateModalOpen(true)}
          disabled={isLoading || !isServerStopped}
          className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded disabled:opacity-50 transition-colors"
        >
          {isLoading ? 'Processing...' : 'Generate New World'}
        </button>
      </div>

      {isGenerateModalOpen && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-lg max-w-md w-full">
            <h2 className="text-xl font-bold mb-4">Generate New World</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Level Name</label>
                <input
                  type="text"
                  name="levelName"
                  value={formData.levelName}
                  onChange={handleInputChange}
                  className="mt-1 w-full border border-gray-300 rounded px-3 py-2"
                  placeholder="world"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Seed</label>
                <input
                  type="text"
                  name="seed"
                  value={formData.seed}
                  onChange={handleInputChange}
                  className="mt-1 w-full border border-gray-300 rounded px-3 py-2"
                  placeholder="Enter seed (optional)"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Generator Settings</label>
                <input
                  type="text"
                  name="generatorSettings"
                  value={formData.generatorSettings}
                  onChange={handleInputChange}
                  className="mt-1 w-full border border-gray-300 rounded px-3 py-2"
                  placeholder="Custom settings (optional)"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">World Type</label>
                <select
                  name="worldType"
                  value={formData.worldType}
                  onChange={handleInputChange}
                  className="mt-1 w-full border border-gray-300 rounded px-3 py-2"
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
                  className="mt-1 w-full border border-gray-300 rounded px-3 py-2"
                  placeholder="https://example.com/datapack.zip,..."
                />
              </div>
              <div className="flex items-center">
                <input
                  type="checkbox"
                  name="generateStructures"
                  checked={formData.generateStructures}
                  onChange={handleInputChange}
                  className="h-4 w-4 text-indigo-600 border-gray-300 rounded"
                />
                <label className="ml-2 text-sm text-gray-700">Generate Structures</label>
              </div>
              <div className="flex items-center">
                <input
                  type="checkbox"
                  name="hardcore"
                  checked={formData.hardcore}
                  onChange={handleInputChange}
                  className="h-4 w-4 text-indigo-600 border-gray-300 rounded"
                />
                <label className="ml-2 text-sm text-gray-700">Hardcore Mode</label>
              </div>
            </div>
            <div className="mt-6 flex justify-end space-x-2">
              <button
                onClick={() => setIsGenerateModalOpen(false)}
                className="bg-gray-300 hover:bg-gray-400 text-gray-800 px-4 py-2 rounded"
              >
                Cancel
              </button>
              <button
                onClick={handleGenerate}
                disabled={isLoading}
                className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded disabled:opacity-50"
              >
                {isLoading ? 'Generating...' : 'Generate'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}