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
  ArchiveBoxIcon,
  BoltIcon,
  CpuChipIcon as ChipIcon,
  GlobeAltIcon
} from '@heroicons/react/24/outline';

// XML Parser for Maven metadata (Forge/NeoForge)
const parseMavenXml = (text) => {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(text, "text/xml");
  const versionNodes = xmlDoc.getElementsByTagName("version");
  const versions = [];
  for (let i = 0; i < versionNodes.length; i++) {
    versions.push(versionNodes[i].childNodes[0].nodeValue);
  }
  return versions;
};

export default function ServerSoftwareTab({ server, onSoftwareChange }) {
  // --- State ---
  const [serverType, setServerType] = useState(server?.type || 'vanilla');
  const [version, setVersion] = useState(server?.version || '');
  const [availableVersions, setAvailableVersions] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
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
      id: 'purpur', 
      label: 'Purpur', 
      description: 'Paper fork with more features & config.', 
      icon: BeakerIcon, 
      color: 'bg-purple-50 text-purple-700 border-purple-200' 
    },
    { 
      id: 'folia', 
      label: 'Folia', 
      description: 'Multithreaded Paper fork (Experimental).', 
      icon: BoltIcon, 
      color: 'bg-rose-50 text-rose-700 border-rose-200' 
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
      id: 'neoforge', 
      label: 'NeoForge', 
      description: 'Modern fork of Minecraft Forge.', 
      icon: WrenchScrewdriverIcon, 
      color: 'bg-orange-100 text-orange-800 border-orange-300' 
    },
    { 
      id: 'fabric', 
      label: 'Fabric', 
      description: 'Lightweight, experimental modding.', 
      icon: ChipIcon, 
      color: 'bg-indigo-50 text-indigo-700 border-indigo-200' 
    },
    { 
      id: 'quilt', 
      label: 'Quilt', 
      description: 'The community-driven mod loader.', 
      icon: ChipIcon, 
      color: 'bg-teal-50 text-teal-700 border-teal-200' 
    },
    { 
      id: 'arclight', 
      label: 'Arclight', 
      description: 'Hybrid server (Forge mods + Plugins).', 
      icon: ArchiveBoxIcon, 
      color: 'bg-cyan-50 text-cyan-700 border-cyan-200' 
    },
    { 
      id: 'mohist', 
      label: 'Mohist', 
      description: 'Hybrid server (Forge mods + Plugins).', 
      icon: ArchiveBoxIcon, 
      color: 'bg-red-50 text-red-700 border-red-200' 
    },
    { 
      id: 'magma', 
      label: 'Magma', 
      description: 'Hybrid server (Forge mods + Plugins).', 
      icon: ArchiveBoxIcon, 
      color: 'bg-pink-50 text-pink-700 border-pink-200' 
    },
    { 
      id: 'velocity', 
      label: 'Velocity', 
      description: 'Modern, high-performance proxy.', 
      icon: GlobeAltIcon, 
      color: 'bg-sky-50 text-sky-700 border-sky-200' 
    },
    { 
      id: 'waterfall', 
      label: 'Waterfall', 
      description: 'Classic BungeeCord fork.', 
      icon: GlobeAltIcon, 
      color: 'bg-blue-100 text-blue-800 border-blue-300' 
    },
  ];

  // --- Helpers ---

  const fetchWithCorsProxy = async (url, isXml = false) => {
    const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(url)}`;
    const response = await fetch(proxyUrl);
    if (!response.ok) throw new Error(`Request failed with status ${response.status}`);
    const text = await response.text();
    return isXml ? parseMavenXml(text) : JSON.parse(text);
  };

  const sortVersions = (versions) => {
    return versions.sort((a, b) => {
      // Normalize version strings (remove non-numeric prefixes/suffixes for sorting if needed)
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
    
    // For specific loaders that include build numbers (e.g., 1.20.1-47.1.0), we assume stable unless 'beta'/'rc' is in string
    if (['forge', 'neoforge', 'arclight', 'mohist', 'magma'].includes(type)) {
      return versions.filter(v => !v.toLowerCase().includes('beta') && !v.toLowerCase().includes('rc'));
    }

    return versions.filter(v => {
      const isStableFormat = stableRegex.test(v);
      const hasUnstableKeywords = v.includes('snapshot') || v.includes('pre') || v.includes('rc') || v.includes('experimental') || v.includes('w');
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
      setAvailableVersions([]); // Clear previous
      
      try {
        let versions = [];
        switch (serverType) {
          case 'vanilla':
          case 'spigot': // Fallback to vanilla versions for Spigot to fix 404
            const vRes = await fetch('https://launchermeta.mojang.com/mc/game/version_manifest.json');
            versions = (await vRes.json()).versions.map(v => v.id);
            break;
          case 'paper':
            const pRes = await fetch('https://api.papermc.io/v2/projects/paper');
            versions = (await pRes.json()).versions;
            break;
          case 'folia':
            const fRes = await fetch('https://api.papermc.io/v2/projects/folia');
            versions = (await fRes.json()).versions;
            break;
          case 'velocity':
            const velRes = await fetch('https://api.papermc.io/v2/projects/velocity');
            versions = (await velRes.json()).versions;
            break;
          case 'waterfall':
            const wRes = await fetch('https://api.papermc.io/v2/projects/waterfall');
            versions = (await wRes.json()).versions;
            break;
          case 'purpur':
            const purRes = await fetch('https://api.purpurmc.org/v2/purpur');
            versions = (await purRes.json()).versions;
            break;
          case 'forge':
            // Fetch PROMOS for simplified list, or FULL list for specific nomenclature
            // Using full list logic to satisfy "specific nomenclature" request
            const forgeData = await fetchWithCorsProxy('https://files.minecraftforge.net/net/minecraftforge/forge/maven-metadata.xml', true);
            versions = forgeData; // Contains e.g. "1.20.1-47.1.0"
            break;
          case 'neoforge':
            const neoData = await fetchWithCorsProxy('https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml', true);
            versions =ZZneoData; 
            break;
          case 'fabric':
            const fabRes = await fetch('https://meta.fabricmc.net/v2/versions/game');
            versions = (await fabRes.json()).map(v => v.version);
            break;
          case 'quilt':
            const quiltRes = await fetch('https://meta.quiltmc.org/v3/versions/game');
            versions = (await quiltRes.json()).map(v => v.version);
            break;
          case 'arclight':
            // Arclight versions are complex, let's simplify to MC versions or use their API if CORS allows
            // Fallback: Use Vanilla versions but filtered to 1.16+ (Arclight scope)
            const arcRes = await fetch('https://launchermeta.mojang.com/mc/game/version_manifest.json');
            versions = (await arcRes.json()).versions.filter(v => parseFloat(v.id) >= 1.16).map(v => v.id);
            break;
          case 'mohist':
            const mohistRes = await fetchWithCorsProxy('https://mohistmc.com/api/v2/projects/mohist');
            versions = (mohistRes.versions || []);
            break;
          case 'magma':
            const magmaRes = await fetchWithCorsProxy('https://api.magmafoundation.org/api/v2/allVersions');
            versions = (magmaRes || []).map(v => v.name || v);
            break;
        }

        // Sort descending
        const sorted = sortVersions(versions);
        setAvailableVersions(sorted);

        // Auto-select logic
        if (isInitialMount.current && !version) {
          const stable = filterStableVersions(sorted, serverType);
          if (stable.length > 0) setVersion(stable[0]);
          isInitialMount.current = false;
        } else if (!version && sorted.length > 0) {
           const stable = filterStableVersions(sorted, serverType);
           if (stable.length > 0) setVersion(stable[0]);
           else setVersion(sorted[0]);
        }

      } catch (err) {
        console.error(err);
        setError(`Could not load versions: ${err.message}`);
        setAvailableVersions([]);
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
      return; 
    }
    setVersionChangeInfo(impact);
    setShowVersionWarning(true);
  };

  const confirmChange = async () => {
    setShowVersionWarning(false);
    setSuccess(null);
    setError(null);

    try {
      const needsRecreation = server?.hetzner_id && versionChangeInfo.requiresRecreation;
      const payload = needsRecreation 
        ? {
            needs_recreation: true,
            pending_type: serverType,
            pending_version: version,
            needs_file_deletion: versionChangeInfo.requiresFileDeletion || false,
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
          <ChipIcon className="w-5 h-5 text-gray-500" /> Software Platform
        </h2>
        
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {softwareOptions.map((opt) => {
            const isSelected = serverType === opt.id;
            return (
              <div
                key={opt.id}
                onClick={() => {
                  setServerType(opt.id);
                  setSearchQuery(''); 
                  setVersion(''); // Reset version when changing type
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
                  <p className="text-xs text-gray-500 mt-1 leading-snug hidden sm:block">{opt.description}</p>
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
            <div className="relative flex-1 sm:flex-none">
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input 
                type="text" 
                placeholder="Search version..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 w-full sm:w-48"
              />
            </div>

            <button
              onClick={() => setShowAllVersions(!showAllVersions)}
              className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors ${
                showAllVersions
                  ? 'bg-amber-50 text-amber-700 border-amber-200'
                  : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
              }`}
            >
              {showAllVersions ? 'Show All' : 'Show Stable'}
            </button>
          </div>
        </div>

        {loadingVersions ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 animate-pulse">
            {[...Array(12)].map((_, i) => (
              <div key={i} className="h-10 bg-gray-100 rounded-lg"></div>
            ))}
          </div>
        ) : displayedVersions.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2 max-h-[320px] overflow-y-auto p-1 custom-scrollbar">
            {displayedVersions.map((v) => {
              const isSelected = version === v;
              // Simple check for stability for coloring
              const isStable = !v.includes('pre') && !v.includes('rc') && !v.includes('snapshot') && !v.includes('beta');
              
              return (
                <button
                  key={v}
                  onClick={() => setVersion(v)}
                  className={`px-3 py-2 rounded-lg text-xs sm:text-sm font-medium border transition-all duration-150 relative overflow-hidden truncate text-left
                    ${isSelected 
                      ? 'border-indigo-600 bg-indigo-600 text-white shadow-md' 
                      : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50'
                    }
                    ${!isStable && !isSelected ? 'opacity-80 bg-gray-50 text-gray-500' : ''}
                  `}
                  title={v}
                >
                  {v}
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