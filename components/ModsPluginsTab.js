import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { 
  ArrowDownTrayIcon, 
  MagnifyingGlassIcon, 
  ExclamationCircleIcon, 
  CheckCircleIcon,
  XCircleIcon,
  CpuChipIcon,
  PuzzlePieceIcon,
  CalendarDaysIcon,
  CubeIcon,
  ArrowTopRightOnSquareIcon,
  ArrowRightCircleIcon
} from '@heroicons/react/24/outline';

export default function ModsPluginsTab({ server }) {
  // --- Constants ---
  const HYBRID_TYPES = ['arclight', 'mohist', 'magma'];
  const PLUGIN_TYPES = ['paper', 'spigot', 'purpur', 'folia', 'velocity', 'waterfall', 'bungeecord', 'bukkit'];
  
  // Determine default tab based on server type
  const isHybrid = HYBRID_TYPES.includes(server?.type);
  const [activeCategory, setActiveCategory] = useState(() => {
    if (PLUGIN_TYPES.includes(server?.type)) return 'plugins';
    return 'mods'; 
  });

  const [catalog, setCatalog] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [loadingInstall, setLoadingInstall] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [hasMoreResults, setHasMoreResults] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  
  // Selection & Modal State
  const [selectedItem, setSelectedItem] = useState(null);
  const [selectedVersions, setSelectedVersions] = useState([]);
  const [modalTab, setModalTab] = useState('files'); // 'files' or 'dependencies'
  const [itemDependencies, setItemDependencies] = useState([]); 
  const [loadingDependencies, setLoadingDependencies] = useState(false);

  // Helper to use the local proxy
  const fetchWithProxy = async (url) => {
    try {
      const res = await fetch(`/api/proxy?url=${encodeURIComponent(url)}`);
      if (!res.ok) throw new Error(`Proxy error: ${res.status}`);
      return await res.json();
    } catch (e) {
      console.warn('Proxy failed, trying direct fetch:', e);
      // Fallback (though mostly blocked by CORS/API keys on client side)
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Direct fetch failed: ${res.status}`);
      return await res.json();
    }
  };

  // Helper to get CurseForge Loader ID (For Mods Only)
  const getCurseForgeLoaderId = () => {
    const type = server?.type || 'vanilla';
    const versionStr = server?.version || '';

    // CurseForge Loader IDs:
    // 1 = Forge
    // 4 = Fabric
    // 5 = Quilt
    // 6 = NeoForge

    // --- ARCLIGHT DYNAMIC DETECTION ---
    if (type === 'arclight') {
        if (versionStr.includes('::neoforge::')) return 6; // NeoForge
        if (versionStr.includes('::fabric::')) return 4;   // Fabric
        return 1; // Default to Forge (Legacy Arclight)
    }

    // Mohist/Magma are historically Forge-based
    if (['mohist', 'magma'].includes(type)) return 1;

    const map = {
      'forge': 1,
      'fabric': 4,
      'quilt': 5,
      'neoforge': 6
    };
    
    return map[type] || 1; 
  };

  // Helper to format file size
  const formatFileSize = (bytes) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Helper to get Release Type Badge
  const getReleaseBadge = (type) => {
    switch (type) {
      case 1: return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-green-100 text-green-700 border border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-600 uppercase tracking-wide">Release</span>;
      case 2: return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-700 border border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-600 uppercase tracking-wide">Beta</span>;
      case 3: return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-orange-100 text-orange-700 border border-orange-200 dark:bg-orange-900/20 dark:text-orange-400 dark:border-orange-600 uppercase tracking-wide">Alpha</span>;
      default: return null;
    }
  };

  const fetchCatalog = async (page = 1, isNewSearch = false) => {
    if (!server?.type || !server?.version) return;

    // Handle composite versions (e.g. 1.21.1::neoforge::tag)
    let mcVersion = server.version;
    if (mcVersion.includes('::')) {
        mcVersion = mcVersion.split('::')[0];
    } else {
        mcVersion = mcVersion.split('-')[0];
    }

    setLoadingCatalog(true);
    setError(null);

    try {
      const pageSize = 20;
      const index = (page - 1) * pageSize;
      const gameId = 432; // Minecraft

      // --- Determine Class ID & Loader ---
      let classId;
      let loaderParam = '';

      if (activeCategory === 'plugins') {
        classId = 5; // CurseForge Bukkit Plugins
        // Plugins usually don't need a loaderType, or we can use 0 (Any)
      } else {
        classId = 6; // CurseForge Mods
        const loaderId = getCurseForgeLoaderId();
        loaderParam = `&modLoaderType=${loaderId}`;
      }

      // Build Query
      // Note: We use the same 'gameVersion' filter for plugins so users see compatible plugins
      const apiUrl = `https://api.curseforge.com/v1/mods/search?gameId=${gameId}&classId=${classId}&searchFilter=${encodeURIComponent(searchQuery)}&gameVersion=${mcVersion}${loaderParam}&sortField=2&sortOrder=desc&pageSize=${pageSize}&index=${index}`;

      const cfData = await fetchWithProxy(apiUrl);
      let items = [];
      let totalItems = 0;

      if (cfData && cfData.data) {
        totalItems = cfData.pagination.totalCount; 
        if (totalItems > 10000) totalItems = 10000;

        items = cfData.data.map(item => ({
          id: item.id,
          name: item.name,
          description: item.summary,
          version: 'Latest', 
          downloads: item.downloadCount,
          source: 'curseforge', 
          type: activeCategory === 'plugins' ? 'plugin' : 'mod', // Tag for install logic
          icon: item.logo?.thumbnailUrl || null,
          websiteUrl: item.links?.websiteUrl || `https://www.curseforge.com/minecraft/${activeCategory === 'plugins' ? 'bukkit-plugins' : 'mc-mods'}/${item.slug}`
        }));
      }

      const calculatedTotalPages = Math.ceil(totalItems / pageSize);
      setTotalPages(calculatedTotalPages);
      setHasMoreResults(items.length === pageSize); 

      if (isNewSearch || page === 1) {
        setCatalog(items);
      } else {
        setCatalog(prev => [...prev, ...items]);
      }
    } catch (error) {
      console.error('Error fetching catalog:', error);
      setError(`Failed to load resources: ${error.message}`);
    } finally {
      setLoadingCatalog(false);
      setIsSearching(false);
    }
  };

  useEffect(() => {
    fetchCatalog(1, true);
    setCurrentPage(1);
  }, [server?.type, server?.version, activeCategory]);

  const handleSearch = (e) => {
    if (e) e.preventDefault();
    setIsSearching(true);
    setCurrentPage(1);
    fetchCatalog(1, true);
  };

  const handleLoadMore = () => {
    const nextPage = currentPage + 1;
    setCurrentPage(nextPage);
    fetchCatalog(nextPage);
  };

  const fetchVersions = async (item) => {
    setSelectedItem(item);
    setSelectedVersions([]);
    setModalTab('files');
    setItemDependencies([]);
    
    // Handle composite versions
    let mcVersion = server.version;
    if (mcVersion.includes('::')) {
        mcVersion = mcVersion.split('::')[0];
    } else {
        mcVersion = mcVersion.split('-')[0];
    }

    try {
      let versions = [];
      let depIds = new Set();
      
      // CurseForge logic for both Mods and Plugins
      let apiUrl = `https://api.curseforge.com/v1/mods/${item.id}/files?gameVersion=${mcVersion}&pageSize=20`;
      
      // Only append loader type if it's a mod (not a plugin)
      if (item.type === 'mod') {
         const loaderId = getCurseForgeLoaderId();
         apiUrl += `&modLoaderType=${loaderId}`;
      }

      const res = await fetchWithProxy(apiUrl);
      
      if (res && res.data && Array.isArray(res.data)) {
          versions = res.data.map(v => {
          if (v.dependencies) {
            v.dependencies.forEach(d => {
              if (d.relationType === 3) depIds.add(d.modId);
            });
          }

          return {
            id: v.id,
            name: v.displayName,
            downloadUrl: v.downloadUrl,
            filename: v.fileName,
            releaseType: v.releaseType,
            fileDate: v.fileDate,
            size: v.fileLength,
            dependencies: v.dependencies || [] 
          };
        }).filter(v => v.downloadUrl);
      }

      // --- Fetch Dependency Details ---
      if (depIds.size > 0) {
        setLoadingDependencies(true);
        const uniqueDepIds = Array.from(depIds);
        const limitedIds = uniqueDepIds.slice(0, 10);
        
        Promise.all(limitedIds.map(id => 
          fetchWithProxy(`https://api.curseforge.com/v1/mods/${id}`)
            .catch(e => null) 
        )).then(results => {
          const deps = results
            .filter(r => r && r.data)
            .map(r => ({
              id: r.data.id,
              name: r.data.name,
              icon: r.data.logo?.thumbnailUrl,
              url: r.data.links?.websiteUrl,
              description: r.data.summary,
              downloads: r.data.downloadCount,
              slug: r.data.slug
            }));
          setItemDependencies(deps);
          setLoadingDependencies(false);
        });
      }
      
      setSelectedVersions(versions);
    } catch (err) {
      setError(`Failed to load versions: ${err.message}`);
    }
  };

  const handleInstall = async (version) => {
    setLoadingInstall(true);
    setError(null);
    setSuccess(null);
    try {
      // Determine folder based on the item type tag we set during fetchCatalog
      const folder = selectedItem.type === 'plugin' ? 'plugins' : 'mods';
      
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      if (!token) {
          throw new Error("You must be logged in to install content.");
      }

      const res = await fetch('/api/servers/install-mod', {
        method: 'POST',
        headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify({
          serverId: server.id,
          downloadUrl: version.downloadUrl,
          filename: version.filename,
          folder
        })
      });
      
      if (!res.ok) throw new Error((await res.json()).error || 'Installation failed');
      
      setSuccess(`Installed ${selectedItem.name} (${version.name}) to /${folder}! Restart server to apply.`);
    } catch (error) {
      setError(error.message);
    } finally {
      setLoadingInstall(false);
    }
  };

  const handleViewDependency = (dep) => {
    const item = {
      id: dep.id,
      name: dep.name,
      description: dep.description,
      version: 'Latest', 
      downloads: dep.downloads,
      source: 'curseforge',
      type: 'mod', // Dependencies are usually mods/libraries
      icon: dep.icon,
      websiteUrl: dep.url
    };
    
    setSelectedItem(item);
    setModalTab('files'); 
    fetchVersions(item); 
  };

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 overflow-hidden flex flex-col h-[600px]">
      
      {/* Header / Search */}
      <div className="p-4 border-b border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-700 flex flex-col md:flex-row gap-3">
        <div className="flex bg-gray-200 dark:bg-slate-600 rounded-lg p-1 shrink-0">
          <button
            onClick={() => setActiveCategory('mods')}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
              activeCategory === 'mods' 
                ? 'bg-white dark:bg-slate-800 text-indigo-600 shadow-sm' 
                : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100'
            }`}
          >
            Mods
          </button>
          <button
            onClick={() => setActiveCategory('plugins')}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
              activeCategory === 'plugins' 
                ? 'bg-white dark:bg-slate-800 text-indigo-600 shadow-sm' 
                : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100'
            }`}
          >
            Plugins
          </button>
        </div>

        <div className="relative flex-1">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 dark:text-gray-500" />
          <input
            type="text"
            placeholder={activeCategory === 'plugins' ? "Search Bukkit plugins..." : "Search Mods..."}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch(e)}
            className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-300 dark:border-slate-600 dark:bg-slate-800 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
          />
        </div>
        <button
          onClick={handleSearch}
          disabled={loadingCatalog}
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded-lg font-medium shadow-sm transition-colors disabled:opacity-50"
        >
          {isSearching ? 'Searching...' : 'Search'}
        </button>
      </div>

      {/* Messages */}
      <div className="absolute top-20 right-6 z-20 w-96 space-y-2 pointer-events-none">
        {success && (
          <div className="bg-green-50 text-green-700 p-4 rounded-xl shadow-lg border border-green-100 flex items-start gap-3 pointer-events-auto animate-in fade-in slide-in-from-right-4">
            <CheckCircleIcon className="w-5 h-5 mt-0.5 shrink-0" />
            <div className="flex-1 text-sm">{success}</div>
            <button onClick={() => setSuccess(null)} className="hover:text-green-800">✕</button>
          </div>
        )}
        {error && (
          <div className="bg-red-50 text-red-700 p-4 rounded-xl shadow-lg border border-red-100 flex items-start gap-3 pointer-events-auto animate-in fade-in slide-in-from-right-4">
            <ExclamationCircleIcon className="w-5 h-5 mt-0.5 shrink-0" />
            <div className="flex-1 text-sm">{error}</div>
            <button onClick={() => setError(null)} className="hover:text-red-800">✕</button>
          </div>
        )}
      </div>

      {/* Results Grid */}
      <div className="flex-1 overflow-y-auto p-4 bg-gray-50/50 dark:bg-slate-900/50">
        {loadingCatalog && currentPage === 1 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500 dark:text-gray-400">
            <div className="animate-spin rounded-full h-8 w-8 border-4 border-indigo-600 border-t-transparent mb-3" />
            <p>Fetching resources...</p>
          </div>
        ) : catalog.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400">
            {activeCategory === 'mods' ? <CpuChipIcon className="w-16 h-16 mb-4 opacity-20" /> : <PuzzlePieceIcon className="w-16 h-16 mb-4 opacity-20" />}
            <p className="text-lg font-medium text-gray-500 dark:text-gray-400">No resources found</p>
            <p className="text-sm dark:text-gray-500">Try a different search term or check compatibility</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {catalog.map((item) => (
              <div key={`${item.source}-${item.id}`} 
                className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-4 hover:border-indigo-300 hover:shadow-md transition-all flex flex-col">
                <div className="flex gap-4 mb-3">
                  {item.icon ? (
                    <img src={item.icon} alt="" className="w-12 h-12 rounded-lg bg-gray-100 dark:bg-slate-700 object-cover" />
                  ) : (
                    <div className="w-12 h-12 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 flex items-center justify-center text-indigo-600 font-bold text-xl">
                      {item.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-gray-900 dark:text-gray-100 truncate" title={item.name}>{item.name}</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1 mt-1">
                      <ArrowDownTrayIcon className="w-3 h-3" />
                      {item.downloads.toLocaleString()}
                    </p>
                  </div>
                </div>
                
                <p className="text-xs text-gray-600 dark:text-gray-300 line-clamp-3 mb-4 flex-1 leading-relaxed">
                  {item.description?.replace(/<\/?[^>]+(>|$)/g, "") || "No description provided."}
                </p>

                <button
                  onClick={() => fetchVersions(item)}
                  className="w-full py-2 bg-gray-50 dark:bg-slate-700 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 text-indigo-700 dark:text-indigo-400 font-medium rounded-lg text-sm border border-gray-200 dark:border-slate-600 hover:border-indigo-200 dark:hover:border-indigo-600 transition-colors"
                >
                  Select Version
                </button>
              </div>
            ))}
          </div>
        )}

        {catalog.length > 0 && hasMoreResults && (
          <div className="mt-6 text-center">
            <button
              onClick={handleLoadMore}
              disabled={loadingCatalog}
              className="px-6 py-2 bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-700 text-gray-700 dark:text-gray-300 rounded-full text-sm font-medium hover:bg-gray-50 dark:hover:bg-slate-700/50 shadow-sm transition-all disabled:opacity-50"
            >
              {loadingCatalog ? 'Loading...' : 'Load More'}
            </button>
          </div>
        )}
      </div>

      {/* Version Selector Modal */}
      {selectedItem && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex justify-center items-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-xl overflow-hidden flex flex-col max-h-[85vh]">
            
            <div className="p-5 border-b border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-700">
              <div className="flex justify-between items-start mb-3">
                <div className="flex-1 pr-4">
                  <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">{selectedItem.name}</h3>
                  <p 
                    onClick={() => selectedItem.websiteUrl && window.open(selectedItem.websiteUrl, '_blank')}
                    className="text-sm text-gray-500 dark:text-gray-400 mt-1 line-clamp-2 cursor-pointer hover:text-indigo-600 hover:bg-indigo-50 rounded p-1 -ml-1 transition-colors"
                    title="Click to view on CurseForge"
                  >
                    {selectedItem.description}
                  </p>
                </div>
                <button onClick={() => setSelectedItem(null)} className="p-1 rounded-full hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-500 dark:text-gray-400 transition-colors">
                  <XCircleIcon className="w-6 h-6" />
                </button>
              </div>

              <div className="flex items-center gap-2">
                {selectedItem.websiteUrl && (
                  <a 
                    href={selectedItem.websiteUrl} 
                    target="_blank" 
                    rel="noreferrer"
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 rounded-lg text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-700 hover:text-indigo-600 transition-colors"
                  >
                    <ArrowTopRightOnSquareIcon className="w-3.5 h-3.5" />
                    Open in CurseForge
                  </a>
                )}
              </div>
            </div>

            <div className="flex border-b border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-5 pt-2">
              <button
                onClick={() => setModalTab('files')}
                className={`pb-3 px-4 text-sm font-medium border-b-2 transition-colors ${
                  modalTab === 'files' 
                    ? 'border-indigo-600 text-indigo-600' 
                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                }`}
              >
                Downloads
              </button>
              <button
                onClick={() => setModalTab('dependencies')}
                className={`pb-3 px-4 text-sm font-medium border-b-2 transition-colors ${
                  modalTab === 'dependencies' 
                    ? 'border-indigo-600 text-indigo-600' 
                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                }`}
              >
                Dependencies {itemDependencies.length > 0 && `(${itemDependencies.length})`}
              </button>
            </div>

            <div className="overflow-y-auto p-4 flex-1 bg-gray-50/30 dark:bg-slate-900/50">
              
              {modalTab === 'files' && (
                <>
                  {selectedVersions.length === 0 ? (
                    <div className="py-12 flex flex-col items-center text-gray-400">
                      <div className="animate-spin rounded-full h-6 w-6 border-2 border-indigo-600 border-t-transparent mb-2" />
                      <p className="text-sm">Fetching versions...</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {selectedVersions.map((v) => (
                        <div key={v.id} 
                          className="group bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 p-3 rounded-xl hover:border-indigo-300 hover:shadow-sm transition-all flex items-center gap-3">
                          
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-bold text-gray-900 dark:text-gray-100 truncate text-sm" title={v.name}>{v.name}</span>
                              {getReleaseBadge(v.releaseType)}
                            </div>
                            
                            <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center flex-wrap gap-x-3 gap-y-1">
                               <span className="font-mono bg-gray-100 dark:bg-slate-700 px-1.5 py-0.5 rounded text-gray-600 dark:text-gray-300 truncate max-w-[150px]" title={v.filename}>
                                 {v.filename}
                               </span>
                               {v.size && (
                                 <span className="flex items-center gap-1">
                                   <CubeIcon className="w-3 h-3" />
                                   {formatFileSize(v.size)}
                                 </span>
                               )}
                               {v.fileDate && (
                                 <span className="flex items-center gap-1">
                                   <CalendarDaysIcon className="w-3 h-3" />
                                   {new Date(v.fileDate).toLocaleDateString()}
                                 </span>
                               )}
                            </div>
                          </div>

                          <button
                            onClick={() => handleInstall(v)}
                            disabled={loadingInstall}
                            className="shrink-0 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium shadow-sm transition-all disabled:opacity-50 whitespace-nowrap"
                          >
                            {loadingInstall ? '...' : 'Install'}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}

              {modalTab === 'dependencies' && (
                <div className="space-y-3">
                  {loadingDependencies ? (
                     <div className="py-12 flex flex-col items-center text-gray-400">
                       <div className="animate-spin rounded-full h-6 w-6 border-2 border-indigo-600 border-t-transparent mb-2" />
                       <p className="text-sm">Fetching dependency details...</p>
                     </div>
                  ) : itemDependencies.length === 0 ? (
                    <div className="py-10 text-center text-gray-500 dark:text-gray-400">
                      <CheckCircleIcon className="w-10 h-10 mx-auto text-green-500 opacity-50 mb-2" />
                      <p>No required dependencies found.</p>
                      <p className="text-xs text-gray-400">This mod should work standalone.</p>
                    </div>
                  ) : (
                    <>
                      <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg p-3 mb-4 text-xs text-amber-800 dark:text-amber-300 flex gap-2">
                        <ExclamationCircleIcon className="w-4 h-4 shrink-0 mt-0.5" />
                        <p>These mods are required for <b>{selectedItem.name}</b> to work. Please install them as well.</p>
                      </div>

                      {itemDependencies.map(dep => (
                        <div key={dep.id} 
                          className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 p-3 rounded-xl flex items-center gap-3">
                          <img 
                            src={dep.icon || 'https://www.curseforge.com/images/favicon.ico'} 
                            alt="" 
                            className="w-10 h-10 rounded-lg bg-gray-100 dark:bg-slate-700 object-cover" 
                          />
                          <div className="flex-1 min-w-0">
                            <h4 className="font-bold text-gray-900 dark:text-gray-100 text-sm truncate">{dep.name}</h4>
                            <div className="flex gap-2 text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                              <span>{dep.downloads > 0 ? formatFileSize(dep.downloads) + ' downloads' : 'Dependency'}</span>
                            </div>
                          </div>
                          
                          <button
                            onClick={() => handleViewDependency(dep)}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 dark:bg-slate-700 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 text-indigo-700 dark:text-indigo-400 border border-gray-200 dark:border-slate-600 hover:border-indigo-200 dark:hover:border-indigo-600 rounded-lg text-xs font-medium transition-all"
                          >
                            Select Version <ArrowRightCircleIcon className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              )}

            </div>
          </div>
        </div>
      )}
    </div>
  );
}