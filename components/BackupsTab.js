import { useState, useEffect } from 'react';
import { 
  ArrowDownTrayIcon, 
  ArrowPathIcon, 
  CloudArrowUpIcon, 
  ArchiveBoxIcon,
  ExclamationTriangleIcon,
  ClockIcon
} from '@heroicons/react/24/outline';
import { supabase } from '../lib/supabaseClient';

export default function BackupsTab({ server }) {
  const [backups, setBackups] = useState([]);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);

  // Derived state
  const isRunning = server.status === 'Running';
  const isStopped = server.status === 'Stopped';
  const pendingRestore = server.pending_backup_restore;

  useEffect(() => {
    if (server?.id) {
      fetchBackups();
    }
  }, [server.id]);

  const fetchBackups = async () => {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    try {
      const res = await fetch(`/api/servers/${server.id}/backups`, {
        headers: { Authorization: `Bearer ${session.access_token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setBackups(data.backups);
      }
    } catch (e) {
      console.error("Failed to fetch backups", e);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateBackup = async () => {
    if (!isRunning) return alert("Server must be RUNNING to create a backup (so the agent can zip files).");
    
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
    if (!isStopped) {
        return alert("Server must be FULLY STOPPED to queue a restore.");
    }

    if (!confirm("WARNING: This will queue a restore.\n\nThe NEXT time you click 'Start', your current files will be DELETED and replaced with this backup.\n\nContinue?")) return;

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
      
      alert("Restore Queued!\n\nThe backup will be applied automatically when you next START the server.");
      // Trigger a refresh/update of the server object if possible, or wait for Supabase subscription
    } catch (e) {
      alert("Restore request failed: " + e.message);
    } finally {
      setProcessing(false);
    }
  };

  const handleCancelRestore = async () => {
    // Optional: Logic to clear the pending column if the user changes their mind
    // You would need a backend endpoint for this or just re-save with null
    alert("To cancel, simply do not start the server, or restore a different backup.");
  };

  const formatSize = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  return (
    <div className="space-y-6">
      
      {/* Pending Restore Banner */}
      {pendingRestore && (
        <div className="bg-amber-50 dark:bg-amber-900/50 border-l-4 border-amber-400 dark:border-amber-700 p-4 rounded-r-lg shadow-sm animate-pulse">
          <div className="flex items-start">
            <div className="flex-shrink-0">
              <ClockIcon className="h-5 w-5 text-amber-400" aria-hidden="true" />
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-amber-800 dark:text-amber-300">Restore Pending</h3>
              <div className="mt-2 text-sm text-amber-700 dark:text-amber-200">
                <p>
                  A backup restore is queued. <strong>The next time you click Start</strong>, the server will be wiped and restored from:
                </p>
                <code className="bg-amber-100 dark:bg-amber-900 px-2 py-1 rounded mt-1 block w-fit font-mono text-xs">
                  {pendingRestore.split('/').pop()}
                </code>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Card */}
      <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <ArchiveBoxIcon className="w-5 h-5 text-gray-500 dark:text-gray-400" />
              Backups
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">Create snapshots (While Running) or restore them (On Startup).</p>
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
              <button 
                  onClick={fetchBackups} 
                  className="p-2 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-700 dark:hover:text-gray-100 rounded-lg border border-gray-200 dark:border-slate-700"
                  title="Refresh List"
              >
                  <ArrowPathIcon className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
              </button>
              
              <button
                  onClick={handleCreateBackup}
                  disabled={processing || loading || !isRunning}
                  title={!isRunning ? "Server must be running to create a backup" : ""}
                  className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 text-white rounded-lg shadow-sm font-medium transition-colors ${
                    isRunning 
                      ? 'bg-indigo-600 hover:bg-indigo-700' 
                      : 'bg-gray-400 cursor-not-allowed'
                  }`}
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

        <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-slate-700">
            <thead className="bg-gray-50 dark:bg-slate-700">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-300 uppercase tracking-wider">File Name</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-300 uppercase tracking-wider">Size</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-300 uppercase tracking-wider">Created</th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 dark:text-gray-300 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-slate-800 divide-y divide-gray-100 dark:divide-slate-700">
              {backups.length === 0 ? (
                  <tr>
                      <td colSpan="4" className="px-6 py-12 text-center">
                          <div className="mx-auto w-12 h-12 bg-gray-100 dark:bg-slate-700 rounded-full flex items-center justify-center mb-3">
                              <CloudArrowUpIcon className="w-6 h-6 text-gray-400" />
                          </div>
                          <p className="text-gray-900 dark:text-gray-100 font-medium">No backups found</p>
                          <p className="text-gray-500 dark:text-gray-400 text-sm">Start the server to create your first backup.</p>
                      </td>
                  </tr>
              ) : (
                  backups.map((backup) => (
                  <tr key={backup.key} className="hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors group">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100 flex items-center gap-2">
                        <ArchiveBoxIcon className="w-4 h-4 text-indigo-400" />
                        {backup.name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400 font-mono">{formatSize(backup.size)}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{new Date(backup.lastModified).toLocaleString()}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <button 
                            onClick={() => handleRestore(backup.key)}
                            disabled={processing || !isStopped}
                            title={!isStopped ? "Server must be STOPPED to queue a restore" : "Queue Restore for next startup"}
                            className={`px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1 justify-end ml-auto ${
                              isStopped
                                ? 'text-indigo-600 hover:text-indigo-900 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 dark:hover:text-indigo-400'
                                : 'text-gray-400 cursor-not-allowed'
                            }`}
                        >
                            <ArrowDownTrayIcon className="w-4 h-4" /> 
                            {isStopped ? 'Restore' : 'Stop to Restore'}
                        </button>
                      </td>
                  </tr>
                  ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}