// components/WorldTab.js
import { useState } from 'react';

export default function WorldTab({ server, token, setActiveTab, setFileManagerPath, setFileManagerAutoOpen }) {
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [generateForm, setGenerateForm] = useState({
    levelName: 'world',
    seed: '',
    generatorSettings: '',
    worldType: 'default',
    generateStructures: true,
    datapacks: '',
    hardcore: false,
  });

  const isStopped = server.status === 'Stopped';

  const handleDownload = async () => {
    try {
      const res = await fetch(`/api/servers/${server.id}/world`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to download world');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${server.name}-world.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(`Error: ${err.message}`);
    }
  };

  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('worldZip', file);
    try {
      const res = await fetch(`/api/servers/${server.id}/world`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (!res.ok) throw new Error('Failed to upload world');
      alert('World uploaded successfully');
    } catch (err) {
      alert(`Error: ${err.message}`);
    }
  };

  const handleOptions = () => {
    setFileManagerPath('world');
    setFileManagerAutoOpen('level.dat');
    setActiveTab('files');
  };

  const handleFiles = () => {
    setFileManagerPath('world');
    setFileManagerAutoOpen('');
    setActiveTab('files');
  };

  const handleGenerate = () => {
    if (!isStopped) {
      alert('Server must be stopped to generate a new world.');
      return;
    }
    setShowGenerateModal(true);
  };

  const updateForm = (key, value) => {
    setGenerateForm((prev) => ({ ...prev, [key]: value }));
  };

  const submitGenerate = async () => {
    try {
      const res = await fetch(`/api/servers/${server.id}/world?action=generate`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(generateForm),
      });
      if (!res.ok) throw new Error('Failed to generate world');
      setShowGenerateModal(false);
      alert('New world generated successfully. Start the server to load it.');
    } catch (err) {
      alert(`Error: ${err.message}`);
    }
  };

  return (
    <div className="bg-white p-4 rounded shadow">
      <h2 className="text-xl font-bold mb-4">World Management</h2>
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <button
          onClick={handleDownload}
          className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded"
        >
          Download
        </button>
        <label className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded cursor-pointer">
          Upload
          <input type="file" className="hidden" onChange={handleUpload} accept=".zip" />
        </label>
        <button
          onClick={handleOptions}
          className="bg-purple-500 hover:bg-purple-600 text-white px-4 py-2 rounded"
        >
          Options
        </button>
        <button
          onClick={handleFiles}
          className="bg-indigo-500 hover:bg-indigo-600 text-white px-4 py-2 rounded"
        >
          Files
        </button>
        <button
          onClick={handleGenerate}
          disabled={!isStopped}
          className="bg-yellow-500 hover:bg-yellow-600 text-white px-4 py-2 rounded disabled:opacity-50"
        >
          Generate
        </button>
      </div>

      {showGenerateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-xl max-w-md w-full">
            <h3 className="text-lg font-bold mb-4">Generate New World</h3>
            <div className="space-y-4">
              <input
                type="text"
                value={generateForm.levelName}
                onChange={(e) => updateForm('levelName', e.target.value)}
                placeholder="Level Name"
                className="w-full border p-2 rounded"
              />
              <input
                type="text"
                value={generateForm.seed}
                onChange={(e) => updateForm('seed', e.target.value)}
                placeholder="Level Seed"
                className="w-full border p-2 rounded"
              />
              <input
                type="text"
                value={generateForm.generatorSettings}
                onChange={(e) => updateForm('generatorSettings', e.target.value)}
                placeholder="Generator Settings (JSON)"
                className="w-full border p-2 rounded"
              />
              <select
                value={generateForm.worldType}
                onChange={(e) => updateForm('worldType', e.target.value)}
                className="w-full border p-2 rounded"
              >
                <option value="default">Default</option>
                <option value="superflat">Superflat</option>
                <option value="amplified">Amplified</option>
                <option value="large_biomes">Large Biomes</option>
                <option value="single_biome">Single Biome</option>
              </select>
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={generateForm.generateStructures}
                  onChange={(e) => updateForm('generateStructures', e.target.checked)}
                  className="mr-2"
                />
                Generate Structures
              </label>
              <input
                type="text"
                value={generateForm.datapacks}
                onChange={(e) => updateForm('datapacks', e.target.value)}
                placeholder="Datapacks (comma-separated URLs)"
                className="w-full border p-2 rounded"
              />
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={generateForm.hardcore}
                  onChange={(e) => updateForm('hardcore', e.target.checked)}
                  className="mr-2"
                />
                Hardcore
              </label>
              <div className="flex justify-end space-x-2">
                <button
                  onClick={submitGenerate}
                  className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded"
                >
                  Generate
                </button>
                <button
                  onClick={() => setShowGenerateModal(false)}
                  className="bg-gray-300 hover:bg-gray-400 text-gray-800 px-4 py-2 rounded"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}