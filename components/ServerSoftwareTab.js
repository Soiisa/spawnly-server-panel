import { useState, useEffect, useRef, useMemo } from 'react';
import { supabase } from '../lib/supabaseClient';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  CubeTransparentIcon, 
  DocumentTextIcon, 
  WrenchScrewdriverIcon, 
  BeakerIcon,
  MagnifyingGlassIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  XCircleIcon,
  ArchiveBoxIcon
} from '@heroicons/react/24/outline';

export default function ServerSoftwareTab({ server, onSoftwareChange }) {
  // --- State ---
  const [serverType, setServerType] = useState(server?.type || 'vanilla');
  const [version, setVersion] = useState(server?.version || '');
  const [availableVersions, setAvailableVersions] = useState([]);
  const [searchQuery, setSearchQuery] = useState(''); // New: Search state
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [showVersionWarning, setShowVersionWarning] = useState(false);
  const [versionChangeInfo, setVersionChangeInfo] = useState(null);
  const [showAllVersions, setShowAllVersions] = useState(false);
  
  const isInitialMount = useRef(true);

  // --- Definitions ---
  const softwareOptions = [
    { 
      id: 'vanilla', 
      label: 'Vanilla', 
      description: 'The official Minecraft server software.', 
      icon: CubeTransparentIcon, 
      color: 'bg-green-50 text-green-700 border-green-200' 
    },
    { 
      id: 'paper', 
      label: 'Paper', 
      description: 'High-performance fork of Spigot.', 
      icon: DocumentTextIcon, 
      color: 'bg-blue-50 text-blue-700 border-blue-200' 
    },
    { 
      id: 'spigot', 
      label: 'Spigot', 
      description: 'Modified server with plugin support.', 
      icon: ArchiveBoxIcon, 
      color: 'bg-orange-50 text-orange-700 border-orange-200' 
    },
    { 
      id: 'forge', 
      label: 'Forge', 
      description: 'The classic modding API.', 
      icon: WrenchScrewdriverIcon, 
      color: 'bg-amber-50 text-amber-700 border-amber-200' 
    },
    { 
      id: 'fabric', 
      label: 'Fabric', 
      description: 'Lightweight, experimental modding.', 
      icon: BeakerIcon, 
      color: 'bg-indigo-50 text-indigo-700 border-indigo-200' 
    },
  ];

  // --- Helpers ---

  const fetchWithCorsProxy = async (url) => {
    const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(url)}`;
    const response = await fetch(proxyUrl);
    if (!response.ok) throw new Error(`Request failed with status ${response.status}`);
    return await response.json();
  };

  const sortVersions = (versions) => {
    return versions.sort((a, b) => {
      // Normalize version strings (remove non-numeric prefixes/suffixes for sorting if needed)
      // This simple split usually works for semantic versioning
      const partsA = a.replace(/[^0-9.]/g, '').split('.').map(Number);
      const partsB = b.replace(/[^0-9.]/g, '').split('.').map(Number);
      for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
        const numA = partsA[i] || 0;
        const numB = partsB[i] || 0;
        if (numA !== numB) return numB - numA;
      }
      return b.localeCompare(a); // Fallback string compare
    });
  };

  const filterStableVersions = (versions, type) => {
    // Regex allows "1.20", "1.20.1" but excludes "1.20-pre1", "23w45a"
    const stableRegex = /^\d+\.\d+(\.\d+)?$/;
    
    // Additional filters for specific software if needed
    return versions.filter(v => {
      const isStableFormat = stableRegex.test(v);
      const hasUnstableKeywords = v.includes('snapshot') || v.includes('pre') || v.includes('rc') || v.includes('experimental') || v.includes('w');
      
      if (type === 'vanilla') return isStableFormat && !hasUnstableKeywords;
      return isStableFormat && !hasUnstableKeywords;
    });
  };

  // --- Logic: Impact Analysis ---
  const checkVersionChangeImpact = (newType, newVersion) => {
    if (!server?.id) return { severity: 'none', message: 'New server configuration.', requiresRecreation: false };

    const currentType = server?.type || 'vanilla';
    const currentVersion = server?.version || '';
    
    if (newType !== currentType) {
      return {
        severity: 'high',
        requiresRecreation: !!server?.hetzner_id,
        requiresFileDeletion: true,
        message: `Switching from ${currentType} to ${newType} requires a clean install. ALL existing files (world, plugins, configs) will be deleted.`,
        backupMessage: 'Download your world files before proceeding!'
      };
    } else if (newVersion !== currentVersion) {
      // Version change logic
      return {
        severity: 'medium',
        requiresRecreation: !!server?.hetzner_id,
        requiresFileDeletion: false,
        message: `Changing version from ${currentVersion} to ${newVersion}. Existing files are preserved, but downgrading may corrupt your world.`,
        backupMessage: 'We recommend backing up your world before changing versions.'
      };
    }
    return { severity: 'none' };
  };

  // --- Data Fetching ---
  useEffect(() => {
    const fetchVersions = async () => {
      if (!serverType) return;
      setLoadingVersions(true);
      setError(null);
      
      try {
        let versions = [];
        switch (serverType) {
          case 'vanilla':
            const vRes = await fetch('https://launchermeta.mojang.com/mc/game/version_manifest.json');
            versions = (await vRes.json()).versions.map(v => v.id);
            break;
          case 'paper':
            const pRes = await fetch('https://api.papermc.io/v2/projects/paper');
            versions = (await pRes.json()).versions;
            break;
          case 'spigot':
            const sRes = await fetchWithCorsProxy('https://cdn.getbukkit.org/spigot/spigot.json');
            versions = (await sRes.json()).versions.map(v => v.version);
            break;
          case 'forge':
            const fData = await fetchWithCorsProxy('https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json');
            const fSet = new Set();
            for (const key in fData.promos) fSet.add(key.split('-')[0]);
            versions = Array.from(fSet);
            break;
          case 'fabric':
            const fabRes = await fetch('https://meta.fabricmc.net/v2/versions/game');
            versions = (await fabRes.json()).map(v => v.version);
            break;
        }

        const sorted = sortVersions(versions);
        setAvailableVersions(sorted);

        // Auto-select logic on initial load or empty
        if (isInitialMount.current) {
          if (server?.version && versions.includes(server.version)) {
            setVersion(server.version);
          } else {
            const stable = filterStableVersions(sorted, serverType);
            if (stable.length > 0) setVersion(stable[0]);
          }
          isInitialMount.current = false;
        } else if (!version) {
           const stable = filterStableVersions(sorted, serverType);
           if (stable.length > 0) setVersion(stable[0]);
        }

      } catch (err) {
        console.error(err);
        setError(`Could not load versions: ${err.message}`);
      } finally {
        setLoadingVersions(false);
      }
    };

    fetchVersions();
  }, [serverType]);

  // --- Computed Versions ---
  const displayedVersions = useMemo(() => {
    let list = showAllVersions 
      ? availableVersions 
      : filterStableVersions(availableVersions, serverType);
    
    if (searchQuery) {
      list = list.filter(v => v.toLowerCase().includes(searchQuery.toLowerCase()));
    }
    return list;
  }, [availableVersions, showAllVersions, serverType, searchQuery]);

  // --- Handlers ---
  const handleSaveClick = () => {
    const impact = checkVersionChangeImpact(serverType, version);
    if (impact.severity === 'none' && serverType === server?.type && version === server?.version) {
      return; // No changes
    }
    setVersionChangeInfo(impact);
    setShowVersionWarning(true);
  };

  const confirmChange = async () => {
    setShowVersionWarning(false);
    setSuccess(null);
    setError(null);

    try {
      // Determine update payload based on whether server exists and needs recreation
      const needsRecreation = server?.hetzner_id && versionChangeInfo.requiresRecreation;
      
      const payload = needsRecreation 
        ? {
            needs_recreation: true,
            pending_type: serverType,
            pending_version: version,
            needs_file_deletion: versionChangeInfo.requiresFileDeletion || false,
            // Only force software install if NOT deleting files (if deleting files, provision handles it anyway)
            // AND the type is the same (reinstalling same software version)
            force_software_install: !versionChangeInfo.requiresFileDeletion && (serverType === server.type)
          }
        : {
            type: serverType,
            version: version,
            needs_file_deletion: versionChangeInfo.requiresFileDeletion || false,
            force_software_install: false
          };

      const { error: err } = await supabase.from('servers').update(payload).eq('id', server.id);
      if (err) throw err;

      if (onSoftwareChange) onSoftwareChange(payload);
      
      setSuccess(needsRecreation 
        ? 'Configuration saved. Server will be updated on next restart.' 
        : 'Configuration saved successfully.'
      );
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="space-y-6">
      
      {/* 1. Software Selection Card */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <CpuChipIcon className="w-5 h-5 text-gray-500" /> Software Platform
        </h2>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {softwareOptions.map((opt) => {
            const isSelected = serverType === opt.id;
            return (
              <div
                key={opt.id}
                onClick={() => {
                  setServerType(opt.id);
                  setSearchQuery(''); // Reset search on type change
                }}
                className={`relative cursor-pointer rounded-xl p-4 border-2 transition-all duration-200 flex flex-col items-center text-center gap-3 group
                  ${isSelected 
                    ? `border-indigo-600 bg-indigo-50 shadow-md ring-1 ring-indigo-600` 
                    : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  }`}
              >
                <div className={`p-3 rounded-full ${isSelected ? 'bg-white text-indigo-600' : 'bg-gray-100 text-gray-500 group-hover:bg-white'}`}>
                  <opt.icon className="w-6 h-6" />
                </div>
                <div>
                  <h3 className={`font-bold ${isSelected ? 'text-indigo-900' : 'text-gray-900'}`}>{opt.label}</h3>
                  <p className="text-xs text-gray-500 mt-1 leading-snug">{opt.description}</p>
                </div>
                {isSelected && (
                  <div className="absolute top-2 right-2 text-indigo-600">
                    <CheckCircleIcon className="w-5 h-5" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 2. Version Selection Card */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <ArchiveBoxIcon className="w-5 h-5 text-gray-500" /> Game Version
          </h2>
          
          <div className="flex items-center gap-3 w-full sm:w-auto">
            {/* Search Bar */}
            <div className="relative flex-1 sm:flex-none">
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input 
                type="text" 
                placeholder="Search..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 w-full sm:w-48"
              />
            </div>

            {/* Toggle */}
            <button
              onClick={() => setShowAllVersions(!showAllVersions)}
              className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors ${
                showAllVersions
                  ? 'bg-amber-50 text-amber-700 border-amber-200'
                  : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
              }`}
            >
              {showAllVersions ? 'Show Stable Only' : 'Show All (Snapshots)'}
            </button>
          </div>
        </div>

        {/* Versions Grid */}
        {loadingVersions ? (
          <div className="grid grid-cols-3 sm:grid-cols-6 lg:grid-cols-8 gap-3 animate-pulse">
            {[...Array(16)].map((_, i) => (
              <div key={i} className="h-10 bg-gray-100 rounded-lg"></div>
            ))}
          </div>
        ) : displayedVersions.length > 0 ? (
          <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 gap-2 max-h-[320px] overflow-y-auto p-1 custom-scrollbar">
            {displayedVersions.map((v) => {
              const isSelected = version === v;
              const isStable = filterStableVersions([v], serverType).length > 0;
              return (
                <button
                  key={v}
                  onClick={() => setVersion(v)}
                  className={`px-3 py-2 rounded-lg text-sm font-medium border transition-all duration-150 relative overflow-hidden
                    ${isSelected 
                      ? 'border-indigo-600 bg-indigo-600 text-white shadow-md' 
                      : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50'
                    }
                    ${!isStable && !isSelected ? 'opacity-70 bg-gray-50 text-gray-500' : ''}
                  `}
                >
                  {v}
                  {!isStable && (
                    <span className={`absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-yellow-300' : 'bg-yellow-500'}`} title="Unstable/Snapshot" />
                  )}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-10 bg-gray-50 rounded-xl border border-dashed border-gray-300">
            <p className="text-gray-500">No versions found matching "{searchQuery}"</p>
          </div>
        )}
      </div>

      {/* 3. Action Bar */}
      <div className="flex items-center justify-end gap-4 pt-2">
        <AnimatePresence>
          {success && (
            <motion.div 
              initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}
              className="text-green-600 text-sm font-medium flex items-center gap-2"
            >
              <CheckCircleIcon className="w-5 h-5" /> {success}
            </motion.div>
          )}
          {error && (
            <motion.div 
              initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}
              className="text-red-600 text-sm font-medium flex items-center gap-2"
            >
              <XCircleIcon className="w-5 h-5" /> {error}
            </motion.div>
          )}
        </AnimatePresence>

        <button
          onClick={handleSaveClick}
          disabled={!version || (serverType === server?.type && version === server?.version)}
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2.5 rounded-xl font-semibold shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          Save Changes
        </button>
      </div>

      {/* Impact Warning Modal */}
      <AnimatePresence>
        {showVersionWarning && versionChangeInfo && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl shadow-xl max-w-lg w-full overflow-hidden"
            >
              <div className={`p-6 border-b ${
                versionChangeInfo.severity === 'high' ? 'bg-red-50 border-red-100' : 'bg-yellow-50 border-yellow-100'
              }`}>
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-full ${
                    versionChangeInfo.severity === 'high' ? 'bg-red-100 text-red-600' : 'bg-yellow-100 text-yellow-600'
                  }`}>
                    <ExclamationTriangleIcon className="w-6 h-6" />
                  </div>
                  <h3 className={`text-lg font-bold ${
                    versionChangeInfo.severity === 'high' ? 'text-red-900' : 'text-yellow-900'
                  }`}>
                    {versionChangeInfo.severity === 'high' ? 'High Impact Change' : 'Confirm Change'}
                  </h3>
                </div>
              </div>
              
              <div className="p-6 space-y-4">
                <p className="text-gray-700 leading-relaxed">
                  {versionChangeInfo.message}
                </p>
                
                {versionChangeInfo.backupMessage && (
                  <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 text-sm text-blue-800 flex items-start gap-3">
                    <ArchiveBoxIcon className="w-5 h-5 shrink-0 mt-0.5" />
                    <span>{versionChangeInfo.backupMessage}</span>
                  </div>
                )}
              </div>

              <div className="bg-gray-50 px-6 py-4 flex justify-end gap-3 border-t border-gray-200">
                <button
                  onClick={() => { setShowVersionWarning(false); setVersionChangeInfo(null); }}
                  className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmChange}
                  className={`px-4 py-2 text-white rounded-lg font-medium shadow-sm ${
                    versionChangeInfo.severity === 'high' ? 'bg-red-600 hover:bg-red-700' : 'bg-indigo-600 hover:bg-indigo-700'
                  }`}
                >
                  Confirm & Apply
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}

// Simple icon for consistency if not importing Heroicons directly in this snippet context
function CpuChipIcon(props) {
  return (
    <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 3v1.5M4.5 8.25H3m18 0h-1.5M4.5 12H3m18 0h-1.5m-15 3.75H3m18 0h-1.5M8.25 19.5V21M12 3v1.5m0 15V21m3.75-18v1.5m0 15V21m-9-1.5h10.5a2.25 2.25 0 002.25-2.25V6.75a2.25 2.25 0 00-2.25-2.25H6.75A2.25 2.25 0 004.5 6.75v10.5a2.25 2.25 0 002.25 2.25z" />
    </svg>
  );
}