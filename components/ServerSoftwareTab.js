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
  PuzzlePieceIcon,
  ArrowDownTrayIcon,
  ArrowRightCircleIcon,
  ServerIcon
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

// Helper to sanitize modpack name for storage (remove :: to prevent parsing errors)
const sanitizePackName = (name) => name ? name.replace(/::/g, ' ').trim() : 'Modpack';

export default function ServerSoftwareTab({ server, onSoftwareChange }) {
  // --- State ---
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
  const [isInstalling, setIsInstalling] = useState(false);
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
      if (response.status === 403) {
          throw new Error("Access Denied (403). Check server logs and CURSEFORGE_API_KEY.");
      }
      throw new Error(`Failed to fetch: ${response.status} ${errText}`);
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

    if (serverType !== server?.type && !isModpackSwitch) {
      return {
        severity: 'high',
        requiresRecreation: !!server?.hetzner_id,
        requiresFileDeletion: true,
        message: `Switching from ${server.type} to ${newType} requires a clean install. ALL existing files will be deleted.`,
        backupMessage: 'Download your world files before proceeding!'
      };
    } 
    
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

  useEffect(() => {
    if (activeTab === 'modpacks' && modpackProvider !== 'custom') {
      searchModpacks();
    }
  }, [activeTab, modpackProvider]);

  const searchModpacks = async () => {
    setLoadingVersions(true);
    setModpackList([]);
    setSelectedModpack(null);
    setModpackFiles([]);
    setModpackVersionId('');
    setError(null);

    try {
        if (modpackProvider === 'curseforge') {
            const term = modpackSearch ? encodeURIComponent(modpackSearch) : '';
            const queryUrl = modpackSearch 
                ? `https://api.curseforge.com/v1/mods/search?gameId=432&classId=4471&searchFilter=${term}&pageSize=20&sortField=2&sortOrder=desc`
                : `https://api.curseforge.com/v1/mods/search?gameId=432&classId=4471&pageSize=20&sortField=2&sortOrder=desc`;
            
            const res = await fetchWithLocalProxy(queryUrl);
            setModpackList(res.data || []);
        } else if (modpackProvider === 'modrinth') {
            const term = modpackSearch ? encodeURIComponent(modpackSearch) : '';
            const queryUrl = term 
               ? `https://api.modrinth.com/v2/search?query=${term}&facets=[["project_type:modpack"]]`
               : `https://api.modrinth.com/v2/search?facets=[["project_type:modpack"]]`; 
            const res = await fetchWithLocalProxy(queryUrl);
            setModpackList(res.hits || []);
        } else if (modpackProvider === 'ftb') {
            const term = modpackSearch ? encodeURIComponent(modpackSearch) : '';
            const queryUrl = term
               ? `https://api.feed-the-beast.com/v1/modpacks/public/modpack/search/20?term=${term}`
               : `https://api.feed-the-beast.com/v1/modpacks/public/modpack/popular/20`;
            
            const res = await fetchWithLocalProxy(queryUrl);
            if (res && res.packs) setModpackList(res.packs);
            else if (Array.isArray(res)) setModpackList(res);
            else setModpackList([]);
        }
    } catch (err) {
        setError("Failed to fetch modpacks: " + err.message);
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
        let files = [];

        if (modpackProvider === 'curseforge') {
            const res = await fetchWithLocalProxy(`https://api.curseforge.com/v1/mods/${pack.id}/files?pageSize=50`);
            
            if (res && res.data) {
                files = res.data.map(f => {
                    const mcVer = f.gameVersions?.find(v => v.match(/^\d+\.\d+(\.\d+)?$/)) || 'Unknown';
                    const loaders = ['Forge', 'Fabric', 'NeoForge', 'Quilt'];
                    const loader = f.gameVersions?.find(v => loaders.includes(v)) || 'Forge';

                    return {
                        id: f.id,
                        name: f.displayName,
                        mcVersion: mcVer,
                        loader: loader,
                        downloadUrl: f.downloadUrl,
                        releaseType: f.releaseType, // 1=Release, 2=Beta, 3=Alpha
                        fileDate: f.fileDate,
                        serverPackFileId: f.serverPackFileId || null
                    };
                });
            }
        } else if (modpackProvider === 'modrinth') {
            const res = await fetchWithLocalProxy(`https://api.modrinth.com/v2/project/${pack.project_id}/version`);
            if (Array.isArray(res)) {
                files = res.map(v => ({
                    id: v.id,
                    name: v.name,
                    mcVersion: v.game_versions?.[0] || 'Unknown',
                    loader: v.loaders?.[0] ? v.loaders[0].charAt(0).toUpperCase() + v.loaders[0].slice(1) : 'Unknown',
                    downloadUrl: v.files?.find(f => f.primary)?.url || v.files?.[0]?.url,
                    releaseType: v.version_type === 'release' ? 1 : v.version_type === 'beta' ? 2 : 3,
                    fileDate: v.date_published,
                    serverPackFileId: null 
                }));
            }
        } else if (modpackProvider === 'ftb') {
            const res = await fetchWithLocalProxy(`https://api.feed-the-beast.com/v1/modpacks/public/modpack/${pack.id}`);
            if (res.versions) {
                files = res.versions.reverse().map(v => {
                    const mcTarget = v.targets?.find(t => t.name === 'minecraft');
                    const loaderTarget = v.targets?.find(t => t.name !== 'minecraft' && t.name !== 'java');
                    return {
                        id: v.id,
                        name: v.name,
                        mcVersion: mcTarget?.version || 'Unknown',
                        loader: loaderTarget ? (loaderTarget.name.charAt(0).toUpperCase() + loaderTarget.name.slice(1)) : 'Forge',
                        downloadUrl: null,
                        releaseType: v.type === 'Release' ? 1 : 2,
                        fileDate: v.updated
                    };
                });
            }
        }
        setModpackFiles(files);
    } catch (err) {
        setError("Failed to load modpack versions");
    } finally {
        setLoadingVersions(false);
    }
  };

  const getReleaseBadge = (type) => {
    switch (type) {
        case 1: return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-green-100 text-green-700 border border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-600 uppercase tracking-wide">Release</span>;
        case 2: return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-700 border border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-600 uppercase tracking-wide">Beta</span>;
        case 3: return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-orange-100 text-orange-700 border border-orange-200 dark:bg-orange-900/20 dark:text-orange-400 dark:border-orange-600 uppercase tracking-wide">Alpha</span>;
        default: return null;
    }
  };

  // --- Save Logic ---

  const handleSaveClick = async () => {
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

    let payloadType = `modpack-${modpackProvider}`;
    let payloadVersion = '';

    if (modpackProvider === 'custom') {
        if (!customZipUrl || !customZipUrl.startsWith('http')) {
            setError("Please enter a valid HTTP/HTTPS URL for the zip file.");
            return;
        }
        let mcVerMeta = '1.20.1';
        if (customJavaVer === '8') mcVerMeta = '1.12.2';
        if (customJavaVer === '11') mcVerMeta = '1.16.5';
        if (customJavaVer === '17') mcVerMeta = '1.18.2';
        if (customJavaVer === '21') mcVerMeta = '1.20.5';
        
        // Payload: Url::Version::Name
        payloadVersion = `${customZipUrl}::${mcVerMeta}::Custom Zip`;

    } else {
        const verObj = modpackFiles.find(f => f.id === modpackVersionId);
        if (!verObj) return;

        const mcVer = verObj.mcVersion !== 'Unknown' ? verObj.mcVersion : '1.20.1';
        // Get name and sanitize
        const packName = sanitizePackName(selectedModpack.name || selectedModpack.title);

        if (modpackProvider === 'ftb') {
            payloadVersion = `${selectedModpack.id}|${modpackVersionId}::${mcVer}::${packName}`;

        } else if (modpackProvider === 'curseforge') {
            
            // --- AUTOMATIC SERVER PACK RESOLUTION ---
            if (verObj.serverPackFileId) {
                try {
                    setIsInstalling(true);
                    setError(null);
                    // Fetch the Server Pack details
                    const serverPackRes = await fetchWithLocalProxy(`https://api.curseforge.com/v1/mods/${selectedModpack.id}/files/${verObj.serverPackFileId}`);
                    
                    // FIX: UNWRAP 'data' if present
                    const packData = serverPackRes.data || serverPackRes;

                    if (packData && packData.downloadUrl) {
                        console.log("Resolved Server Pack URL:", packData.downloadUrl);
                        payloadVersion = `${packData.downloadUrl}::${mcVer}::${packName}`;
                    } else {
                        throw new Error("Server pack file found, but no download URL available in response.");
                    }
                } catch (e) {
                    console.error("Server pack resolution failed:", e);
                    setError(`Failed to resolve Server Pack: ${e.message}.`);
                    setIsInstalling(false);
                    return; // Stop here, don't fallback silently to broken client pack
                } finally {
                    setIsInstalling(false);
                }
            } else {
                if (!verObj.downloadUrl) {
                    setError("This file does not have a download URL.");
                    return;
                }
                payloadVersion = `${verObj.downloadUrl}::${mcVer}::${packName}`;
            }

        } else if (modpackProvider === 'modrinth') {
            if (!verObj.downloadUrl) {
                 setError("No file found for this version.");
                 return;
            }
            payloadVersion = `${verObj.downloadUrl}::${mcVer}::${packName}`;
        }
    }

    if (!payloadVersion) return;

    const impact = checkVersionChangeImpact(payloadType, payloadVersion, true);
    setVersionChangeInfo({
        ...impact,
        payload: {
            type: payloadType,
            version: payloadVersion,
            needs_file_deletion: true,
            needs_recreation: true
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
            {/* Standard Software Grid (Unchanged) */}
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

            {/* Standard Version Selector */}
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

                    {/* Modpack Results Grid */}
                    {modpackList.length > 0 && !selectedModpack && (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-h-[500px] overflow-y-auto custom-scrollbar p-1">
                            {modpackList.map(pack => (
                                <div key={pack.id || pack.project_id} 
                                     className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-4 hover:border-indigo-300 hover:shadow-md transition-all flex flex-col h-full">
                                    <div className="flex gap-4 mb-3">
                                        {pack.icon_url || pack.logo?.url || pack.art?.square ? (
                                            <img src={pack.icon_url || pack.logo?.url || pack.art?.square} className="w-12 h-12 rounded-lg bg-gray-100 dark:bg-slate-700 object-cover" />
                                        ) : (
                                            <div className="w-12 h-12 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 flex items-center justify-center text-indigo-600 font-bold text-xl">
                                                {pack.name?.[0] || '?'}
                                            </div>
                                        )}
                                        <div className="flex-1 min-w-0">
                                            <h4 className="font-bold text-gray-900 dark:text-gray-100 truncate" title={pack.name || pack.title}>{pack.name || pack.title}</h4>
                                            <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1 mt-1">
                                                <ArrowDownTrayIcon className="w-3 h-3" />
                                                {(pack.downloads || pack.downloadCount || 0).toLocaleString()}
                                            </p>
                                        </div>
                                    </div>
                                    <p className="text-xs text-gray-600 dark:text-gray-300 line-clamp-2 mb-4 flex-1">
                                        {pack.summary || pack.description || "No description provided."}
                                    </p>
                                    <button 
                                        onClick={() => selectModpack(pack)} 
                                        className="w-full py-2 bg-gray-50 dark:bg-slate-700 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 text-indigo-700 dark:text-indigo-400 font-medium rounded-lg text-sm border border-gray-200 dark:border-slate-600 hover:border-indigo-200 dark:hover:border-indigo-600 transition-colors"
                                    >
                                        Select Pack
                                    </button>
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
                                        return (
                                            <div key={file.id} onClick={() => setModpackVersionId(file.id)}
                                                 className={`p-3 border rounded-lg cursor-pointer flex justify-between items-center transition-all ${modpackVersionId === file.id ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-900/20' : 'dark:border-slate-600 hover:bg-gray-50 dark:hover:bg-slate-700'}`}>
                                                <div className="flex items-center gap-3 overflow-hidden">
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2">
                                                            <p className={`text-sm font-medium truncate ${modpackVersionId === file.id ? 'text-indigo-700 dark:text-indigo-300' : 'text-gray-900 dark:text-white'}`}>{file.name}</p>
                                                            {getReleaseBadge(file.releaseType)}
                                                        </div>
                                                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                                            Released: {new Date(file.fileDate).toLocaleDateString()}
                                                        </p>
                                                    </div>
                                                </div>
                                                
                                                {/* RIGHT SIDE: Minecraft Version, Loader, Server Badge */}
                                                <div className="flex items-center gap-3 text-right">
                                                    {file.serverPackFileId && (
                                                        <span className="text-[10px] font-bold bg-green-100 text-green-800 px-2 py-0.5 rounded-full border border-green-200 flex items-center gap-1">
                                                            <ServerIcon className="w-3 h-3"/> Server Pack
                                                        </span>
                                                    )}
                                                    <div className="flex flex-col items-end">
                                                        <span className="text-xs font-bold text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-slate-600 px-2 py-0.5 rounded">
                                                            {file.mcVersion}
                                                        </span>
                                                        <span className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5 uppercase tracking-wide">
                                                            {file.loader}
                                                        </span>
                                                    </div>
                                                    {modpackVersionId === file.id ? (
                                                        <CheckCircleIcon className="w-6 h-6 text-indigo-600"/>
                                                    ) : (
                                                        <ArrowRightCircleIcon className="w-5 h-5 text-gray-300 dark:text-gray-600" />
                                                    )}
                                                </div>
                                            </div>
                                        )
                                    })}
                                    {modpackFiles.length === 0 && <p className="text-center text-gray-500 py-4">No server files found for this modpack.</p>}
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
          disabled={activeTab === 'types' ? (!version || (serverType === server?.type && version === server?.version)) : (!modpackVersionId && !customZipUrl) || isInstalling}
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2.5 rounded-xl font-semibold shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {isInstalling ? (
            <>
              <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Resolving Server Files...
            </>
          ) : (
            activeTab === 'modpacks' ? 'Install Modpack' : 'Save Changes'
          )}
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