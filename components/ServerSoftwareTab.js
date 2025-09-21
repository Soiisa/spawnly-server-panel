// components/ServerSoftwareTab.js

import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';

export default function ServerSoftwareTab({ server, onSoftwareChange }) {
  const [serverType, setServerType] = useState(server?.type || 'vanilla');
  const [version, setVersion] = useState(server?.version || '');
  const [availableVersions, setAvailableVersions] = useState([]);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [showVersionWarning, setShowVersionWarning] = useState(false);
  const [versionChangeInfo, setVersionChangeInfo] = useState(null);
  const isInitialMount = useRef(true);

  // Helper function to fetch with CORS proxy
  const fetchWithCorsProxy = async (url) => {
    const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(url)}`;
    try {
      const response = await fetch(proxyUrl);
      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error('CORS proxy request failed:', error);
      throw error;
    }
  };

  // Helper function to sort versions in descending order
  const sortVersions = (versions) => {
    return versions.sort((a, b) => {
      const partsA = a.split('.').map(Number);
      const partsB = b.split('.').map(Number);
      
      for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
        const numA = partsA[i] || 0;
        const numB = partsB[i] || 0;
        if (numA !== numB) {
          return numB - numA; // Sort in descending order
        }
      }
      return 0;
    });
  };

  // Check if version change or software switch requires server recreation or file deletion
  const checkVersionChangeImpact = (newType, newVersion) => {
    console.log('Checking version change impact:', { newType, newVersion, currentType: server?.type, currentVersion: server?.version });
    
    if (!server?.id) {
      console.log('No server ID, treating as new configuration');
      return {
        requiresRecreation: false,
        requiresFileDeletion: false,
        severity: 'none',
        message: 'This server has not been started yet. The selected software type and version will be applied when you start the server.',
        backupMessage: 'No data exists yet, but ensure you have a backup strategy for future world data stored in the server’s storage path.'
      };
    }

    const currentType = server?.type || 'vanilla';
    const currentVersion = server?.version || '';
    
    if (newType !== currentType || newVersion !== currentVersion) {
      let requiresRecreation = !!server?.hetzner_id;
      let requiresFileDeletion = false;
      let severity = 'medium';
      let baseMessage = '';
      let backupMessage = '';

      const currentParts = currentVersion.split('.').map(part => parseInt(part) || 0);
      const newParts = newVersion.split('.').map(part => parseInt(part) || 0);
      
      let isDowngrade = false;
      for (let i = 0; i < Math.min(currentParts.length, newParts.length); i++) {
        if (newParts[i] < currentParts[i]) {
          isDowngrade = true;
          break;
        } else if (newParts[i] > currentParts[i]) {
          break;
        }
      }

      if (newType !== currentType) {
        console.log('Software type change detected');
        requiresFileDeletion = true;
        severity = 'high';
        baseMessage = `Switching from ${currentType} to ${newType} requires new software, which will delete all existing server files, including your world data, configuration files, and plugins. This action cannot be undone.`;
        backupMessage = `Please back up your world data and configurations before proceeding. Your data is stored at ${server?.storage_path || 'the server’s storage path'}. You can download it using your server management tools or contact support for assistance.`;
      } else if (newType === 'vanilla') {
        console.log('Vanilla version change detected');
        requiresFileDeletion = false;
        severity = isDowngrade ? 'high' : 'medium';
        baseMessage = `Changing the Vanilla version from ${currentVersion} to ${newVersion} requires new server software. Your existing world data and configurations will be preserved and loaded on the new server. However, ${isDowngrade ? 'downgrading' : 'upgrading'} may cause compatibility issues with your existing world, such as missing blocks or features.`;
        backupMessage = `We strongly recommend backing up your world data before proceeding to avoid potential issues. Your data is stored at ${server?.storage_path || 'the server’s storage path'}. You can download it using your server management tools or contact support for assistance.`;
      } else {
        console.log('Non-Vanilla version change detected');
        requiresFileDeletion = true;
        severity = 'high';
        baseMessage = `Changing the ${newType} version from ${currentVersion} to ${newVersion} requires new software, which will delete all existing server files, including your world data, configuration files, and plugins. This action cannot be undone.`;
        backupMessage = `Please back up your world data and configurations before proceeding. Your data is stored at ${server?.storage_path || 'the server’s storage path'}. You can download it using your server management tools or contact support for assistance.`;
      }

      let message = baseMessage;
      if (requiresRecreation) {
        message = baseMessage.replace('requires new software', 'requires recreating the server with new software') + ' The change will take effect when the server is next started.';
      } else {
        message = `The server has not been started yet. ` + baseMessage + (requiresFileDeletion ? ' Any existing data in storage will be deleted when the server is started.' : ' Existing data will be preserved when the server is started.');
      }

      return {
        requiresRecreation,
        requiresFileDeletion,
        severity,
        message,
        backupMessage
      };
    }
    
    console.log('No significant changes detected');
    return {
      requiresRecreation: false,
      requiresFileDeletion: false,
      severity: 'none',
      message: 'No significant changes detected. The current software type and version will remain unchanged.',
      backupMessage: `As a precaution, ensure your world data is backed up regularly. Your data is stored at ${server?.storage_path || 'the server’s storage path'}.`
    };
  };

  // Handle server type change
  const handleServerTypeChange = (newType) => {
    console.log('Server type changed to:', newType);
    setServerType(newType);
    setVersion(''); // Reset version when type changes to ensure valid selection
  };

  // Handle version change
  const handleVersionChange = (newVersion) => {
    console.log('Version changed to:', newVersion);
    setVersion(newVersion);
  };

  // Handle save button click
  const handleSaveChanges = async () => {
    console.log('Save Changes clicked', { serverType, version, server });
    if (!server?.id) {
      console.error('No server data available');
      setError('No server data available. Please try again.');
      return;
    }

    const impact = checkVersionChangeImpact(serverType, version);
    console.log('Change impact:', impact);

    if (impact.severity === 'none' && serverType === server?.type && version === server?.version) {
      console.log('No changes to save');
      setError('No changes to save.');
      return;
    }

    setVersionChangeInfo(impact);
    setShowVersionWarning(true);
  };

  // Confirm version change - update Supabase and verify
  const confirmVersionChange = async () => {
    console.log('Confirming version change with:', { serverType, version });
    setShowVersionWarning(false);
    setError(null);
    setSuccess(null);

    try {
      const currentType = server?.type || 'vanilla';
      const updateData = server?.hetzner_id && versionChangeInfo?.requiresRecreation
        ? {
            needs_recreation: true,
            pending_type: serverType,
            pending_version: version,
            needs_file_deletion: versionChangeInfo?.requiresFileDeletion || false,
            force_software_install: !versionChangeInfo?.requiresFileDeletion && (serverType === currentType)
          }
        : {
            type: serverType,
            version: version,
            needs_file_deletion: versionChangeInfo?.requiresFileDeletion || false,
            force_software_install: false
          };

      console.log('Updating Supabase with:', updateData);

      // Perform the update
      const { error: updateError } = await supabase
        .from('servers')
        .update(updateData)
        .eq('id', server.id);

      if (updateError) {
        console.error('Supabase update error:', updateError);
        throw new Error(`Failed to update server: ${updateError.message}`);
      }

      // Verify the update
      const { data: updatedServer, error: fetchError } = await supabase
        .from('servers')
        .select('*')
        .eq('id', server.id)
        .single();

      if (fetchError || !updatedServer) {
        console.error('Supabase fetch error:', fetchError);
        throw new Error('Failed to verify server update.');
      }

      // Verify the changes were applied
      if (server?.hetzner_id && versionChangeInfo?.requiresRecreation) {
        if (updatedServer.pending_type !== serverType || updatedServer.pending_version !== version || 
            updatedServer.needs_file_deletion !== updateData.needs_file_deletion ||
            updatedServer.force_software_install !== updateData.force_software_install) {
          throw new Error('Pending changes were not applied correctly.');
        }
      } else {
        if (updatedServer.type !== serverType || updatedServer.version !== version ||
            updatedServer.force_software_install !== false) {
          throw new Error('Server type or version was not updated correctly.');
        }
      }

      // Update local state
      setServerType(updatedServer.type || updatedServer.pending_type || serverType);
      setVersion(updatedServer.version || updatedServer.pending_version || version);
      console.log('Version set after save:', updatedServer.version || updatedServer.pending_version);

      // Notify parent component
      if (onSoftwareChange) {
        onSoftwareChange({
          type: updatedServer.type || updatedServer.pending_type || serverType,
          version: updatedServer.version || updatedServer.pending_version || version,
          needs_file_deletion: updatedServer.needs_file_deletion || false,
          force_software_install: updatedServer.force_software_install || false
        });
      }

      // Set success message
      setSuccess(
        server?.hetzner_id && versionChangeInfo?.requiresRecreation
          ? versionChangeInfo.requiresFileDeletion
            ? 'Server configuration updated. The server will be recreated, and all existing files will be deleted on the next start. Ensure you have backed up your data.'
            : 'Server configuration updated. The server will be recreated with the new software/version on the next start, preserving your existing data.'
          : 'Server configuration updated successfully. The change will take effect when the server is started.'
      );

    } catch (error) {
      console.error('Error updating server configuration:', error);
      setError(`Failed to update server configuration: ${error.message}`);
    }
  };

  const cancelVersionChange = () => {
    console.log('Cancelling version change');
    setShowVersionWarning(false);
    setVersionChangeInfo(null);
    setServerType(server?.type || 'vanilla');
    setVersion(server?.version || '');
  };

  // Fetch available versions based on server type and initialize version
  useEffect(() => {
    console.log('useEffect triggered', { serverType, serverVersion: server?.version });
    const fetchVersions = async () => {
      if (!serverType) {
        console.log('No serverType, skipping fetch');
        return;
      }

      setLoadingVersions(true);
      setError(null);
      try {
        let versions = [];

        switch (serverType) {
          case 'vanilla':
            {
              const vanillaRes = await fetch('https://launchermeta.mojang.com/mc/game/version_manifest.json');
              const vanillaData = await vanillaRes.json();
              versions = vanillaData.versions.map(v => v.id).filter(v => v.startsWith('1.'));
            }
            break;

          case 'paper':
            {
              const paperRes = await fetch('https://api.papermc.io/v2/projects/paper');
              const paperData = await paperRes.json();
              versions = paperData.versions;
            }
            break;

          case 'spigot':
            {
              const spigotRes = await fetchWithCorsProxy('https://cdn.getbukkit.org/spigot/spigot.json');
              versions = spigotRes.versions.map(v => v.version);
            }
            break;

          case 'forge':
            {
              const forgeData = await fetchWithCorsProxy(
                'https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json'
              );

              const versionSet = new Set();
              for (const key in forgeData.promos) {
                const [mcVersion] = key.split('-');
                versionSet.add(mcVersion);
              }
              versions = Array.from(versionSet);
            }
            break;

          case 'fabric':
            {
              const fabricRes = await fetch('https://meta.fabricmc.net/v2/versions/game');
              const fabricData = await fabricRes.json();
              versions = fabricData.map(v => v.version);
            }
            break;

          default:
            break;
        }

        // Sort versions in descending order
        versions = sortVersions(versions);
        console.log('Fetched versions:', versions);

        setAvailableVersions(versions);

        // Set version: prioritize server.version, then current version if valid, else latest
        if (isInitialMount.current && server?.version && versions.includes(server.version)) {
          console.log('Initial mount, setting version from server prop:', server.version);
          setVersion(server.version);
        } else if (version && versions.includes(version)) {
          console.log('Retaining current version:', version);
          // Version already set and valid, no change needed
        } else if (versions.length > 0) {
          console.log('Setting default version:', versions[0]);
          setVersion(versions[0]);
        } else {
          console.log('No versions available, setting fallback version');
          setVersion('1.19.2');
        }
        isInitialMount.current = false;
      } catch (error) {
        console.error('Error fetching versions:', error);
        setError(`Failed to load versions: ${error.message}`);
      } finally {
        setLoadingVersions(false);
      }
    };

    fetchVersions();
  }, [serverType]);

  const softwareOptions = [
    { value: 'vanilla', label: 'Vanilla' },
    { value: 'paper', label: 'Paper' },
    { value: 'spigot', label: 'Spigot' },
    { value: 'forge', label: 'Forge' },
    { value: 'fabric', label: 'Fabric' },
  ];

  return (
    <div className="bg-white rounded-xl shadow p-6">
      {/* Version Change Warning Modal */}
      {showVersionWarning && versionChangeInfo && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
          <div className="bg-white rounded-xl shadow-lg p-6 w-full max-w-md">
            <div className="flex justify-between items-center mb-4">
              <h3 className={`text-lg font-bold ${
                versionChangeInfo.severity === 'high' ? 'text-red-600' : 'text-yellow-600'
              }`}>
                {versionChangeInfo.severity === 'high' ? 'Warning: Data Loss Risk' : 'Recommendation: Backup Suggested'}
              </h3>
            </div>
            
            <div className={`border-l-4 p-4 mb-4 ${
              versionChangeInfo.severity === 'high' 
                ? 'bg-red-50 border-red-400' 
                : 'bg-yellow-50 border-yellow-400'
            }`}>
              <div className="flex">
                <div className="flex-shrink-0">
                  {versionChangeInfo.severity === 'high' ? (
                    <svg className="h-5 w-5 text-red-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                  ) : (
                    <svg className="h-5 w-5 text-yellow-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                    </svg>
                  )}
                </div>
                <div className="ml-3">
                  <p className={`text-sm ${
                    versionChangeInfo.severity === 'high' ? 'text-red-700' : 'text-yellow-700'
                  }`}>
                    {versionChangeInfo.message}
                  </p>
                </div>
              </div>
            </div>
            
            <div className="bg-blue-50 border-l-4 border-blue-400 p-4 mb-4">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-blue-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <p className="text-sm text-blue-700">
                    {versionChangeInfo.backupMessage}
                  </p>
                </div>
              </div>
            </div>
            
            <div className="flex justify-end space-x-3">
              <button
                onClick={cancelVersionChange}
                className="bg-gray-300 hover:bg-gray-400 text-gray-700 py-2 px-4 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={confirmVersionChange}
                className={`${
                  versionChangeInfo.severity === 'high' 
                    ? 'bg-red-600 hover:bg-red-700' 
                    : 'bg-blue-600 hover:bg-blue-700'
                } text-white py-2 px-4 rounded-lg`}
              >
                I Understand
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Success and Error Messages */}
      {success && (
        <div className="bg-green-50 text-green-700 p-4 rounded-lg mb-6 flex justify-between items-center">
          <p>{success}</p>
          <button onClick={() => setSuccess(null)} className="text-green-800">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      )}

      {error && (
        <div className="bg-red-50 text-red-700 p-4 rounded-lg mb-6 flex justify-between items-center">
          <p>{error}</p>
          <button onClick={() => setError(null)} className="text-red-800">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      )}

      <div className="mb-8">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Server Software</h2>

        {/* Top Row: Software Type Selection */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">Select Software Type</label>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            {softwareOptions.map((option) => (
              <div
                key={option.value}
                onClick={() => handleServerTypeChange(option.value)}
                className={`cursor-pointer rounded-lg border p-4 text-center transition-colors ${
                  serverType === option.value
                    ? 'bg-indigo-100 border-indigo-500 text-indigo-700'
                    : 'bg-white border-gray-300 hover:bg-gray-50'
                }`}
              >
                <div className="font-medium">{option.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom Row: Version Selection */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">Select Version</label>
          {loadingVersions ? (
            <div className="animate-pulse bg-gray-200 rounded h-24 w-full" />
          ) : availableVersions.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4 auto-rows-fr">
              {availableVersions.map((v) => (
                <div
                  key={v}
                  onClick={() => handleVersionChange(v)}
                  className={`cursor-pointer rounded-lg border p-4 text-center transition-colors ${
                    version === v
                      ? 'bg-indigo-100 border-indigo-500 text-indigo-700'
                      : 'bg-white border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <div className="font-medium">{v}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-gray-500">No versions available. Please select a different software type.</div>
          )}
        </div>

        {/* Save Button */}
        <div className="flex justify-end">
          <button
            onClick={handleSaveChanges}
            disabled={!serverType || !version || (serverType === server?.type && version === server?.version)}
            className="bg-indigo-600 hover:bg-indigo-700 text-white py-2 px-6 rounded-lg disabled:opacity-50"
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}