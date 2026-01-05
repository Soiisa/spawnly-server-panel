import { useState, useEffect } from 'react';
import { 
  ArrowDownTrayIcon, 
  ArrowPathIcon, 
  CloudArrowUpIcon, 
  ArchiveBoxIcon,
  ExclamationTriangleIcon,
  ClockIcon,
  Cog6ToothIcon,
  CheckIcon,
  AdjustmentsHorizontalIcon
} from '@heroicons/react/24/outline';
import { supabase } from '../lib/supabaseClient';
import { useTranslation } from 'next-i18next';

export default function BackupsTab({ server }) {
  const { t } = useTranslation('server');
  const [backups, setBackups] = useState([]);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [message, setMessage] = useState(null); // Added for Toast
  
  // Settings State
  const [showSettings, setShowSettings] = useState(false);
  const [autoBackupEnabled, setAutoBackupEnabled] = useState(server.auto_backup_enabled || false);
  const [autoBackupInterval, setAutoBackupInterval] = useState(server.auto_backup_interval_hours || 24);
  const [maxAutoBackups, setMaxAutoBackups] = useState(server.max_auto_backups || 5);
  const [savingSettings, setSavingSettings] = useState(false);

  // Derived state
  const isRunning = server.status === 'Running';
  const isStopped = server.status === 'Stopped';
  const pendingRestore = server.pending_backup_restore;

  useEffect(() => {
    if (server?.id) {
      fetchBackups();
    }
  }, [server.id]);

  useEffect(() => {
    setAutoBackupEnabled(server.auto_backup_enabled || false);
    setAutoBackupInterval(server.auto_backup_interval_hours || 24);
    setMaxAutoBackups(Math.min(10, server.max_auto_backups || 5));
  }, [server.auto_backup_enabled, server.auto_backup_interval_hours, server.max_auto_backups]);

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

  const showToast = (msg) => {
    setMessage(msg);
    setTimeout(() => setMessage(null), 3000);
  };

  const handleCreateBackup = async () => {
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
      
      showToast(t('backups.alerts.started'));
      setTimeout(fetchBackups, 2000);
      setTimeout(fetchBackups, 5000);
      setTimeout(fetchBackups, 10000); 
    } catch (e) {
      alert(t('backups.errors.create_failed') + ": " + e.message);
    } finally {
      setProcessing(false);
    }
  };

  const handleSaveSettings = async () => {
    setSavingSettings(true);
    try {
      const safeRetention = Math.min(10, Math.max(1, parseInt(maxAutoBackups)));
      
      const { error } = await supabase
        .from('servers')
        .update({ 
          auto_backup_enabled: autoBackupEnabled,
          auto_backup_interval_hours: parseInt(autoBackupInterval),
          max_auto_backups: safeRetention
        })
        .eq('id', server.id);
      
      if (error) throw error;
      setMaxAutoBackups(safeRetention); 
      setShowSettings(false);
      showToast(t('backups.alerts.settings_saved'));
    } catch (e) {
      alert(t('backups.errors.save_failed') + ": " + e.message);
    } finally {
      setSavingSettings(false);
    }
  };

  const handleRestore = async (key) => {
    if (!isStopped) {
        return alert(t('backups.alerts.stop_required'));
    }

    if (!confirm(t('backups.alerts.confirm_restore'))) return;

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
      
      showToast(t('backups.alerts.queued'));
    } catch (e) {
      alert(t('backups.errors.restore_failed') + ": " + e.message);
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
    <div className="space-y-6 relative">
      
      {/* Toast Notification */}
      {message && (
        <div className="absolute top-0 right-0 z-50 p-4 bg-green-600 text-white rounded-xl shadow-lg flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
            <CheckIcon className="w-5 h-5" /> {message}
        </div>
      )}

      {/* Pending Restore Banner */}
      {pendingRestore && (
        <div className="bg-amber-50 dark:bg-amber-900/50 border-l-4 border-amber-400 dark:border-amber-700 p-4 rounded-r-lg shadow-sm animate-pulse">
          <div className="flex items-start">
            <div className="flex-shrink-0">
              <ClockIcon className="h-5 w-5 text-amber-400" aria-hidden="true" />
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-amber-800 dark:text-amber-300">{t('backups.pending_title')}</h3>
              <div className="mt-2 text-sm text-amber-700 dark:text-amber-200">
                <p>{t('backups.pending_desc')}</p>
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
              {t('backups.title')}
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">{t('backups.subtitle')}</p>
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
              <button 
                  onClick={() => setShowSettings(!showSettings)}
                  className={`p-2 rounded-lg border transition-colors flex items-center gap-2 text-sm font-medium ${showSettings ? 'bg-indigo-50 border-indigo-200 text-indigo-600 dark:bg-indigo-900/30 dark:border-indigo-800 dark:text-indigo-400' : 'text-gray-600 dark:text-gray-300 border-gray-200 dark:border-slate-600 hover:bg-gray-50 dark:hover:bg-slate-700'}`}
              >
                  <AdjustmentsHorizontalIcon className="w-5 h-5" />
                  <span>{t('backups.settings_title')}</span>
              </button>
              
              <button 
                  onClick={fetchBackups} 
                  className="p-2 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-700 dark:hover:text-gray-100 rounded-lg border border-gray-200 dark:border-slate-700"
                  title={t('backups.refresh')}
              >
                  <ArrowPathIcon className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
              </button>
              
              <button
                  onClick={handleCreateBackup}
                  disabled={processing || loading}
                  className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 text-white rounded-lg shadow-sm font-medium transition-colors bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                  {processing ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <CloudArrowUpIcon className="w-5 h-5" />
                  )}
                  {t('backups.create')}
              </button>
          </div>
        </div>

        {/* Auto Backup Settings Panel */}
        {showSettings && (
          <div className="mb-8 bg-slate-50 dark:bg-slate-700/30 p-5 rounded-xl border border-slate-200 dark:border-slate-700 animate-in fade-in slide-in-from-top-2">
            
            <div className="flex flex-col md:flex-row gap-8 items-start">
                {/* 1. Toggle Switch */}
                <div className="flex-shrink-0">
                    <label className="flex items-center gap-3 cursor-pointer select-none">
                        <div className="relative">
                            <input 
                                type="checkbox" 
                                className="sr-only" 
                                checked={autoBackupEnabled}
                                onChange={(e) => setAutoBackupEnabled(e.target.checked)} 
                            />
                            <div className={`block w-12 h-7 rounded-full transition-colors ${autoBackupEnabled ? 'bg-indigo-600' : 'bg-gray-300 dark:bg-gray-600'}`}></div>
                            <div className={`absolute left-1 top-1 bg-white w-5 h-5 rounded-full transition-transform ${autoBackupEnabled ? 'translate-x-5' : 'translate-x-0'}`}></div>
                        </div>
                        <div>
                            <span className="block text-sm font-bold text-gray-900 dark:text-gray-100">{t('backups.enable_auto')}</span>
                            <span className="text-xs text-gray-500 dark:text-gray-400 block">{t('backups.enable_auto_desc', { defaultValue: 'Runs automatically when server stops.' })}</span>
                        </div>
                    </label>
                </div>

                {/* 2. Controls */}
                <div className={`flex-1 grid grid-cols-1 sm:grid-cols-2 gap-6 w-full transition-opacity duration-300 ${autoBackupEnabled ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
                    
                    {/* Frequency Input */}
                    <div>
                        <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wide">
                            {t('backups.frequency')}
                        </label>
                        <div className="relative">
                            <input 
                                type="number" 
                                min="1"
                                value={autoBackupInterval} 
                                onChange={(e) => setAutoBackupInterval(e.target.value)}
                                className="block w-full pl-3 pr-12 py-2 rounded-lg border-gray-300 dark:border-slate-600 dark:bg-slate-800 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm font-medium"
                            />
                            <span className="absolute right-3 top-2 text-sm text-gray-400">{t('units.hours', { defaultValue: 'hours' })}</span>
                        </div>
                        <p className="text-[10px] text-gray-400 mt-1">{t('backups.frequency_desc', { defaultValue: 'Minimum time between backups.' })}</p>
                    </div>

                    {/* Retention Slider */}
                    <div>
                        <div className="flex justify-between items-center mb-1.5">
                            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                                {t('backups.retention')}
                            </label>
                            <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 px-2 py-0.5 rounded">
                                {maxAutoBackups} / 10
                            </span>
                        </div>
                        
                        <input 
                            type="range" 
                            min="1" 
                            max="10" 
                            step="1"
                            value={maxAutoBackups} 
                            onChange={(e) => setMaxAutoBackups(e.target.value)}
                            className="w-full h-2 bg-gray-200 dark:bg-gray-600 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                        />
                        <div className="flex justify-between text-[10px] text-gray-400 mt-1">
                            <span>1</span>
                            <span>5</span>
                            <span>10 ({t('backups.max', { defaultValue: 'Max' })})</span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-200 dark:border-slate-600 flex justify-end">
               <button 
                  onClick={handleSaveSettings}
                  disabled={savingSettings}
                  className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded-lg text-sm font-bold shadow-sm transition-all disabled:opacity-70 disabled:cursor-not-allowed hover:shadow-md"
               >
                 {savingSettings ? (
                    <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        {t('backups.saving')}
                    </>
                 ) : (
                    <>
                        <CheckIcon className="w-4 h-4" />
                        {t('backups.save_settings')}
                    </>
                 )}
               </button>
            </div>
          </div>
        )}

        <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-slate-700">
            <thead className="bg-gray-50 dark:bg-slate-700">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-300 uppercase tracking-wider">{t('files.columns.name')}</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-300 uppercase tracking-wider">{t('files.columns.size')}</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-300 uppercase tracking-wider">{t('files.columns.modified')}</th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 dark:text-gray-300 uppercase tracking-wider">{t('files.columns.actions')}</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-slate-800 divide-y divide-gray-100 dark:divide-slate-700">
              {backups.length === 0 ? (
                  <tr>
                      <td colSpan="4" className="px-6 py-12 text-center">
                          <div className="mx-auto w-12 h-12 bg-gray-100 dark:bg-slate-700 rounded-full flex items-center justify-center mb-3">
                              <CloudArrowUpIcon className="w-6 h-6 text-gray-400" />
                          </div>
                          <p className="text-gray-900 dark:text-gray-100 font-medium">{t('backups.empty_title')}</p>
                          <p className="text-gray-500 dark:text-gray-400 text-sm">{t('backups.empty_desc')}</p>
                      </td>
                  </tr>
              ) : (
                  backups.map((backup) => (
                  <tr key={backup.key} className="hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors group">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100 flex items-center gap-2">
                        <ArchiveBoxIcon className="w-4 h-4 text-indigo-400" />
                        {backup.name}
                        {backup.name.includes('auto-') && <span className="text-[10px] bg-gray-100 dark:bg-slate-600 px-1.5 py-0.5 rounded text-gray-500 dark:text-gray-300 uppercase tracking-wide">{t('backups.badge_auto', { defaultValue: 'Auto' })}</span>}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400 font-mono">{formatSize(backup.size)}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{new Date(backup.lastModified).toLocaleString()}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <button 
                            onClick={() => handleRestore(backup.key)}
                            disabled={processing || !isStopped}
                            title={!isStopped ? t('backups.tooltips.must_stop') : t('backups.tooltips.queue_restore')}
                            className={`px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1 justify-end ml-auto ${
                              isStopped
                                ? 'text-indigo-600 hover:text-indigo-900 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 dark:hover:text-indigo-400'
                                : 'text-gray-400 cursor-not-allowed'
                            }`}
                        >
                            <ArrowDownTrayIcon className="w-4 h-4" /> 
                            {isStopped ? t('backups.restore') : t('backups.stop_to_restore')}
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