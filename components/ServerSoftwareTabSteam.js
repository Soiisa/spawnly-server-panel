// components/ServerSoftwareTabSteam.js
import { useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'next-i18next';
import { 
  CpuChipIcon as ChipIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  XCircleIcon,
  ArchiveBoxIcon
} from '@heroicons/react/24/outline';

export default function ServerSoftwareTabSteam({ server, onSoftwareChange }) {
  const { t } = useTranslation('server'); 
  
  const currentBranch = server?.version || 'public';
  const [selectedBranch, setSelectedBranch] = useState(currentBranch);
  
  const [isInstalling, setIsInstalling] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [showWarning, setShowWarning] = useState(false);

  const branches = [
    { 
        id: 'public', 
        name: 'Public', 
        description: 'The default, stable branch of the game. Recommended for most players.',
        badge: 'Stable',
        color: 'bg-green-50 text-green-700'
    },
    { 
        id: 'experimental', 
        name: 'Experimental', 
        description: 'The bleeding-edge branch. Contains the latest features but may have bugs or corrupt saves.',
        badge: 'Beta',
        color: 'bg-orange-50 text-orange-700'
    }
  ];

  const handleSaveClick = () => {
    if (selectedBranch === currentBranch) return;
    setShowWarning(true);
  };

  const confirmChange = async () => {
    setIsInstalling(true); 
    setShowWarning(false);
    setSuccess(null);
    setError(null);

    const payload = {
        version: selectedBranch,
        force_software_install: true // Forces SteamCMD to re-download/validate the new branch
    };

    try {
      // 1. Update Database
      const { error: err } = await supabase.from('servers').update(payload).eq('id', server.id);
      if (err) throw err;

      // 2. Log to Audit
      try {
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
              await supabase.from('server_audit_logs').insert({
                  server_id: server.id,
                  user_id: user.id,
                  action_type: 'software_change',
                  details: `Changed Steam branch to ${selectedBranch}`,
                  created_at: new Date().toISOString()
              });
          }
      } catch (logErr) {
          console.error("Failed to log branch change:", logErr);
      }

      if (onSoftwareChange) onSoftwareChange(payload);
      
      setSuccess("Branch updated successfully! Please Restart the server to apply the update.");
    } catch (err) {
      console.error(err);
      setError(err.message || "Failed to update branch.");
    } finally {
      setIsInstalling(false);
    }
  };

  return (
    <div className="space-y-6">
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700 p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
                <ChipIcon className="w-5 h-5 text-gray-500" /> Select Release Branch
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {branches.map((branch) => {
                    const isSelected = selectedBranch === branch.id;
                    const isCurrent = currentBranch === branch.id;
                    
                    return (
                        <div
                            key={branch.id}
                            onClick={() => setSelectedBranch(branch.id)}
                            className={`relative cursor-pointer rounded-xl p-5 border-2 transition-all duration-200 flex flex-col gap-2 group
                            ${isSelected 
                                ? `border-indigo-600 bg-indigo-50 dark:bg-indigo-900/20 shadow-md ring-1 ring-indigo-600` 
                                : 'border-gray-200 dark:border-slate-700 hover:border-gray-300 dark:hover:border-slate-600 hover:bg-gray-50 dark:hover:bg-slate-700/50'
                            }`}
                        >
                            <div className="flex justify-between items-start">
                                <h3 className={`font-bold text-lg ${isSelected ? 'text-indigo-900 dark:text-indigo-300' : 'text-gray-900 dark:text-gray-100'}`}>
                                    {branch.name}
                                </h3>
                                <span className={`inline-block text-xs uppercase tracking-wide font-bold px-2 py-0.5 rounded-full ${branch.color}`}>
                                    {branch.badge}
                                </span>
                            </div>
                            
                            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 flex-1">
                                {branch.description}
                            </p>

                            {isCurrent && (
                                <div className="mt-3 text-xs font-bold text-gray-500 bg-gray-200 dark:bg-slate-700 w-fit px-2 py-1 rounded">
                                    CURRENTLY INSTALLED
                                </div>
                            )}

                            {isSelected && (
                                <div className="absolute top-4 right-4 text-indigo-600">
                                    <CheckCircleIcon className="w-6 h-6 hidden" />
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>

      {/* Action Bar */}
      <div className="flex items-center justify-end gap-4 pt-4 border-t border-gray-100 dark:border-slate-700">
        <AnimatePresence>
          {success && (
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="text-green-600 text-sm font-medium flex items-center gap-2">
              <CheckCircleIcon className="w-5 h-5" /> {success}
            </motion.div>
          )}
          {error && (
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="text-red-600 text-sm font-medium flex items-center gap-2">
              <XCircleIcon className="w-5 h-5" /> {error}
            </motion.div>
          )}
        </AnimatePresence>

        <button
          onClick={handleSaveClick}
          disabled={selectedBranch === currentBranch || isInstalling}
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2.5 rounded-xl font-semibold shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {isInstalling ? 'Saving...' : t('software.buttons.save')}
        </button>
      </div>

      {/* Impact Warning Modal */}
      <AnimatePresence>
        {showWarning && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl max-w-lg w-full overflow-hidden"
            >
              <div className="p-6 border-b bg-yellow-50 border-yellow-100 dark:bg-yellow-900/20 dark:border-yellow-800">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-full bg-yellow-100 text-yellow-600">
                    <ExclamationTriangleIcon className="w-6 h-6" />
                  </div>
                  <h3 className="text-lg font-bold text-yellow-900 dark:text-yellow-300">
                    Confirm Branch Change
                  </h3>
                </div>
              </div>
              
              <div className="p-6 space-y-4">
                <p className="text-gray-700 dark:text-gray-200 leading-relaxed">
                    You are about to switch the server to the <strong>{selectedBranch}</strong> branch. SteamCMD will download the new files the next time you start the server. 
                </p>
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded-lg p-4 text-sm text-blue-800 dark:text-blue-300 flex items-start gap-3">
                  <ArchiveBoxIcon className="w-5 h-5 shrink-0 mt-0.5" />
                  <span>It is highly recommended to take a backup of your save files before switching branches, as saves loaded in Experimental often cannot be loaded back into Public.</span>
                </div>
              </div>

              <div className="bg-gray-50 dark:bg-slate-700 px-6 py-4 flex justify-end gap-3 border-t border-gray-200 dark:border-slate-700">
                <button
                  onClick={() => setShowWarning(false)}
                  className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-600 font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmChange}
                  className="px-4 py-2 text-white rounded-lg font-medium shadow-sm bg-indigo-600 hover:bg-indigo-700"
                >
                  Confirm Change
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}