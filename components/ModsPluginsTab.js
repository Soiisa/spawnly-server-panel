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
  AdjustmentsHorizontalIcon,
  CalendarDaysIcon,
  CubeIcon
} from '@heroicons/react/24/outline';

export default function ModsPluginsTab({ server }) {
  // --- Constants ---
  const HYBRID_TYPES = ['arclight', 'mohist', 'magma'];
  const PLUGIN_TYPES = ['paper', 'spigot', 'purpur', 'folia', 'velocity', 'waterfall', 'bungeecord', 'bukkit'];
  const MOD_TYPES = ['forge', 'neoforge', 'fabric', 'quilt']; 

  const isHybrid = HYBRID_TYPES.includes(server?.type);
  
  // --- State ---
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
  const [selectedItem, setSelectedItem] = useState(null);
  const [selectedVersions, setSelectedVersions] = useState([]);

  // Helper to use the local proxy
  const fetchWithProxy = async (url) => {
    try {
      const res = await fetch(`/api/proxy?url=${encodeURIComponent(url)}`);
      if (!res.ok) throw new Error(`Proxy error: ${res.status}`);
      return await res.json();
    } catch (e) {
      console.warn('Proxy failed, trying direct fetch (will fail for CurseForge due to missing key):', e);
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Direct fetch failed: ${res.status}`);
      return await res.json();
    }
  };

  // Helper to map loader strings to CurseForge IDs
  const getCurseForgeLoaderId = (type) => {
    const map = {
      'forge': 1,
      'fabric': 4,
      'quilt': 5,
      'neoforge': 6
    };
    if (HYBRID_TYPES.includes(type)) return 1;
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
      case 1: return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-green-100 text-green-700 border border-green-200 uppercase tracking-wide">Release</span>;
      case 2: return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-700 border border-blue-200 uppercase tracking-wide">Beta</span>;
      case 3: return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-orange-100 text-orange-700 border border-orange-200 uppercase tracking-wide">Alpha</span>;
      default: return null;
    }
  };

  const fetchCatalog = async (page = 1, isNewSearch = false) => {
    if (!server?.type || !server?.version) return;

    const mcVersion = server.version.split('-')[0];

    setLoadingCatalog(true);
    setError(null);

    try {
      let items = [];
      let totalItems = 0;
      const pageSize = 20;

      // --- PLUGINS (SPIGET) ---
      if (activeCategory === 'plugins') {
        const apiUrl = searchQuery
          ? `https://api.spiget.org/v2/search/resources/${encodeURIComponent(searchQuery)}?size=${pageSize}&page=${page}&sort=-downloads&fields=id,name,description,version,downloads,file,testedVersions,icon`
          : `https://api.spiget.org/v2/resources?size=${pageSize}&page=${page}&sort=-downloads&fields=id,name,description,version,downloads,file,testedVersions,icon`;

        const spigetData = await fetchWithProxy(apiUrl);

        totalItems = 9999; 
        items = Array.isArray(spigetData) ? spigetData.map(item => ({
          id: item.id,
          name: item.name,
          description: item.tag, 
          version: item.version?.id || 'Unknown',
          downloads: item.downloads,
          source: 'spiget',
          type: 'plugin',
          icon: item.icon?.url ? `https://www.spigotmc.org/${item.icon.url}` : null
        })) : [];
      } 
      
      // --- MODS (CURSEFORGE) ---
      else if (activeCategory === 'mods') {
        const loaderId = getCurseForgeLoaderId(server.type);
        const gameId = 432; 
        const classId = 6;  
        const index = (page - 1) * pageSize;

        const apiUrl = `https://api.curseforge.com/v1/mods/search?gameId=${gameId}&classId=${classId}&searchFilter=${encodeURIComponent(searchQuery)}&gameVersion=${mcVersion}&modLoaderType=${loaderId}&sortField=2&sortOrder=desc&pageSize=${pageSize}&index=${index}`;

        const cfData = await fetchWithProxy(apiUrl);

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
            type: 'mod',
            icon: item.logo?.thumbnailUrl || null
          }));
        }
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
    
    const mcVersion = server.version.split('-')[0];

    try {
      let versions = [];
      
      if (item.source === 'spiget') {
        const res = await fetchWithProxy(`https://api.spiget.org/v2/resources/${item.id}/versions?size=20&sort=-releaseDate`);
        if (Array.isArray(res)) {
          versions = res.map(v => ({
            id: v.id,
            name: v.name,
            downloadUrl: `https://api.spiget.org/v2/resources/${item.id}/versions/${v.id}/download`,
            filename: `${item.name}-${v.name}.jar`,
            releaseType: 1 // Assume release for spigot
          }));
        }
      } else if (item.source === 'curseforge') {
        // --- CURSEFORGE VERSIONS ---
        const loaderId = getCurseForgeLoaderId(server.type);
        
        const apiUrl = `https://api.curseforge.com/v1/mods/${item.id}/files?gameVersion=${mcVersion}&modLoaderType=${loaderId}&pageSize=20`;
        
        const res = await fetchWithProxy(apiUrl);
        
        if (res && res.data && Array.isArray(res.data)) {
           versions = res.data.map(v => ({
            id: v.id,
            name: v.displayName,
            downloadUrl: v.downloadUrl,
            filename: v.fileName,
            releaseType: v.releaseType, // 1=Release, 2=Beta, 3=Alpha
            fileDate: v.fileDate,
            size: v.fileLength,
            dependencies: v.dependencies || [] // [{modId, relationType}]
          })).filter(v => v.downloadUrl);
        }
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
      const folder = selectedItem.type === 'plugin' ? 'plugins' : 'mods';
        
      const res = await fetch('/api/servers/install-mod', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serverId: server.id,
          downloadUrl: version.downloadUrl,
          filename: version.filename,
          folder
        })
      });
      
      if (!res.ok) throw new Error((await res.json()).error || 'Installation failed');
      
      setSuccess(`Installed ${selectedItem.name} (${version.name}) to /${folder}! Restart server to apply.`);
      setSelectedItem(null);
    } catch (error) {
      setError(error.message);
    } finally {
      setLoadingInstall(false);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col h-[600px]">
      
      {/* Header / Search */}
      <div className="p-4 border-b border-gray-200 bg-gray-50 flex flex-col md:flex-row gap-3">
        {isHybrid && (
          <div className="flex bg-gray-200 rounded-lg p-1 shrink-0">
            <button
              onClick={() => setActiveCategory('mods')}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                activeCategory === 'mods' 
                  ? 'bg-white text-indigo-600 shadow-sm' 
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Mods
            </button>
            <button
              onClick={() => setActiveCategory('plugins')}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                activeCategory === 'plugins' 
                  ? 'bg-white text-indigo-600 shadow-sm' 
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Plugins
            </button>
          </div>
        )}

        <div className="relative flex-1">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder={activeCategory === 'plugins' ? "Search plugins..." : "Search mods (CurseForge)..."}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch(e)}
            className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
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
      <div className="flex-1 overflow-y-auto p-4 bg-gray-50/50">
        {loadingCatalog && currentPage === 1 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
            <div className="animate-spin rounded-full h-8 w-8 border-4 border-indigo-600 border-t-transparent mb-3" />
            <p>Fetching resources...</p>
          </div>
        ) : catalog.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400">
            {activeCategory === 'mods' ? <CpuChipIcon className="w-16 h-16 mb-4 opacity-20" /> : <PuzzlePieceIcon className="w-16 h-16 mb-4 opacity-20" />}
            <p className="text-lg font-medium text-gray-500">No resources found</p>
            <p className="text-sm">Try a different search term</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {catalog.map((item) => (
              <div key={`${item.source}-${item.id}`} className="bg-white border border-gray-200 rounded-xl p-4 hover:border-indigo-300 hover:shadow-md transition-all flex flex-col">
                <div className="flex gap-4 mb-3">
                  {item.icon ? (
                    <img src={item.icon} alt="" className="w-12 h-12 rounded-lg bg-gray-100 object-cover" />
                  ) : (
                    <div className="w-12 h-12 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600 font-bold text-xl">
                      {item.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-gray-900 truncate" title={item.name}>{item.name}</h3>
                    <p className="text-xs text-gray-500 flex items-center gap-1 mt-1">
                      <ArrowDownTrayIcon className="w-3 h-3" />
                      {item.downloads.toLocaleString()}
                    </p>
                  </div>
                </div>
                
                <p className="text-xs text-gray-600 line-clamp-3 mb-4 flex-1 leading-relaxed">
                  {item.description?.replace(/<\/?[^>]+(>|$)/g, "") || "No description provided."}
                </p>

                <button
                  onClick={() => fetchVersions(item)}
                  className="w-full py-2 bg-gray-50 hover:bg-indigo-50 text-indigo-700 font-medium rounded-lg text-sm border border-gray-200 hover:border-indigo-200 transition-colors"
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
              className="px-6 py-2 bg-white border border-gray-300 text-gray-700 rounded-full text-sm font-medium hover:bg-gray-50 shadow-sm transition-all disabled:opacity-50"
            >
              {loadingCatalog ? 'Loading...' : 'Load More'}
            </button>
          </div>
        )}
      </div>

      {/* Version Selector Modal */}
      {selectedItem && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex justify-center items-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="p-5 border-b border-gray-200 flex justify-between items-center bg-gray-50">
              <div>
                <h3 className="text-lg font-bold text-gray-900">Select Version</h3>
                <p className="text-xs text-gray-500 mt-0.5">for {selectedItem.name}</p>
              </div>
              <button onClick={() => setSelectedItem(null)} className="p-1 rounded-full hover:bg-gray-200 text-gray-500 transition-colors">
                <XCircleIcon className="w-6 h-6" />
              </button>
            </div>

            <div className="overflow-y-auto p-4 flex-1 bg-gray-50/30">
              {selectedVersions.length === 0 ? (
                <div className="py-12 flex flex-col items-center text-gray-400">
                  <div className="animate-spin rounded-full h-6 w-6 border-2 border-indigo-600 border-t-transparent mb-2" />
                  <p className="text-sm">Fetching versions...</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {selectedVersions.map((v) => (
                    <div key={v.id} className="group bg-white border border-gray-200 p-3 rounded-xl hover:border-indigo-300 hover:shadow-sm transition-all flex items-center gap-3">
                      
                      {/* Left: Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-bold text-gray-900 truncate text-sm" title={v.name}>{v.name}</span>
                          {getReleaseBadge(v.releaseType)}
                        </div>
                        
                        <div className="text-xs text-gray-500 flex items-center flex-wrap gap-x-3 gap-y-1">
                           <span className="font-mono bg-gray-100 px-1.5 py-0.5 rounded text-gray-600 truncate max-w-[150px]" title={v.filename}>
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

                        {/* Dependencies Warning */}
                        {v.dependencies && v.dependencies.some(d => d.relationType === 3) && (
                          <div className="mt-2 flex items-center gap-1.5 text-[10px] text-amber-700 bg-amber-50 border border-amber-100 px-2 py-1 rounded-md w-fit">
                            <ExclamationCircleIcon className="w-3.5 h-3.5" />
                            <span>Requires dependencies (check CurseForge page)</span>
                          </div>
                        )}
                      </div>

                      {/* Right: Action */}
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
            </div>
          </div>
        </div>
      )}
    </div>
  );
}