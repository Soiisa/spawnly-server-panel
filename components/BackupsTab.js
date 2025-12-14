// components/BackupsTab.js
import { useState, useEffect } from 'react';
import { 
  ArrowDownTrayIcon, 
  ArrowPathIcon, 
  CloudArrowUpIcon, 
  ArchiveBoxIcon 
} from '@heroicons/react/24/outline';
import { supabase } from '../lib/supabaseClient';

export default function BackupsTab({ server }) {
  const [backups, setBackups] = useState([]);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    fetchBackups();
  }, [server.id]);

  const fetchBackups = async () => {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(`/api/servers/${server.id}/backups`, {
      headers: { Authorization: `Bearer ${session.access_token}` }
    });
    if (res.ok) {
      const data = await res.json();
      setBackups(data.backups);
    }
    setLoading(false);
  };

  const handleCreateBackup = async () => {
    if (server.status !== 'Running' && server.status !== 'Stopped') return alert("Server must be available (Running or Stopped)");
    
    setProcessing(true);
    const { data: { session } } = await supabase.auth.getSession();
    try {
      const res = await fetch(`/api/servers/${server.id}/backup-action`, {
        method: 'POST',
        headers: { 
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ action: 'create' })
      });
      
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed');
      }
      
      alert("Backup started! It will appear in the list shortly.");
      // Poll a few times to see the new file
      setTimeout(fetchBackups, 2000);
      setTimeout(fetchBackups, 5000);
    } catch (e) {
      alert("Failed to start backup: " + e.message);
    } finally {
      setProcessing(false);
    }
  };

  const handleRestore = async (key) => {
    // Restore is dangerous. Ensure user knows.
    // Ideally, server should be stopped, but we can attempt if running (might corrupt data).
    // Let's enforce warning.
    if (!confirm("WARNING: Restoring will overwrite all current server files. \n\nWe strictly recommend STOPPING the server first.\n\nContinue?")) return;

    setProcessing(true);
    const { data: { session } } = await supabase.auth.getSession();
    try {
      const res = await fetch(`/api/servers/${server.id}/backup-action`, {
        method: 'POST',
        headers: { 
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ action: 'restore', s3Key: key })
      });
      
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed');
      }
      
      alert("Restore command sent. Check the Console tab for progress.");
    } catch (e) {
      alert("Restore failed: " + e.message);
    } finally {
      setProcessing(false);
    }
  };

  const formatSize = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  return (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div>
          <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <ArchiveBoxIcon className="w-5 h-5 text-gray-500" />
            Backups
          </h3>
          <p className="text-sm text-gray-500">Create snapshots of your server world and configuration.</p>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
            <button 
                onClick={fetchBackups} 
                className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg border border-gray-200"
                title="Refresh List"
            >
                <ArrowPathIcon className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
                onClick={handleCreateBackup}
                disabled={processing || loading}
                className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-sm font-medium"
            >
                {processing ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <CloudArrowUpIcon className="w-5 h-5" />
                )}
                Create Backup
            </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 shadow-sm">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">File Name</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Size</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Created</th>
              <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-100">
            {backups.length === 0 ? (
                <tr>
                    <td colSpan="4" className="px-6 py-12 text-center">
                        <div className="mx-auto w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mb-3">
                            <CloudArrowUpIcon className="w-6 h-6 text-gray-400" />
                        </div>
                        <p className="text-gray-900 font-medium">No backups found</p>
                        <p className="text-gray-500 text-sm">Create a backup to ensure your data is safe.</p>
                    </td>
                </tr>
            ) : (
                backups.map((backup) => (
                <tr key={backup.key} className="hover:bg-gray-50 transition-colors group">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 flex items-center gap-2">
                      <ArchiveBoxIcon className="w-4 h-4 text-indigo-400" />
                      {backup.name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-mono">{formatSize(backup.size)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{new Date(backup.lastModified).toLocaleString()}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <button 
                          onClick={() => handleRestore(backup.key)}
                          disabled={processing}
                          className="text-indigo-600 hover:text-indigo-900 hover:bg-indigo-50 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1 justify-end ml-auto disabled:opacity-50"
                      >
                          <ArrowDownTrayIcon className="w-4 h-4" /> Restore
                      </button>
                    </td>
                </tr>
                ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}