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

  const game = server?.game || 'satisfactory';

  // Dynamically load branches based on the exact Game Type
  let branches = [];
  
  if (game === 'rust') {
      branches = [
        { id: 'public', name: t('software.steam_branches.rust_public_name', 'Public (Main)'), description: t('software.steam_branches.rust_public_desc', 'The stable default branch. Used by 99% of public servers and players.'), badge: t('software.badges.stable', 'Stable'), color: 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
        { id: 'staging', name: t('software.steam_branches.rust_staging_name', 'Staging'), description: t('software.steam_branches.rust_staging_desc', 'The testing branch for upcoming updates. Wipes frequently and may contain bugs.'), badge: t('software.badges.beta', 'Beta'), color: 'bg-orange-50 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' },
        { id: 'aux01', name: t('software.steam_branches.rust_aux01_name', 'Aux01'), description: t('software.steam_branches.rust_aux01_desc', 'Bleeding edge developer testing branch. Highly unstable.'), badge: t('software.badges.dev', 'Dev'), color: 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400' }
      ];
  } else if (game === 'arma3') {
      branches = [
        { id: 'public', name: t('software.steam_branches.arma3_public_name', 'Public (Main)'), description: t('software.steam_branches.arma3_public_desc', 'The stable default branch. Recommended for all standard communities.'), badge: t('software.badges.stable', 'Stable'), color: 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
        { id: 'profiling', name: t('software.steam_branches.arma3_profiling_name', 'Profiling (Performance)'), description: t('software.steam_branches.arma3_profiling_desc', 'Special build with performance optimizations and server debugging tools.'), badge: t('software.badges.beta', 'Beta'), color: 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
        { id: 'rc', name: t('software.steam_branches.arma3_rc_name', 'Release Candidate'), description: t('software.steam_branches.arma3_rc_desc', 'Testing branch for upcoming stable updates.'), badge: t('software.badges.dev', 'Dev'), color: 'bg-orange-50 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' },
        { id: 'legacy', name: t('software.steam_branches.arma3_legacy_name', 'Legacy Build'), description: t('software.steam_branches.arma3_legacy_desc', 'An older stable version kept for compatibility with outdated mods.'), badge: t('software.badges.legacy', 'Legacy'), color: 'bg-gray-50 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400' }
      ];
  } else if (game === 'palworld') {
      branches = [
        { id: 'public', name: t('software.steam_branches.palworld_private_name', 'Private Server (Direct Connect)'), description: t('software.steam_branches.palworld_private_desc', 'Default server mode. Does not show up on the community browser. Players must connect directly via IP.'), badge: t('software.badges.private', 'Private'), color: 'bg-gray-50 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400' },
        { id: 'community', name: t('software.steam_branches.palworld_public_name', 'Community Server (Public)'), description: t('software.steam_branches.palworld_public_desc', 'Publicly listed server. Automatically broadcasts to the in-game community browser and BattleMetrics.'), badge: t('software.badges.public', 'Public'), color: 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400' }
      ];
  } else if (game === 'gmod') {
      branches = [
        { id: 'public', name: t('software.steam_branches.gmod_public_name', 'Standard (32-bit)'), description: t('software.steam_branches.gmod_public_desc', 'The stable default branch.'), badge: t('software.badges.stable', 'Stable'), color: 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
        { id: 'x86-64', name: t('software.steam_branches.gmod_x64_name', 'x86-64 (64-bit)'), description: t('software.steam_branches.gmod_x64_desc', 'Modern 64-bit branch. Recommended for better performance and higher memory limits.'), badge: t('software.badges.beta', 'Beta'), color: 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
        { id: 'chromium', name: t('software.steam_branches.gmod_chromium_name', 'Chromium'), description: t('software.steam_branches.gmod_chromium_desc', 'Includes updated embedded Chromium for modern web panels.'), badge: t('software.badges.beta', 'Beta'), color: 'bg-orange-50 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' }
      ];
  } else if (game === 'valheim') {
      branches = [
        { id: 'public', name: t('software.steam_branches.valheim_public_name', 'Public (Main)'), description: t('software.steam_branches.valheim_public_desc', 'The stable default branch.'), badge: t('software.badges.stable', 'Stable'), color: 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
        { id: 'public-test', name: t('software.steam_branches.valheim_test_name', 'Public Test'), description: t('software.steam_branches.valheim_test_desc', 'Testing branch for upcoming updates. May be unstable.'), badge: t('software.badges.beta', 'Beta'), color: 'bg-orange-50 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' }
      ];
  } else if (['satisfactory', 'factorio', 'arma_reforger'].includes(game)) {
      // Games that legitimately use an "Experimental" branch system
      branches = [
        { id: 'public', name: t('software.steam_branches.exp_public_name', 'Public (Stable)'), description: t('software.steam_branches.exp_public_desc', 'The default, stable branch of the game. Recommended for most players.'), badge: t('software.badges.stable', 'Stable'), color: 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
        { id: 'experimental', name: t('software.steam_branches.exp_experimental_name', 'Experimental'), description: t('software.steam_branches.exp_experimental_desc', 'The bleeding-edge branch. Contains the latest features but may be unstable.'), badge: t('software.badges.beta', 'Beta'), color: 'bg-orange-50 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' }
      ];
  } else {
      // STRICT FALLBACK: CS2, ARK, Zomboid, Space Engineers, etc.
      branches = [
        { id: 'public', name: t('software.steam_branches.fallback_public_name', 'Public Branch'), description: t('software.steam_branches.fallback_public_desc', 'The official, stable release branch for this game.'), badge: t('software.badges.stable', 'Stable'), color: 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400' }
      ];
  }

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
        force_software_install: true 
    };

    try {
      const { error: err } = await supabase.from('servers').update(payload).eq('id', server.id);
      if (err) throw err;

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
      } catch (logErr) {}

      if (onSoftwareChange) onSoftwareChange(payload);
      
      setSuccess(t('software.steam_config.success_saved', 'Settings updated successfully! Please Restart the server to apply changes.'));
    } catch (err) {
      setError(err.message || t('software.steam_config.error_failed', 'Failed to update settings.'));
    } finally {
      setIsInstalling(false);
    }
  };

  return (
    <div className="space-y-6">
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700 p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
                <ChipIcon className="w-5 h-5 text-gray-500" /> {t('software.steam_config.title', 'Server Configuration')}
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
                                    {t('software.steam_config.currently_active', 'CURRENTLY ACTIVE')}
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

      <div className="flex items-center justify-end gap-4 pt-4 border-t border-gray-100 dark:border-slate-700">
        <AnimatePresence>
          {success && (
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="text-green-600 dark:text-green-400 text-sm font-medium flex items-center gap-2">
              <CheckCircleIcon className="w-5 h-5" /> {success}
            </motion.div>
          )}
          {error && (
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="text-red-600 dark:text-red-400 text-sm font-medium flex items-center gap-2">
              <XCircleIcon className="w-5 h-5" /> {error}
            </motion.div>
          )}
        </AnimatePresence>

        <button
          onClick={handleSaveClick}
          disabled={selectedBranch === currentBranch || isInstalling}
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2.5 rounded-xl font-semibold shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {isInstalling ? t('software.buttons.saving', 'Saving...') : t('software.buttons.save', 'Save Changes')}
        </button>
      </div>

      <AnimatePresence>
        {showWarning && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl max-w-lg w-full overflow-hidden"
            >
              <div className="p-6 border-b bg-yellow-50 border-yellow-100 dark:bg-yellow-900/20 dark:border-yellow-800">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-full bg-yellow-100 text-yellow-600 dark:bg-yellow-900/50 dark:text-yellow-400">
                    <ExclamationTriangleIcon className="w-6 h-6" />
                  </div>
                  <h3 className="text-lg font-bold text-yellow-900 dark:text-yellow-300">
                    {t('software.steam_config.modal_title', 'Confirm Configuration Change')}
                  </h3>
                </div>
              </div>
              
              <div className="p-6 space-y-4">
                <p 
                  className="text-gray-700 dark:text-gray-200 leading-relaxed" 
                  dangerouslySetInnerHTML={{ 
                    __html: t('software.steam_config.modal_desc', { 
                      branch: selectedBranch, 
                      defaultValue: `You are about to switch the server configuration to <strong>${selectedBranch}</strong>. The server will apply these changes the next time it restarts.` 
                    }) 
                  }} 
                />
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded-lg p-4 text-sm text-blue-800 dark:text-blue-300 flex items-start gap-3">
                  <ArchiveBoxIcon className="w-5 h-5 shrink-0 mt-0.5" />
                  <span>{t('software.steam_config.modal_warning', 'If you are switching to an experimental or beta branch, we highly recommend taking a backup of your save files first.')}</span>
                </div>
              </div>

              <div className="bg-gray-50 dark:bg-slate-700 px-6 py-4 flex justify-end gap-3 border-t border-gray-200 dark:border-slate-700">
                <button
                  onClick={() => setShowWarning(false)}
                  className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-600 font-medium"
                >
                  {t('software.steam_config.btn_cancel', 'Cancel')}
                </button>
                <button
                  onClick={confirmChange}
                  className="px-4 py-2 text-white rounded-lg font-medium shadow-sm bg-indigo-600 hover:bg-indigo-700"
                >
                  {t('software.steam_config.btn_confirm', 'Confirm Change')}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}