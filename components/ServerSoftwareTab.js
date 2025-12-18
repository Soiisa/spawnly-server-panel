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
  GlobeAltIcon,
  CloudArrowDownIcon,
  PuzzlePieceIcon
} from '@heroicons/react/24/outline';

// XML Parser for Maven metadata (Forge/NeoForge)
const parseMavenXml = (text) => {
  try {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(text, "text/xml");
    const versionNodes = xmlDoc.getElementsByTagName("version");
    const versions = [];
    for (let i = 0; i < versionNodes.length; i++) {
      if (versionNodes[i].childNodes[0]) {
        versions.push(versionNodes[i].childNodes[0].nodeValue);
      }
    }
    return versions;
  } catch (e) {
    console.error("XML Parse Error:", e);
    return [];
  }
};

export default function ServerSoftwareTab({ server, onSoftwareChange }) {
  // --- State ---
  // Determine initial tab based on existing server type
  const isModpack = server?.type?.startsWith('modpack');
  const [activeTab, setActiveTab] = useState(isModpack ? 'modpacks' : 'types');
  
  // Standard Type State
  const [serverType, setServerType] = useState(isModpack ? 'vanilla' : (server?.type || 'vanilla'));
  const [version, setVersion] = useState(isModpack ? '' : (server?.version || ''));
  const [availableVersions, setAvailableVersions] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Modpack State
  const [modpackProvider, setModpackProvider] = useState('curseforge');
  const [modpackSearch, setModpackSearch] = useState('');
  const [modpackList, setModpackList] = useState([]);
  const [selectedModpack, setSelectedModpack] = useState(null);
  const [modpackFiles, setModpackFiles] = useState([]);
  const [customZipUrl, setCustomZipUrl] = useState('');
  const [customJavaVer, setCustomJavaVer] = useState('17');
  const [modpackVersionId, setModpackVersionId] = useState('');

  // Shared State
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [showVersionWarning, setShowVersionWarning] = useState(false);
  const [versionChangeInfo, setVersionChangeInfo] = useState(null);
  const [showAllVersions, setShowAllVersions] = useState(false);
  
  const isInitialMount = useRef(true);

  // --- Definitions ---
  const softwareOptions = [
    { id: 'vanilla', label: 'Vanilla', icon: CubeTransparentIcon, color: 'bg-green-50 text-green-700', badge: 'Vanilla' },
    { id: 'paper', label: 'Paper', icon: DocumentTextIcon, color: 'bg-blue-50 text-blue-700', badge: 'Plugins' },
    { id: 'purpur', label: 'Purpur', icon: BeakerIcon, color: 'bg-purple-50 text-purple-700', badge: 'Plugins' },
    { id: 'folia', label: 'Folia', icon: BoltIcon, color: 'bg-rose-50 text-rose-700', badge: 'Plugins' },
    { id: 'spigot', label: 'Spigot', icon: ArchiveBoxIcon, color: 'bg-orange-50 text-orange-700', badge: 'Plugins' },
    { id: 'forge', label: 'Forge', icon: WrenchScrewdriverIcon, color: 'bg-amber-50 text-amber-700', badge: 'Mods' },
    { id: 'neoforge', label: 'NeoForge', icon: WrenchScrewdriverIcon, color: 'bg-orange-100 text-orange-800', badge: 'Mods' },
    { id: 'fabric', label: 'Fabric', icon: ChipIcon, color: 'bg-indigo-50 text-indigo-700', badge: 'Mods' },
    { id: 'quilt', label: 'Quilt', icon: ChipIcon, color: 'bg-teal-50 text-teal-700', badge: 'Mods' },
    { id: 'velocity', label: 'Velocity', icon: GlobeAltIcon, color: 'bg-sky-50 text-sky-700', badge: 'Proxy' },
    { id: 'waterfall', label: 'Waterfall', icon: GlobeAltIcon, color: 'bg-blue-100 text-blue-800', badge: 'Proxy' },
  ];

  const modpackProviders = [
    { id: 'curseforge', label: 'CurseForge', icon: CloudArrowDownIcon },
    { id: 'modrinth', label: 'Modrinth', icon: CubeTransparentIcon },
    { id: 'ftb', label: 'FTB', icon: WrenchScrewdriverIcon },
    { id: 'custom', label: 'Custom Zip', icon: PuzzlePieceIcon },
  ];

  // --- Helpers ---

  const fetchWithLocalProxy = async (url, isXml = false) => {
    const proxyUrl = `/api/proxy?url=${encodeURIComponent(url)}`;
    const response = await fetch(proxyUrl);
    
    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(`Failed to fetch versions: ${response.status} ${errText}`);
    }
    
    const text = await response.text();
    return isXml ? parseMavenXml(text) : JSON.parse(text);
  };

  const sortVersions = (versions) => {
    const parse = (v) => v.split(/[-.]/).map(x => (isNaN(Number(x)) ? x : Number(x)));
    return versions.sort((a, b) => {
      const pa = parse(a);
      const pb = parse(b);
      for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        if (pa[i] === undefined) return 1; 
        if (pb[i] === undefined) return -1;
        if (pa[i] !== pb[i]) {
          if (typeof pa[i] === 'number' && typeof pb[i] === 'number') return pb[i] - pa[i];
          return String(pb[i]).localeCompare(String(pa[i])); 
        }
      }
      return 0;
    });
  };

  const filterStableVersions = (versions, type) => {
    const stableRegex = /^\d+\.\d+(\.\d+)?$/;
    if (['forge', 'neoforge'].includes(type)) {
      return versions.filter(v => !v.toLowerCase().includes('beta') && !v.toLowerCase().includes('rc'));
    }
    return versions.filter(v => stableRegex.test(v) && !v.includes('snapshot'));
  };

  const checkVersionChangeImpact = (newType, newVersion, isModpackSwitch) => {
    if (!server?.id) return { severity: 'none', message: 'New server configuration.', requiresRecreation: false };

    // Standard check
    if (serverType !== server?.type && !isModpackSwitch) {
      return {
        severity: 'high',
        requiresRecreation: !!server?.hetzner_id,
        requiresFileDeletion: true,
        message: `Switching from ${server.type} to ${newType} requires a clean install. ALL existing files will be deleted.`,
        backupMessage: 'Download your world files before proceeding!'
      };
    } 
    
    // Modpack check (Always destructive)
    if (isModpackSwitch || activeTab === 'modpacks') {
       return {
        severity: 'high',
        requiresRecreation: !!server?.hetzner_id,
        requiresFileDeletion: true,
        message: `Installing a Modpack requires a complete server reinstall. ALL existing files (world, configs) will be deleted.`,
        backupMessage: 'Download your world files before proceeding!'
       };
    }

    if (newVersion !== server?.version) {
      return {
        severity: 'medium',
        requiresRecreation: !!server?.hetzner_id,
        requiresFileDeletion: false,
        message: `Changing version from ${server.version} to ${newVersion}. Existing files are preserved, but downgrading may corrupt your world.`,
        backupMessage: 'We recommend backing up your world before changing versions.'
      };
    }
    return { severity: 'none' };
  };

  // --- Standard Data Fetching ---
  useEffect(() => {
    if (activeTab === 'modpacks') return;
    
    const fetchVersions = async () => {
      if (!serverType) return;
      setLoadingVersions(true);
      setError(null);
      setAvailableVersions([]); 
      
      try {
        let versions = [];
        switch (serverType) {
          case 'vanilla':
          case 'spigot': 
            const vRes = await fetchWithLocalProxy('https://launchermeta.mojang.com/mc/game/version_manifest.json');
            versions = vRes.versions.map(v => v.id);
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
            const promoData = await fetchWithLocalProxy('https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json');
            const promoVersions = new Set();
            if (promoData && promoData.promos) {
              Object.entries(promoData.promos).forEach(([key, build]) => {
                const match = key.match(/^(.*)-(latest|recommended)$/);
                if (match) promoVersions.add(`${match[1]}-${build}`);
              });
            }
            versions = Array.from(promoVersions);
            break;
          case 'neoforge':
            const neoData = await fetchWithLocalProxy('https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml', true);
            versions = neoData;
            break;
          case 'fabric':
            const fabRes = await fetch('https://meta.fabricmc.net/v2/versions/game');
            versions = (await fabRes.json()).map(v => v.version);
            break;
          case 'quilt':
            const quiltRes = await fetch('https://meta.quiltmc.org/v3/versions/game');
            versions = (await quiltRes.json()).map(v => v.version);
            break;
          // Fallbacks for others can be added
        }

        const sorted = sortVersions(versions);
        setAvailableVersions(sorted);

        if (isInitialMount.current && !version && !isModpack) {
          const stable = filterStableVersions(sorted, serverType);
          setVersion(stable.length > 0 ? stable[0] : sorted[0]);
          isInitialMount.current = false;
        }

      } catch (err) {
        console.error(err);
        setError(`Could not load versions: ${err.message}`);
      } finally {
        setLoadingVersions(false);
      }
    };

    fetchVersions();
  }, [serverType, activeTab]);

  const displayedVersions = useMemo(() => {
    let list = showAllVersions ? availableVersions : filterStableVersions(availableVersions, serverType);
    if (searchQuery) list = list.filter(v => v.toLowerCase().includes(searchQuery.toLowerCase()));
    return list;
  }, [availableVersions, showAllVersions, serverType, searchQuery]);


  // --- Modpack Logic ---

  const searchModpacks = async () => {
    if (!modpackSearch) return;
    setLoadingVersions(true);
    setModpackList([]);
    setSelectedModpack(null);
    setModpackFiles([]);
    setModpackVersionId('');
    setError(null);

    try {
        if (modpackProvider === 'curseforge') {
            // Encode the search term!
            const term = encodeURIComponent(modpackSearch);
            const res = await fetchWithLocalProxy(`https://api.curseforge.com/v1/mods/search?gameId=432&classId=4471&searchFilter=${term}&pageSize=20`);
            setModpackList(res.data || []);
        } else if (modpackProvider === 'modrinth') {
            const term = encodeURIComponent(modpackSearch);
            const res = await fetchWithLocalProxy(`https://api.modrinth.com/v2/search?query=${term}&facets=[["project_type:modpack"]]`);
            setModpackList(res.hits || []);
        } else if (modpackProvider === 'ftb') {
            const term = encodeURIComponent(modpackSearch);
            const res = await fetchWithLocalProxy(`https://api.feed-the-beast.com/v1/modpacks/public/modpack/search/20?term=${term}`);
            if (res && res.packs) setModpackList(res.packs);
            else if (Array.isArray(res)) setModpackList(res);
            else setModpackList([]);
        }
    } catch (err) {
        setError("Failed to search modpacks: " + err.message);
    } finally {
        setLoadingVersions(false);
    }
  };

  const selectModpack = async (pack) => {
    setSelectedModpack(pack);
    setModpackFiles([]);
    setModpackVersionId('');
    setLoadingVersions(true);

    try {
        if (modpackProvider === 'curseforge') {
            const res = await fetchWithLocalProxy(`https://api.curseforge.com/v1/mods/${pack.id}/files?pageSize=50`);
            setModpackFiles(res.data || []);
        } else if (modpackProvider === 'modrinth') {
            const res = await fetchWithLocalProxy(`https://api.modrinth.com/v2/project/${pack.project_id}/version`);
            setModpackFiles(res || []);
        } else if (modpackProvider === 'ftb') {
            const res = await fetchWithLocalProxy(`https://api.feed-the-beast.com/v1/modpacks/public/modpack/${pack.id}`);
            if (res.versions) setModpackFiles(res.versions.reverse());
        }
    } catch (err) {
        setError("Failed to load modpack versions");
    } finally {
        setLoadingVersions(false);
    }
  };

  // --- Save Logic ---

  const handleSaveClick = () => {
    // 1. Standard Save
    if (activeTab === 'types') {
        const impact = checkVersionChangeImpact(serverType, version, false);
        if (impact.severity === 'none' && serverType === server?.type && version === server?.version) return;
        
        setVersionChangeInfo({
            ...impact,
            payload: {
                type: serverType,
                version: version,
                needs_file_deletion: impact.requiresFileDeletion || false,
                needs_recreation: impact.requiresRecreation,
                force_software_install: !impact.requiresFileDeletion
            }
        });
        setShowVersionWarning(true);
        return;
    }

    // 2. Modpack Save
    let payloadType = `modpack-${modpackProvider}`;
    let payloadVersion = '';

    if (modpackProvider === 'custom') {
        // Validation
        if (!customZipUrl || !customZipUrl.startsWith('http')) {
            setError("Please enter a valid HTTP/HTTPS URL for the zip file.");
            return;
        }
        // Format: URL::MC_VERSION (Approximate MC version based on Java selection)
        // This helps the backend choose the right Java Runtime
        let mcVerMeta = '1.20.1';
        if (customJavaVer === '8') mcVerMeta = '1.12.2';
        if (customJavaVer === '11') mcVerMeta = '1.16.5';
        if (customJavaVer === '17') mcVerMeta = '1.18.2';
        payloadVersion = `${customZipUrl}::${mcVerMeta}`;

    } else if (modpackProvider === 'ftb') {
        // Format: PACK_ID|VERSION_ID::MC_VERSION
        const verObj = modpackFiles.find(f => f.id === modpackVersionId);
        if (!verObj) return;
        const mcVer = verObj?.targets?.find(t => t.name === 'minecraft')?.version || '1.20.1';
        payloadVersion = `${selectedModpack.id}|${modpackVersionId}::${mcVer}`;

    } else if (modpackProvider === 'curseforge') {
        // Need Download URL
        const fileObj = modpackFiles.find(f => f.id === modpackVersionId);
        if (!fileObj) return;
        // Use generic 1.20.1 if not found, it only affects Java version choice
        const mcVer = fileObj?.gameVersions?.find(v => v.includes('.')) || '1.20.1';
        // Some CurseForge files don't expose downloadUrl in search, might need extra fetch but usually 'downloadUrl' is there
        const dlUrl = fileObj.downloadUrl;
        if (!dlUrl) {
            setError("This specific file does not have a direct download URL accessible via API.");
            return;
        }
        payloadVersion = `${dlUrl}::${mcVer}`;

    } else if (modpackProvider === 'modrinth') {
        const verObj = modpackFiles.find(v => v.id === modpackVersionId);
        if (!verObj) return;
        const primaryFile = verObj?.files?.find(f => f.primary) || verObj?.files?.[0];
        if (!primaryFile) {
             setError("No file found for this version.");
             return;
        }
        const mcVer = verObj?.game_versions?.[0] || '1.20.1';
        payloadVersion = `${primaryFile.url}::${mcVer}`;
    }

    const impact = checkVersionChangeImpact(payloadType, payloadVersion, true);
    setVersionChangeInfo({
        ...impact,
        payload: {
            type: payloadType,
            version: payloadVersion,
            needs_file_deletion: true, // Always delete files for modpacks
            needs_recreation: true     // Always recreate VPS for clean environment
        }
    });
    setShowVersionWarning(true);
  };

  const confirmChange = async () => {
    setShowVersionWarning(false);
    setSuccess(null);
    setError(null);

    try {
      const { error: err } = await supabase.from('servers').update(versionChangeInfo.payload).eq('id', server.id);
      if (err) throw err;

      if (onSoftwareChange) onSoftwareChange(versionChangeInfo.payload);
      
      setSuccess(versionChangeInfo.payload.needs_recreation 
        ? 'Configuration saved. Server will be completely re-installed on next restart.' 
        : 'Configuration saved successfully.'
      );
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Tab Switcher */}
      <div className="flex space-x-1 bg-gray-100 dark:bg-slate-700 p-1 rounded-xl w-fit">
         <button 
           onClick={() => setActiveTab('types')}
           className={`px-4 py-2 font-bold text-sm rounded-lg transition-all ${activeTab === 'types' ? 'bg-white dark:bg-slate-800 text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'}`}
         >
            Standard Server
         </button>
         <button 
           onClick={() => setActiveTab('modpacks')}
           className={`px-4 py-2 font-bold text-sm rounded-lg transition-all ${activeTab === 'modpacks' ? 'bg-white dark:bg-slate-800 text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'}`}
         >
            Modpacks
         </button>
      </div>

      {activeTab === 'types' && (
        <>
            {/* 1. Software Selection */}
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700 p-6">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
                <ChipIcon className="w-5 h-5 text-gray-500" /> Software Platform
                </h2>
                
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                {softwareOptions.map((opt) => {
                    const isSelected = serverType === opt.id;
                    return (
                    <div
                        key={opt.id}
                        onClick={() => { setServerType(opt.id); setSearchQuery(''); setVersion(''); }}
                        className={`relative cursor-pointer rounded-xl p-3 border-2 transition-all duration-200 flex flex-col items-center text-center gap-2 group
                        ${isSelected 
                            ? `border-indigo-600 bg-indigo-50 shadow-md ring-1 ring-indigo-600` 
                            : 'border-gray-200 dark:border-slate-700 hover:border-gray-300 dark:hover:border-slate-600 hover:bg-gray-50 dark:hover:bg-slate-700/50'
                        }`}
                    >
                        <div className={`p-2 rounded-full ${isSelected ? 'bg-white text-indigo-600' : 'bg-gray-100 dark:bg-slate-700 text-gray-500 group-hover:bg-white dark:group-hover:bg-slate-800'}`}>
                        <opt.icon className="w-5 h-5" />
                        </div>
                        <div>
                        <h3 className={`font-bold text-sm ${isSelected ? 'text-indigo-900' : 'text-gray-900 dark:text-gray-100'}`}>{opt.label}</h3>
                        <span className={`inline-block mt-1 text-[10px] uppercase tracking-wide font-bold px-2 py-0.5 rounded-full ${opt.color}`}>
                            {opt.badge}
                        </span>
                        </div>
                        {isSelected && <div className="absolute top-2 right-2 text-indigo-600"><CheckCircleIcon className="w-4 h-4" /></div>}
                    </div>
                    );
                })}
                </div>
            </div>

            {/* 2. Version Selection */}
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700 p-6">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                    <ArchiveBoxIcon className="w-5 h-5 text-gray-500" /> Game Version
                </h2>
                
                <div className="flex items-center gap-3 w-full sm:w-auto">
                    <div className="relative flex-1 sm:flex-none">
                    <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input 
                        type="text" placeholder="Search version..." 
                        value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-9 pr-3 py-1.5 text-sm border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-gray-100 rounded-lg focus:ring-2 focus:ring-indigo-500 w-full sm:w-48"
                    />
                    </div>
                    <button
                    onClick={() => setShowAllVersions(!showAllVersions)}
                    className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors ${
                        showAllVersions ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-gray-50 text-gray-600 border-gray-200 dark:bg-slate-700 dark:text-gray-300 dark:border-slate-600'
                    }`}
                    >
                    {showAllVersions ? 'Show All' : 'Show Stable'}
                    </button>
                </div>
                </div>

                {loadingVersions ? (
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 animate-pulse">
                    {[...Array(12)].map((_, i) => <div key={i} className="h-10 bg-gray-100 dark:bg-slate-700 rounded-lg"></div>)}
                </div>
                ) : displayedVersions.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2 max-h-[320px] overflow-y-auto p-1 custom-scrollbar">
                    {displayedVersions.map((v) => {
                    const isSelected = version === v;
                    return (
                        <button
                        key={v} onClick={() => setVersion(v)}
                        className={`px-3 py-2 rounded-lg text-xs sm:text-sm font-medium border transition-all truncate text-left
                            ${isSelected ? 'border-indigo-600 bg-indigo-600 text-white shadow-md' : 'border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-700'}
                        `}
                        >
                        {v}
                        </button>
                    );
                    })}
                </div>
                ) : (
                <div className="text-center py-10 text-gray-500 dark:text-gray-400">No versions found</div>
                )}
            </div>
        </>
      )}

      {activeTab === 'modpacks' && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700 p-6 space-y-6">
            
            {/* Provider Selector */}
            <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Choose a Provider</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    {modpackProviders.map(p => (
                        <div key={p.id} onClick={() => { setModpackProvider(p.id); setModpackList([]); setModpackFiles([]); setSelectedModpack(null); }}
                            className={`cursor-pointer border rounded-xl p-3 flex flex-col items-center gap-2 transition-all ${modpackProvider === p.id ? 'border-indigo-600 bg-indigo-50 ring-1 ring-indigo-600' : 'border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700'}`}>
                            <p.icon className="w-8 h-8 text-gray-600 dark:text-gray-300"/>
                            <span className="text-sm font-bold dark:text-white">{p.label}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Custom Zip Input */}
            {modpackProvider === 'custom' ? (
                <div className="space-y-4 bg-gray-50 dark:bg-slate-700/50 p-6 rounded-xl border border-dashed border-gray-300 dark:border-slate-600">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Direct Download URL (Zip)</label>
                        <input type="text" value={customZipUrl} onChange={e => setCustomZipUrl(e.target.value)} placeholder="https://example.com/modpack.zip" className="w-full p-2.5 border rounded-lg dark:bg-slate-700 dark:text-white dark:border-slate-600"/>
                        <p className="text-xs text-gray-500 mt-1">Must be a direct link to a zip file containing the server files.</p>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Target Java Version</label>
                        <select value={customJavaVer} onChange={e => setCustomJavaVer(e.target.value)} className="w-full p-2.5 border rounded-lg dark:bg-slate-700 dark:text-white dark:border-slate-600">
                            <option value="8">Java 8 (Minecraft 1.12.2 and older)</option>
                            <option value="11">Java 11 (Minecraft 1.13 - 1.16.5)</option>
                            <option value="17">Java 17 (Minecraft 1.17 - 1.20.4)</option>
                            <option value="21">Java 21 (Minecraft 1.20.5+)</option>
                        </select>
                        <p className="text-xs text-gray-500 mt-1">This determines which Java Runtime Environment will be installed on the server.</p>
                    </div>
                </div>
            ) : (
                <div className="space-y-4">
                    {/* Search Bar */}
                    <div className="flex gap-2">
                        <input 
                            type="text" 
                            placeholder={`Search ${modpackProvider} modpacks...`}
                            value={modpackSearch}
                            onChange={(e) => setModpackSearch(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && searchModpacks()}
                            className="flex-1 p-2.5 border rounded-lg dark:bg-slate-700 dark:text-white dark:border-slate-600"
                        />
                        <button onClick={searchModpacks} className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium">Search</button>
                    </div>

                    {/* Results List */}
                    {modpackList.length > 0 && !selectedModpack && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[500px] overflow-y-auto custom-scrollbar">
                            {modpackList.map(pack => (
                                <div key={pack.id || pack.project_id} onClick={() => selectModpack(pack)}
                                     className="flex items-start gap-4 p-4 border rounded-xl cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-700 dark:border-slate-600 transition-colors">
                                    {pack.icon_url || pack.logo?.url || pack.art?.square ? (
                                        <img src={pack.icon_url || pack.logo?.url || pack.art?.square} className="w-14 h-14 rounded-lg object-cover bg-gray-200" />
                                    ) : <div className="w-14 h-14 bg-indigo-100 rounded-lg flex items-center justify-center text-indigo-500 font-bold text-xl">{pack.name?.[0] || '?'}</div>}
                                    <div className="flex-1 overflow-hidden">
                                        <h4 className="font-bold text-gray-900 dark:text-white truncate">{pack.name || pack.title}</h4>
                                        <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-2">{pack.summary || pack.description}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* File/Version Selection */}
                    {selectedModpack && (
                        <div className="space-y-4 animate-fadeIn">
                            <div className="flex items-center justify-between bg-gray-50 dark:bg-slate-700/50 p-4 rounded-xl border border-gray-200 dark:border-slate-700">
                                <div className="flex items-center gap-3">
                                    {selectedModpack.icon_url || selectedModpack.logo?.url ? (
                                        <img src={selectedModpack.icon_url || selectedModpack.logo?.url} className="w-10 h-10 rounded-md" />
                                    ) : null}
                                    <div>
                                        <span className="block font-bold dark:text-white">{selectedModpack.name || selectedModpack.title}</span>
                                        <span className="text-xs text-gray-500">Select a version to install</span>
                                    </div>
                                </div>
                                <button onClick={() => { setSelectedModpack(null); setModpackFiles([]); }} className="text-sm text-indigo-600 hover:text-indigo-800 font-medium">Change Pack</button>
                            </div>

                            {loadingVersions ? (
                                <div className="space-y-3">
                                    {[1,2,3].map(i => <div key={i} className="h-12 bg-gray-100 dark:bg-slate-700 rounded-lg animate-pulse"/>)}
                                </div>
                            ) : (
                                <div className="space-y-2 max-h-[400px] overflow-y-auto custom-scrollbar">
                                    {modpackFiles.map(file => {
                                        const fileId = file.id; 
                                        const fileName = file.displayName || file.name || (file.version_number ? `Version ${file.version_number}` : 'Unknown');
                                        const isServer = (fileName.toLowerCase().includes('server') || file.name?.toLowerCase().includes('server'));
                                        
                                        return (
                                            <div key={fileId} onClick={() => setModpackVersionId(fileId)}
                                                 className={`p-3 border rounded-lg cursor-pointer flex justify-between items-center transition-colors ${modpackVersionId === fileId ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-900/20' : 'dark:border-slate-600 hover:bg-gray-50 dark:hover:bg-slate-700'}`}>
                                                <div>
                                                    <p className={`text-sm font-medium ${modpackVersionId === fileId ? 'text-indigo-700 dark:text-indigo-300' : 'text-gray-900 dark:text-white'}`}>{fileName}</p>
                                                    {isServer && <span className="inline-block mt-1 text-[10px] uppercase font-bold bg-green-100 text-green-800 px-2 py-0.5 rounded-full">Server Pack</span>}
                                                </div>
                                                {modpackVersionId === fileId && <CheckCircleIcon className="w-6 h-6 text-indigo-600"/>}
                                            </div>
                                        )
                                    })}
                                    {modpackFiles.length === 0 && <p className="text-center text-gray-500 py-4">No files found for this modpack.</p>}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
      )}

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
          disabled={activeTab === 'types' ? (!version || (serverType === server?.type && version === server?.version)) : (!modpackVersionId && !customZipUrl)}
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2.5 rounded-xl font-semibold shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {activeTab === 'modpacks' ? 'Install Modpack' : 'Save Changes'}
        </button>
      </div>

      {/* Impact Warning Modal */}
      <AnimatePresence>
        {showVersionWarning && versionChangeInfo && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl max-w-lg w-full overflow-hidden"
            >
              <div className={`p-6 border-b ${versionChangeInfo.severity === 'high' ? 'bg-red-50 border-red-100 dark:bg-red-900/20 dark:border-red-800' : 'bg-yellow-50 border-yellow-100 dark:bg-yellow-900/20 dark:border-yellow-800'}`}>
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-full ${versionChangeInfo.severity === 'high' ? 'bg-red-100 text-red-600' : 'bg-yellow-100 text-yellow-600'}`}>
                    <ExclamationTriangleIcon className="w-6 h-6" />
                  </div>
                  <h3 className={`text-lg font-bold ${versionChangeInfo.severity === 'high' ? 'text-red-900 dark:text-red-300' : 'text-yellow-900 dark:text-yellow-300'}`}>
                    {versionChangeInfo.severity === 'high' ? 'High Impact Change' : 'Confirm Change'}
                  </h3>
                </div>
              </div>
              
              <div className="p-6 space-y-4">
                <p className="text-gray-700 dark:text-gray-200 leading-relaxed">{versionChangeInfo.message}</p>
                {versionChangeInfo.backupMessage && (
                  <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded-lg p-4 text-sm text-blue-800 dark:text-blue-300 flex items-start gap-3">
                    <ArchiveBoxIcon className="w-5 h-5 shrink-0 mt-0.5" />
                    <span>{versionChangeInfo.backupMessage}</span>
                  </div>
                )}
              </div>

              <div className="bg-gray-50 dark:bg-slate-700 px-6 py-4 flex justify-end gap-3 border-t border-gray-200 dark:border-slate-700">
                <button
                  onClick={() => { setShowVersionWarning(false); setVersionChangeInfo(null); }}
                  className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-600 font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmChange}
                  className={`px-4 py-2 text-white rounded-lg font-medium shadow-sm ${versionChangeInfo.severity === 'high' ? 'bg-red-600 hover:bg-red-700' : 'bg-indigo-600 hover:bg-indigo-700'}`}
                >
                  Confirm & Install
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}