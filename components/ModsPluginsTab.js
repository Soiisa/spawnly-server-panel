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
  AdjustmentsHorizontalIcon
} from '@heroicons/react/24/outline';

export default function ModsPluginsTab({ server }) {
  // --- Constants ---
  const HYBRID_TYPES = ['arclight', 'mohist', 'magma'];
  const PLUGIN_TYPES = ['paper', 'spigot', 'purpur', 'folia', 'velocity', 'waterfall', 'bungeecord', 'bukkit'];
  // Pure mod loaders
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
      // Direct fetch is fallback, but won't work for CurseForge since it needs the key injected by proxy
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
    // Hybrid servers usually use Forge mods
    if (HYBRID_TYPES.includes(type)) return 1;
    return map[type] || 1; // Default to Forge if unknown
  };

  const fetchCatalog = async (page = 1, isNewSearch = false) => {
    if (!server?.type || !server?.version) return;

    const mcVersion = server.version.split('-')[0]; // "1.20.1"

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

        totalItems = 9999; // Spiget pagination is tricky, assuming many
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
        const gameId = 432; // Minecraft Game ID
        const classId = 6;  // Mods Category ID
        
        // Calculate offset for CurseForge (index)
        const index = (page - 1) * pageSize;

        // Construct CurseForge Search URL
        // Sorting: 2 = Popularity/Downloads, sortOrder: desc
        const apiUrl = `https://api.curseforge.com/v1/mods/search?gameId=${gameId}&classId=${classId}&searchFilter=${encodeURIComponent(searchQuery)}&gameVersion=${mcVersion}&modLoaderType=${loaderId}&sortField=2&sortOrder=desc&pageSize=${pageSize}&index=${index}`;

        const cfData = await fetchWithProxy(apiUrl);

        // CurseForge returns { data: [...], pagination: { totalCount: ... } }
        if (cfData && cfData.data) {
          totalItems = cfData.pagination.totalCount; 
          // API caps index+pageSize at 10,000, so we clamp totalItems for UI safety
          if (totalItems > 10000) totalItems = 10000;

          items = cfData.data.map(item => ({
            id: item.id,
            name: item.name,
            description: item.summary, // CurseForge uses 'summary'
            version: 'Latest', // We'll fetch specific versions later
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

  // Reload when server type/version OR activeCategory changes
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
            filename: `${item.name}-${v.name}.jar`
          }));
        }
      } else if (item.source === 'curseforge') {
        // --- CURSEFORGE VERSIONS ---
        const loaderId = getCurseForgeLoaderId(server.type);
        
        // Fetch files for this specific mod, filtered by version and loader
        const apiUrl = `https://api.curseforge.com/v1/mods/${item.id}/files?gameVersion=${mcVersion}&modLoaderType=${loaderId}&pageSize=20`;
        
        const res = await fetchWithProxy(apiUrl);
        
        if (res && res.data && Array.isArray(res.data)) {
           versions = res.data.map(v => ({
            id: v.id,
            name: v.displayName,
            downloadUrl: v.downloadUrl,
            filename: v.fileName
          })).filter(v => v.downloadUrl); // Filter out files without direct download links
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
      // Determine folder based on source type
      // Spigot -> plugins, CurseForge -> mods
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
        
        {/* Toggle for Hybrids */}
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
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[80vh]">
            <div className="p-5 border-b border-gray-200 flex justify-between items-center bg-gray-50">
              <div>
                <h3 className="text-lg font-bold text-gray-900">Select Version</h3>
                <p className="text-xs text-gray-500 mt-0.5">for {selectedItem.name}</p>
              </div>
              <button onClick={() => setSelectedItem(null)} className="p-1 rounded-full hover:bg-gray-200 text-gray-500 transition-colors">
                <XCircleIcon className="w-6 h-6" />
              </button>
            </div>

            <div className="overflow-y-auto p-2 flex-1">
              {selectedVersions.length === 0 ? (
                <div className="py-12 flex flex-col items-center text-gray-400">
                  <div className="animate-spin rounded-full h-6 w-6 border-2 border-indigo-600 border-t-transparent mb-2" />
                  <p className="text-sm">Fetching versions...</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {selectedVersions.map((v) => (
                    <div key={v.id} className="group flex items-center justify-between p-3 hover:bg-gray-50 rounded-xl transition-colors">
                      <div className="flex flex-col min-w-0 pr-4">
                        <span className="font-medium text-gray-900 truncate">{v.name}</span>
                        <span className="text-xs text-gray-400 truncate font-mono">{v.filename}</span>
                      </div>
                      <button
                        onClick={() => handleInstall(v)}
                        disabled={loadingInstall}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-1.5 rounded-lg text-sm font-medium shadow-sm transition-all disabled:opacity-50 whitespace-nowrap"
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