// components/ModsPluginsTabSteam.js
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { 
  ArrowDownTrayIcon, 
  MagnifyingGlassIcon, 
  ExclamationCircleIcon, 
  CheckCircleIcon,
  XCircleIcon,
  CpuChipIcon,
  ArrowTopRightOnSquareIcon,
  QueueListIcon,
  TrashIcon
} from '@heroicons/react/24/outline';

export default function ModsPluginsTabSteam({ server }) {
  // View State: 'browse' or 'installed'
  const [viewMode, setViewMode] = useState('browse');

  // Browse State
  const [catalog, setCatalog] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMoreResults, setHasMoreResults] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [selectedVersions, setSelectedVersions] = useState([]);
  
  // Installed State
  const [installedMods, setInstalledMods] = useState({});
  const [loadingInstalled, setLoadingInstalled] = useState(false);

  // Action State
  const [loadingInstall, setLoadingInstall] = useState(false);
  const [loadingUninstall, setLoadingUninstall] = useState(null); // stores the modSlug being uninstalled
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // ------------------------------------------------------------------
  // UTILS
  // ------------------------------------------------------------------
  const fetchWithProxy = async (url, options = {}) => {
    const proxyUrl = `/api/proxy?url=${encodeURIComponent(url)}`;
    const res = await fetch(proxyUrl, options);
    if (!res.ok) throw new Error(`Proxy error: ${res.status}`);
    return await res.json();
  };

  // ------------------------------------------------------------------
  // BROWSE / CATALOG LOGIC
  // ------------------------------------------------------------------
  const fetchCatalog = async (page = 1, isNewSearch = false) => {
    setLoadingCatalog(true);
    setError(null);

    try {
      const limit = 20;
      const offset = (page - 1) * limit;
      const isSearchEmpty = searchQuery.trim() === '';

      const graphqlQuery = {
        query: `
          query GetSteamMods($search: String, $limit: Int, $offset: Int, $order_by: ModFields, $order: Order) {
            getMods(filter: { search: $search, limit: $limit, offset: $offset, order_by: $order_by, order: $order }) {
              mods { id name short_description logo downloads mod_reference }
              count
            }
          }
        `,
        variables: { 
            search: isSearchEmpty ? null : searchQuery.trim(), 
            limit, 
            offset,
            order_by: isSearchEmpty ? "downloads" : null,
            order: isSearchEmpty ? "desc" : null
        }
      };

      const response = await fetchWithProxy('https://api.ficsit.app/v2/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(graphqlQuery)
      });

      if (response.errors) throw new Error(response.errors[0].message);

      const modsData = response.data?.getMods?.mods || [];
      const totalCount = response.data?.getMods?.count || 0;

      const items = modsData.map(mod => ({
        id: Math.random().toString(), 
        mod_id: mod.id, 
        name: mod.name,
        description: mod.short_description,
        downloads: mod.downloads,
        mod_reference: mod.mod_reference, 
        icon: mod.logo || null,
        websiteUrl: `https://ficsit.app/mod/${mod.mod_reference}`
      }));

      setHasMoreResults(items.length === limit && (offset + limit) < totalCount);

      if (isNewSearch || page === 1) {
        setCatalog(items);
      } else {
        setCatalog(prev => [...prev, ...items]);
      }
    } catch (error) {
      console.error('Error fetching FICSIT catalog:', error);
      setError(`Failed to load FICSIT mods: ${error.message}`);
    } finally {
      setLoadingCatalog(false);
      setIsSearching(false);
    }
  };

  useEffect(() => {
    fetchCatalog(1, true);
    setCurrentPage(1);
  }, [server?.id]);

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
    setLoadingVersions(true); 

    try {
      const graphqlQuery = {
        query: `
          query GetModVersions($id: ModID!) {
            getMod(modId: $id) {
              versions { id version sml_version created_at }
            }
          }
        `,
        variables: { id: item.mod_id } 
      };

      const response = await fetchWithProxy('https://api.ficsit.app/v2/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(graphqlQuery)
      });

      if (response.errors) throw new Error(response.errors[0].message);

      const versionsData = response.data?.getMod?.versions || [];
      const versions = versionsData.map(v => ({
        id: v.id, name: v.version, smlVersion: v.sml_version, fileDate: v.created_at
      }));

      setSelectedVersions(versions);
    } catch (err) {
      setError(`Failed to load versions: ${err.message}`);
    } finally {
      setLoadingVersions(false); 
    }
  };

  const handleInstall = async (version) => {
    setLoadingInstall(true);
    setError(null);
    setSuccess(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Authentication session expired.");

      const res = await fetch('/api/servers/install-mod', {
        method: 'POST',
        headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}` 
        },
        body: JSON.stringify({
          serverId: server.id,
          modSlug: selectedItem.mod_reference,
          modVersion: version.name
        })
      });
      
      if (!res.ok) throw new Error((await res.json()).error || 'Installation failed');
      
      setSuccess(`Successfully installed ${selectedItem.name} (${version.name})! Restart the server to initialize.`);
      setSelectedItem(null);
    } catch (error) {
      setError(error.message);
    } finally {
      setLoadingInstall(false);
    }
  };

  // ------------------------------------------------------------------
  // INSTALLED MODS LOGIC
  // ------------------------------------------------------------------
  const fetchInstalledMods = async () => {
    setLoadingInstalled(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Authentication session expired.");

      const res = await fetch(`/api/servers/manage-mods?serverId=${server.id}`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${session.access_token}` }
      });
      
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to fetch installed mods');
      
      const data = await res.json();
      setInstalledMods(data.mods || {});
    } catch (error) {
      setError(error.message);
    } finally {
      setLoadingInstalled(false);
    }
  };

  // Fetch installed mods automatically when switching to the 'installed' tab
  useEffect(() => {
    if (viewMode === 'installed') {
        fetchInstalledMods();
    }
  }, [viewMode]);

  const handleUninstall = async (modSlug) => {
    if (!confirm(`Are you sure you want to uninstall ${modSlug}?`)) return;
    
    setLoadingUninstall(modSlug);
    setError(null);
    setSuccess(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Authentication session expired.");

      const res = await fetch('/api/servers/manage-mods', {
        method: 'POST',
        headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}` 
        },
        body: JSON.stringify({ serverId: server.id, modSlug })
      });
      
      if (!res.ok) throw new Error((await res.json()).error || 'Uninstallation failed');
      
      setSuccess(`Successfully uninstalled ${modSlug}! Restart the server to apply changes.`);
      fetchInstalledMods(); // Refresh the list
    } catch (error) {
      setError(error.message);
    } finally {
      setLoadingUninstall(null);
    }
  };


  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 overflow-hidden flex flex-col h-[700px]">
      
      {/* Dynamic Popups */}
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

      {/* Top Navigation Tabs */}
      <div className="border-b border-gray-200 dark:border-slate-700 bg-gray-50/50 dark:bg-slate-900/50 p-2 flex justify-center sm:justify-start gap-2">
        <button
          onClick={() => setViewMode('browse')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            viewMode === 'browse' 
                ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm border border-gray-200 dark:border-slate-600' 
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-800 border border-transparent'
          }`}
        >
          <MagnifyingGlassIcon className="w-4 h-4" />
          Browse Catalog
        </button>
        <button
          onClick={() => setViewMode('installed')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            viewMode === 'installed' 
                ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm border border-gray-200 dark:border-slate-600' 
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-800 border border-transparent'
          }`}
        >
          <QueueListIcon className="w-4 h-4" />
          Installed Mods
        </button>
      </div>

      {/* ========================================================= */}
      {/* BROWSE MODE */}
      {/* ========================================================= */}
      {viewMode === 'browse' && (
        <div className="flex flex-col h-full overflow-hidden">
            {/* Search Bar */}
            <div className="p-4 border-b border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 flex gap-3 shrink-0">
                <div className="relative flex-1">
                <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 dark:text-gray-500" />
                <input
                    type="text"
                    placeholder="Search FICSIT Mod Repository..."
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

            {/* Grid List */}
            <div className="flex-1 overflow-y-auto p-4 bg-gray-50/50 dark:bg-slate-900/50">
                {loadingCatalog && currentPage === 1 ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-500 dark:text-gray-400">
                    <div className="animate-spin rounded-full h-8 w-8 border-4 border-indigo-600 border-t-transparent mb-3" />
                    <p>Scanning FICSIT database...</p>
                </div>
                ) : catalog.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-400">
                    <CpuChipIcon className="w-16 h-16 mb-4 opacity-20" />
                    <p className="text-lg font-medium text-gray-500 dark:text-gray-400">No Satisfactory mods found</p>
                </div>
                ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {catalog.map((item) => (
                    <div key={item.mod_id} className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-4 hover:border-indigo-300 hover:shadow-md transition-all flex flex-col">
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
                        {item.description || "No description provided."}
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
        </div>
      )}

      {/* ========================================================= */}
      {/* INSTALLED MODE */}
      {/* ========================================================= */}
      {viewMode === 'installed' && (
        <div className="flex-1 overflow-y-auto p-4 bg-gray-50/50 dark:bg-slate-900/50">
            {loadingInstalled ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-500 dark:text-gray-400">
                    <div className="animate-spin rounded-full h-8 w-8 border-4 border-indigo-600 border-t-transparent mb-3" />
                    <p>Fetching installed mods...</p>
                </div>
            ) : Object.keys(installedMods).length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-400">
                    <QueueListIcon className="w-16 h-16 mb-4 opacity-20" />
                    <p className="text-lg font-medium text-gray-500 dark:text-gray-400">No mods currently installed.</p>
                    <button 
                        onClick={() => setViewMode('browse')}
                        className="mt-4 text-indigo-600 dark:text-indigo-400 hover:underline font-medium"
                    >
                        Browse the Catalog
                    </button>
                </div>
            ) : (
                <div className="max-w-4xl mx-auto space-y-3">
                    <div className="flex items-center justify-between px-2 mb-4">
                        <h3 className="font-bold text-gray-900 dark:text-gray-100">
                            Installed Mods ({Object.keys(installedMods).length})
                        </h3>
                        <p className="text-xs text-gray-500 dark:text-gray-400">Read directly from profiles.json</p>
                    </div>

                    {Object.entries(installedMods).map(([slug, details]) => (
                        <div key={slug} className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 p-4 rounded-xl flex items-center justify-between gap-4 hover:border-indigo-300 dark:hover:border-indigo-600 transition-colors">
                            <div className="flex items-center gap-4 flex-1 min-w-0">
                                <div className="w-10 h-10 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 flex items-center justify-center text-indigo-600 font-bold text-lg shrink-0">
                                    {slug.charAt(0).toUpperCase()}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h4 className="font-bold text-gray-900 dark:text-gray-100 truncate">{slug}</h4>
                                    <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-3 mt-1">
                                        <span className="font-mono bg-gray-100 dark:bg-slate-700 px-1.5 py-0.5 rounded">
                                            v{details.version.replace('>=', '')}
                                        </span>
                                        {details.enabled ? (
                                            <span className="text-green-600 font-medium flex items-center gap-1">
                                                <div className="w-2 h-2 rounded-full bg-green-500" /> Enabled
                                            </span>
                                        ) : (
                                            <span className="text-gray-400 font-medium flex items-center gap-1">
                                                <div className="w-2 h-2 rounded-full bg-gray-400" /> Disabled
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <button
                                onClick={() => handleUninstall(slug)}
                                disabled={loadingUninstall === slug}
                                className="shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium text-red-600 bg-red-50 hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/40 dark:text-red-400 transition-colors disabled:opacity-50 border border-red-100 dark:border-red-900/30"
                            >
                                {loadingUninstall === slug ? (
                                    <div className="w-4 h-4 border-2 border-red-600 border-t-transparent rounded-full animate-spin" />
                                ) : (
                                    <TrashIcon className="w-4 h-4" />
                                )}
                                Uninstall
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
      )}


      {/* Version Drawer Modal (For Browse Mode) */}
      {selectedItem && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex justify-center items-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-xl overflow-hidden flex flex-col max-h-[85vh]">
            
            <div className="p-5 border-b border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-700">
              <div className="flex justify-between items-start">
                <div className="flex-1 pr-4">
                  <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">{selectedItem.name}</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">{selectedItem.description}</p>
                </div>
                <button onClick={() => setSelectedItem(null)} className="p-1 rounded-full hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-500 dark:text-gray-400 transition-colors">
                  <XCircleIcon className="w-6 h-6" />
                </button>
              </div>

              <div className="flex items-center gap-2 mt-3">
                <a href={selectedItem.websiteUrl} target="_blank" rel="noreferrer"
                   className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 rounded-lg text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-700 hover:text-indigo-600 transition-colors"
                >
                  <ArrowTopRightOnSquareIcon className="w-3.5 h-3.5" />
                  View on SMR (FICSIT)
                </a>
              </div>
            </div>

            <div className="overflow-y-auto p-4 flex-1 bg-gray-50/30 dark:bg-slate-900/50 scrollbar-thin">
              {loadingVersions ? (
                <div className="py-12 flex flex-col items-center text-gray-400">
                  <div className="animate-spin rounded-full h-6 w-6 border-2 border-indigo-600 border-t-transparent mb-2" />
                  <p className="text-sm">Fetching available versions...</p>
                </div>
              ) : selectedVersions.length === 0 ? (
                <div className="py-12 flex flex-col items-center text-gray-400">
                  <p className="text-sm">No versions found for this mod.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {selectedVersions.map((v) => (
                    <div key={v.id} className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 p-3 rounded-xl flex items-center justify-between gap-3 hover:border-indigo-300 transition-colors">
                      <div className="flex-1 min-w-0">
                        <span className="font-bold text-gray-900 dark:text-gray-100 text-sm">v{v.name}</span>
                        <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-3 mt-1">
                          <span>SML Required: <span className="font-mono font-semibold text-indigo-600">v{v.smlVersion || 'Any'}</span></span>
                          <span>•</span>
                          <span>{new Date(v.fileDate).toLocaleDateString()}</span>
                        </div>
                      </div>

                      <button
                        onClick={() => handleInstall(v)}
                        disabled={loadingInstall}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium shadow-sm transition-all disabled:opacity-50"
                      >
                        {loadingInstall ? 'Installing...' : 'Install'}
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