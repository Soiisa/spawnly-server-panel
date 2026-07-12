// components/ModsPluginsTabSteam.js
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useTranslation } from 'next-i18next';
import { 
  ArrowDownTrayIcon, MagnifyingGlassIcon, ExclamationCircleIcon, 
  CheckCircleIcon, CpuChipIcon, QueueListIcon, TrashIcon, 
  XCircleIcon, CodeBracketIcon, PuzzlePieceIcon
} from '@heroicons/react/24/outline';
import axios from 'axios';

// App IDs for games supporting Steam Workshop
const WORKSHOP_GAMES = {
  gmod: 4000,
  arma3: 107410,
  space_engineers: 244850,
  dayz: 221100,
  squad: 393380,
  unturned: 304930,
  dst: 322330,
  conan_exiles: 440900,
  ark_se: 346110
};

export default function ModsPluginsTabSteam({ server }) {
  const { t } = useTranslation('server');

  const [viewMode, setViewMode] = useState('browse');
  const [catalog, setCatalog] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMoreResults, setHasMoreResults] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  
  const [selectedItem, setSelectedItem] = useState(null);
  const [selectedVersions, setSelectedVersions] = useState([]);
  
  const [installedMods, setInstalledMods] = useState([]);
  const [loadingInstalled, setLoadingInstalled] = useState(false);

  // Oxide State
  const [isOxideInstalled, setIsOxideInstalled] = useState(true);
  const [checkingOxide, setCheckingOxide] = useState(true);
  const [loadingOxide, setLoadingOxide] = useState(false);

  const [loadingInstall, setLoadingInstall] = useState(false);
  const [loadingUninstall, setLoadingUninstall] = useState(null); 
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // GMod Specific State
  const [authKey, setAuthKey] = useState('');
  const [collectionId, setCollectionId] = useState('');
  const [isSavingGmod, setIsSavingGmod] = useState(false);
  const [saveMessageGmod, setSaveMessageGmod] = useState('');

  const isRust = server?.game === 'rust';
  const isSatisfactory = server?.game === 'satisfactory';
  const isGmod = server?.game === 'gmod';
  const clientAppId = WORKSHOP_GAMES[server?.game];
  const supportsWorkshop = !!clientAppId;

  const fetchWithProxy = async (url, options = {}) => {
    const proxyUrl = `/api/proxy?url=${encodeURIComponent(url)}`;
    const res = await fetch(proxyUrl, options);
    if (!res.ok) throw new Error(`Proxy error: ${res.status}`);
    return await res.json();
  };

  const checkOxide = async () => {
      if (!isRust) return setCheckingOxide(false);
      try {
          const { data: { session } } = await supabase.auth.getSession();
          const res = await axios.get(`/api/servers/${server.id}/files?path=RustDedicated_Data/Managed`, {
              headers: { 'Authorization': `Bearer ${session.access_token}` }
          });
          const files = res.data?.files || [];
          setIsOxideInstalled(files.some(f => f.name === 'Oxide.Core.dll'));
      } catch (err) {
          setIsOxideInstalled(false);
      } finally {
          setCheckingOxide(false);
      }
  };

  useEffect(() => { checkOxide(); }, [server?.id, isRust]);

  // Load existing GMod parameters from spawnly-args.json
  useEffect(() => {
      if (!isGmod) return;
      const loadGmodArgs = async () => {
          try {
              const { data: { session } } = await supabase.auth.getSession();
              const res = await axios.get(`/api/servers/${server.id}/file?path=spawnly-args.json`, {
                  headers: { 'Authorization': `Bearer ${session.access_token}` }
              });
              
              if (res.data && res.data.content) {
                  const args = JSON.parse(res.data.content);
                  if (args['-authkey']) setAuthKey(args['-authkey']);
                  if (args['+host_workshop_collection']) setCollectionId(args['+host_workshop_collection']);
              }
          } catch (e) {
              // Ignore if file doesn't exist yet
          }
      };
      loadGmodArgs();
  }, [server?.id, isGmod]);

  const handleInstallOxide = async () => {
      if (server.game_status !== 'Stopped') {
          setError(t('mods_plugins.messages.oxide_stop_required', { defaultValue: "You must STOP the server from the Overview tab before installing or updating Oxide." }));
          return;
      }
      setLoadingOxide(true); setError(null); setSuccess(null);
      try {
          const { data: { session } } = await supabase.auth.getSession();
          const res = await fetch('/api/servers/install-oxide', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
              body: JSON.stringify({ serverId: server.id })
          });
          if (!res.ok) throw new Error((await res.json()).error || t('mods_plugins.errors.install_failed', { defaultValue: 'Oxide installation failed' }));
          setSuccess(t('mods_plugins.messages.oxide_install_success', { defaultValue: "Oxide Framework installed successfully! You can now start the server." }));
          setIsOxideInstalled(true);
      } catch (err) { setError(err.message); } finally { setLoadingOxide(false); }
  };

  const handleSaveGmodCollection = async () => {
      setIsSavingGmod(true);
      setSaveMessageGmod('');
      try {
          const { data: { session } } = await supabase.auth.getSession();
          
          let currentArgs = {};
          try {
              const res = await axios.get(`/api/servers/${server.id}/file?path=spawnly-args.json`, {
                  headers: { 'Authorization': `Bearer ${session.access_token}` }
              });
              if (res.data && res.data.content) {
                  currentArgs = JSON.parse(res.data.content);
              }
          } catch (e) {} 

          if (authKey) currentArgs['-authkey'] = authKey;
          else delete currentArgs['-authkey'];

          if (collectionId) currentArgs['+host_workshop_collection'] = collectionId;
          else delete currentArgs['+host_workshop_collection'];

          await axios.post(`/api/servers/${server.id}/file`, {
              path: 'spawnly-args.json',
              content: JSON.stringify(currentArgs, null, 4)
          }, {
              headers: { 'Authorization': `Bearer ${session.access_token}` }
          });

          setSaveMessageGmod(t('mods_plugins.messages.gmod_save_success', { defaultValue: 'Workshop Collection saved! Restart the server to apply.' }));
      } catch (error) {
          setSaveMessageGmod(t('mods_plugins.messages.gmod_save_failed', { defaultValue: 'Failed to save settings.' }));
      }
      setIsSavingGmod(false);
  };

  const fetchCatalog = async (page = 1, isNewSearch = false) => {
    if (isGmod) return; 
    setLoadingCatalog(true); setError(null);

    try {
      let items = [];
      let totalResults = 0;

      if (isRust) {
        const umodUrl = `https://umod.org/plugins/search.json?query=${encodeURIComponent(searchQuery)}&page=${page}`;
        const data = await fetchWithProxy(umodUrl);
        items = (data.data || []).map(plugin => ({
          mod_id: plugin.slug, name: plugin.title, description: plugin.description, downloads: plugin.downloads, mod_reference: plugin.slug, icon: plugin.icon_url || null, downloadUrl: `https://umod.org/plugins/${plugin.slug}/download`
        }));
        totalResults = data.total || 0;
        setHasMoreResults(items.length > 0 && (page * 15) < totalResults); 
      } 
      else if (isSatisfactory) {
        const limit = 20; const offset = (page - 1) * limit; const isSearchEmpty = searchQuery.trim() === '';
        const graphqlQuery = { query: `query GetSteamMods($search: String, $limit: Int, $offset: Int, $order_by: ModFields, $order: Order) { getMods(filter: { search: $search, limit: $limit, offset: $offset, order_by: $order_by, order: $order }) { mods { id name short_description logo downloads mod_reference } count } }`, variables: { search: isSearchEmpty ? null : searchQuery.trim(), limit, offset, order_by: isSearchEmpty ? "downloads" : null, order: isSearchEmpty ? "desc" : null } };
        const response = await fetchWithProxy('https://api.ficsit.app/v2/query', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(graphqlQuery) });
        if (response.errors) throw new Error(response.errors[0].message);
        const modsData = response.data?.getMods?.mods || [];
        totalResults = response.data?.getMods?.count || 0;
        items = modsData.map(mod => ({ mod_id: mod.id, name: mod.name, description: mod.short_description, downloads: mod.downloads, mod_reference: mod.mod_reference, icon: mod.logo || null }));
        setHasMoreResults(items.length === limit && (offset + limit) < totalResults);
      }
      else if (supportsWorkshop) {
        const res = await fetch(`/api/steam/workshop-search?search=${encodeURIComponent(searchQuery)}&page=${page}&appId=${clientAppId}`);
        const data = await res.json();
        if (data.error) throw new Error(data.error);

        const modsData = data.publishedfiledetails || [];
        totalResults = data.total || 0;

        items = modsData.map(mod => ({
            mod_id: mod.publishedfileid,
            name: mod.title || 'Unnamed Mod',
            description: mod.short_description || '',
            downloads: mod.subscriptions || 0,
            mod_reference: mod.publishedfileid,
            icon: mod.preview_url || null,
        }));
        setHasMoreResults(items.length > 0 && (page * 15) < totalResults);
      }

      if (isNewSearch || page === 1) setCatalog(items);
      else setCatalog(prev => [...prev, ...items]);
    } catch (error) { setError(t('mods_plugins.errors.fetch_catalog', { error: error.message, defaultValue: `Failed to load catalog: ${error.message}` })); } finally { setLoadingCatalog(false); setIsSearching(false); }
  };

  useEffect(() => {
    if (!isGmod && ((isRust && isOxideInstalled) || isSatisfactory || supportsWorkshop)) {
        fetchCatalog(1, true); setCurrentPage(1);
    }
  }, [server?.id, isSatisfactory, isRust, isGmod, supportsWorkshop, isOxideInstalled]);

  const handleSearch = (e) => { if (e) e.preventDefault(); setIsSearching(true); setCurrentPage(1); fetchCatalog(1, true); };
  const handleLoadMore = () => { const nextPage = currentPage + 1; setCurrentPage(nextPage); fetchCatalog(nextPage); };

  const fetchVersions = async (item) => {
    setSelectedItem(item); setSelectedVersions([]); setLoadingVersions(true); 
    try {
      const graphqlQuery = { query: `query GetModVersions($id: ModID!) { getMod(modId: $id) { versions { id version sml_version created_at } } }`, variables: { id: item.mod_id } };
      const response = await fetchWithProxy('https://api.ficsit.app/v2/query', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(graphqlQuery) });
      if (response.errors) throw new Error(response.errors[0].message);
      const versionsData = response.data?.getMod?.versions || [];
      setSelectedVersions(versionsData.map(v => ({ id: v.id, name: v.version, smlVersion: v.sml_version, fileDate: v.created_at })));
    } catch (err) { setError(t('mods_plugins.errors.fetch_versions', { error: err.message, defaultValue: `Failed to load versions: ${err.message}` })); } finally { setLoadingVersions(false); }
  };

  const handleInstall = async (item, versionOverride = null) => {
    if (server.game_status !== 'Stopped' && (supportsWorkshop && server.game === 'arma3' || server.game === 'dayz')) {
        return setError(t('mods_plugins.messages.mod_stop_required', { game: server.game, defaultValue: `You must STOP the server before installing ${server.game} mods.` }));
    }

    setLoadingInstall(item.mod_id); setError(null); setSuccess(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (supportsWorkshop) {
          const res = await fetch('/api/servers/install-workshop', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
              body: JSON.stringify({ serverId: server.id, workshopId: item.mod_id, appId: clientAppId })
          });
          if (!res.ok) throw new Error((await res.json()).error || t('mods_plugins.errors.install_failed', { defaultValue: 'Installation failed' }));
          setSuccess(t('mods_plugins.messages.workshop_queued', { defaultValue: `Download Queued! Go to the Overview tab and check the Server Console to watch the live download progress.` }));
      } else {
          const payload = { serverId: server.id };
          if (isRust) {
            payload.downloadUrl = item.downloadUrl; payload.modSlug = item.mod_reference; payload.folder = 'oxide/plugins';
          } else {
            payload.modSlug = item.mod_reference; payload.modVersion = versionOverride.name;
          }

          const res = await fetch('/api/servers/install-mod', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` }, body: JSON.stringify(payload) });
          if (!res.ok) throw new Error((await res.json()).error || t('mods_plugins.errors.install_failed', { defaultValue: 'Installation failed' }));
          
          if (isRust) setSuccess(t('mods_plugins.messages.rust_download_success', { name: item.name, defaultValue: `Successfully downloaded ${item.name}! Oxide will compile it automatically.` }));
          else { setSuccess(t('mods_plugins.messages.install_success_restart', { name: item.name, version: versionOverride.name, defaultValue: `Successfully installed ${item.name} (${versionOverride.name})! Restart server to initialize.` })); setSelectedItem(null); }
      }
    } catch (error) { setError(error.message); } finally { setLoadingInstall(false); }
  };

  const fetchInstalledMods = async () => {
    if (isGmod) return; 
    setLoadingInstalled(true); setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (isRust) {
        const res = await axios.get(`/api/servers/${server.id}/files?path=oxide/plugins`, { headers: { 'Authorization': `Bearer ${session.access_token}` } });
        setInstalledMods((res.data?.files || []).filter(f => f.name.endsWith('.cs')));
      } 
      // --- WORKSHOP ENRICHMENT LOGIC START ---
      else if (supportsWorkshop) {
        const res = await axios.get(`/api/servers/${server.id}/files?path=steamapps/workshop/content/${clientAppId}`, { headers: { 'Authorization': `Bearer ${session.access_token}` } });
        const dirs = (res.data?.files || []).filter(f => f.isDirectory);
        const ids = dirs.map(d => d.name);

        if (ids.length > 0) {
            try {
                // Fetch the rich Steam Workshop data
                const steamRes = await fetch('/api/steam/workshop', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ids })
                });
                const details = await steamRes.json();
                
                // Map the rich data back onto the directory list
                const enrichedDirs = dirs.map(dir => {
                    const meta = details.find(d => d.publishedfileid === dir.name);
                    return {
                        ...dir,
                        title: meta?.title || `Workshop ID: ${dir.name}`,
                        preview_url: meta?.preview_url || null
                    };
                });
                setInstalledMods(enrichedDirs);
            } catch (err) {
                // If Steam API is down, fallback gracefully
                setInstalledMods(dirs.map(d => ({ ...d, title: `Workshop ID: ${d.name}` })));
            }
        } else {
            setInstalledMods([]);
        }
      } 
      // --- WORKSHOP ENRICHMENT LOGIC END ---
      else if (isSatisfactory) {
        const res = await fetch(`/api/servers/manage-mods?serverId=${server.id}`, { method: 'GET', headers: { 'Authorization': `Bearer ${session.access_token}` } });
        if (!res.ok) throw new Error((await res.json()).error || t('mods_plugins.errors.fetch_installed', { defaultValue: 'Failed to fetch installed mods' }));
        setInstalledMods((await res.json()).mods || {});
      }
    } catch (error) { 
        if (error.response?.status === 400 && (isRust || supportsWorkshop)) setInstalledMods([]);
        else setError(error.response?.data?.error || error.message); 
    } finally { setLoadingInstalled(false); }
  };

  useEffect(() => { if (viewMode === 'installed') fetchInstalledMods(); }, [viewMode]);

  const handleUninstall = async (identifier) => {
    if (!window.confirm(t('mods_plugins.messages.uninstall_confirm', { name: identifier, defaultValue: `Are you sure you want to remove ${identifier}?` }))) return;
    setLoadingUninstall(identifier); setError(null); setSuccess(null);
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (isRust) {
         await axios.delete(`/api/servers/${server.id}/files?path=oxide/plugins/${identifier}`, { headers: { 'Authorization': `Bearer ${session.access_token}` } });
         setSuccess(t('mods_plugins.messages.remove_success', { name: identifier, defaultValue: `Successfully removed ${identifier}.` }));
      } else if (supportsWorkshop) {
         await axios.delete(`/api/servers/${server.id}/files?path=steamapps/workshop/content/${clientAppId}/${identifier}`, { headers: { 'Authorization': `Bearer ${session.access_token}` } });
         if (server.game === 'arma3' || server.game === 'dayz') {
             await axios.delete(`/api/servers/${server.id}/files?path=@${identifier}`, { headers: { 'Authorization': `Bearer ${session.access_token}` } }).catch(() => {});
         }
         setSuccess(t('mods_plugins.messages.uninstall_workshop_success', { name: identifier, defaultValue: `Successfully uninstalled Workshop Mod ${identifier}.` }));
      } else {
         const res = await fetch('/api/servers/manage-mods', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` }, body: JSON.stringify({ serverId: server.id, modSlug: identifier }) });
         if (!res.ok) throw new Error((await res.json()).error || t('mods_plugins.errors.uninstall_failed', { defaultValue: 'Uninstallation failed' }));
         setSuccess(t('mods_plugins.messages.uninstall_success_restart', { name: identifier, defaultValue: `Successfully uninstalled ${identifier}! Restart server to apply.` }));
      }
      fetchInstalledMods();
    } catch (error) { setError(error.response?.data?.error || error.message); } finally { setLoadingUninstall(null); }
  };

  if (isRust && checkingOxide) return <div className="p-12 flex justify-center text-gray-500"><div className="animate-spin rounded-full h-8 w-8 border-4 border-indigo-600 border-t-transparent" /></div>;
      
  if (isRust && !isOxideInstalled) {
      return (
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 flex flex-col items-center justify-center text-center p-8 min-h-[500px]">
            <div className="absolute top-6 right-6 z-20 w-96 space-y-2 pointer-events-none">
                {error && (<div className="bg-red-50 text-red-700 p-4 rounded-xl shadow-lg border border-red-100 flex items-start gap-3 pointer-events-auto animate-in fade-in slide-in-from-right-4"><ExclamationCircleIcon className="w-5 h-5 mt-0.5 shrink-0" /><div className="flex-1 text-sm">{error}</div><button onClick={() => setError(null)} className="hover:text-red-800"><XCircleIcon className="w-5 h-5" /></button></div>)}
            </div>
            <div className="w-20 h-20 bg-indigo-50 dark:bg-indigo-900/30 rounded-full flex items-center justify-center mb-6"><PuzzlePieceIcon className="w-10 h-10 text-indigo-600 dark:text-indigo-400" /></div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">{t('mods_plugins.steam.rust.oxide_required_title', { defaultValue: 'Oxide Framework Required' })}</h2>
            <p className="text-gray-600 dark:text-gray-400 max-w-lg mb-8 leading-relaxed">{t('mods_plugins.steam.rust.oxide_required_desc', { defaultValue: 'Vanilla Rust does not support plugins natively. To browse and install plugins from the uMod repository, you must first install the Oxide framework onto your server.' })}</p>
            <div className="flex flex-col items-center gap-3">
                <button onClick={handleInstallOxide} disabled={loadingOxide} className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-3 rounded-xl font-bold transition-all shadow-sm disabled:opacity-50 flex items-center gap-2">
                    {loadingOxide ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <ArrowDownTrayIcon className="w-5 h-5" />} {t('mods_plugins.steam.rust.install_oxide_btn', { defaultValue: 'Install Oxide Framework' })}
                </button>
                {server.game_status !== 'Stopped' && (<span className="text-xs font-semibold text-amber-600 bg-amber-50 px-3 py-1 rounded border border-amber-200">{t('mods_plugins.steam.rust.server_must_stop', { defaultValue: 'You must STOP the server to install.' })}</span>)}
            </div>
        </div>
      );
  }

  // --- GARRY'S MOD WORKSHOP COLLECTION INTERCEPTOR ---
  if (isGmod) {
      return (
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-8 min-h-[500px]">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">{t('mods_plugins.steam.gmod.title', { defaultValue: "Garry's Mod Workshop Collection" })}</h2>
              <p className="text-gray-600 dark:text-slate-400 mb-8 max-w-3xl leading-relaxed">
                  {t('mods_plugins.steam.gmod.desc', { defaultValue: 'To ensure maximum stability and native client syncing, Garry\'s Mod dedicated servers require the use of Steam Workshop Collections rather than individual mod files.' })}
              </p>

              <div className="space-y-6 max-w-xl">
                  <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">{t('mods_plugins.steam.gmod.api_key_label', { defaultValue: 'Steam Web API Key' })}</label>
                      <input 
                          type="text" 
                          value={authKey}
                          onChange={(e) => setAuthKey(e.target.value)}
                          placeholder={t('mods_plugins.steam.gmod.api_key_placeholder', { defaultValue: 'e.g. 1A2B3C4D5E6F7G8H9I0J' })}
                          className="w-full bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-600 rounded-lg px-4 py-2.5 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
                      />
                      <p className="text-xs text-gray-500 dark:text-slate-500 mt-2">
                          {t('mods_plugins.steam.gmod.api_key_help_prefix', { defaultValue: 'Get this from' })} <a href="https://steamcommunity.com/dev/apikey" target="_blank" rel="noreferrer" className="text-indigo-600 dark:text-indigo-400 hover:underline">{t('mods_plugins.steam.gmod.api_key_help_link', { defaultValue: 'Steam Community Developer' })}</a>.
                      </p>
                  </div>

                  <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">{t('mods_plugins.steam.gmod.collection_label', { defaultValue: 'Workshop Collection ID' })}</label>
                      <input 
                          type="text" 
                          value={collectionId}
                          onChange={(e) => setCollectionId(e.target.value)}
                          placeholder={t('mods_plugins.steam.gmod.collection_placeholder', { defaultValue: 'e.g. 123456789' })}
                          className="w-full bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-600 rounded-lg px-4 py-2.5 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
                      />
                      <p className="text-xs text-gray-500 dark:text-slate-500 mt-2">
                          {t('mods_plugins.steam.gmod.collection_help', { defaultValue: 'The ID at the end of your Steam Workshop Collection URL (?id=XXXXX).' })}
                      </p>
                  </div>

                  <div className="pt-6 mt-4 border-t border-gray-200 dark:border-slate-700 flex items-center justify-between">
                      <span className={`text-sm font-medium ${saveMessageGmod.includes('Failed') ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                          {saveMessageGmod}
                      </span>
                      <button 
                          onClick={handleSaveGmodCollection}
                          disabled={isSavingGmod}
                          className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 px-6 rounded-lg transition-colors shadow-sm disabled:opacity-50"
                      >
                          {isSavingGmod ? t('mods_plugins.steam.gmod.saving_btn', { defaultValue: 'Saving...' }) : t('mods_plugins.steam.gmod.save_btn', { defaultValue: 'Save & Sync' })}
                      </button>
                  </div>
              </div>
          </div>
      );
  }

  // If the game has no supported mod integration at all, don't render the tab content
  if (!isRust && !isSatisfactory && !supportsWorkshop) {
      return (
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 flex flex-col items-center justify-center text-center p-8 min-h-[500px]">
            <QueueListIcon className="w-16 h-16 mb-4 text-gray-300 dark:text-gray-600" />
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">{t('mods_plugins.steam.unsupported.title', { defaultValue: 'No Mod Manager Available' })}</h2>
            <p className="text-gray-600 dark:text-gray-400 max-w-md">{t('mods_plugins.steam.unsupported.desc', { game: server?.name || 'this game', defaultValue: `Our automated mod manager does not currently support ${server?.name || 'this game'}. You can still install mods manually using the File Manager tab.` })}</p>
        </div>
      );
  }

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 overflow-hidden flex flex-col h-[700px]">
      <div className="absolute top-20 right-6 z-20 w-96 space-y-2 pointer-events-none">
        {success && (<div className="bg-green-50 text-green-700 p-4 rounded-xl shadow-lg border border-green-100 flex items-start gap-3 pointer-events-auto animate-in fade-in slide-in-from-right-4"><CheckCircleIcon className="w-5 h-5 mt-0.5 shrink-0" /><div className="flex-1 text-sm">{success}</div><button onClick={() => setSuccess(null)} className="hover:text-green-800"><XCircleIcon className="w-5 h-5" /></button></div>)}
        {error && (<div className="bg-red-50 text-red-700 p-4 rounded-xl shadow-lg border border-red-100 flex items-start gap-3 pointer-events-auto animate-in fade-in slide-in-from-right-4"><ExclamationCircleIcon className="w-5 h-5 mt-0.5 shrink-0" /><div className="flex-1 text-sm">{error}</div><button onClick={() => setError(null)} className="hover:text-red-800"><XCircleIcon className="w-5 h-5" /></button></div>)}
      </div>

      <div className="border-b border-gray-200 dark:border-slate-700 bg-gray-50/50 dark:bg-slate-900/50 p-2 flex justify-between items-center overflow-x-auto">
        <div className="flex gap-2 min-w-max">
            <button onClick={() => setViewMode('browse')} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${viewMode === 'browse' ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm border border-gray-200 dark:border-slate-600' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-800 border border-transparent'}`}><MagnifyingGlassIcon className="w-4 h-4" /> {t('mods_plugins.steam.view_browse', { defaultValue: 'Browse Catalog' })}</button>            
            <button onClick={() => setViewMode('installed')} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${viewMode === 'installed' ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm border border-gray-200 dark:border-slate-600' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-800 border border-transparent'}`}><QueueListIcon className="w-4 h-4" /> {isRust ? t('mods_plugins.steam.view_installed_plugins', { defaultValue: 'Installed Plugins' }) : t('mods_plugins.steam.view_installed_mods', { defaultValue: 'Installed Mods' })}</button>
        </div>
        {isRust && isOxideInstalled && (
            <button onClick={handleInstallOxide} disabled={loadingOxide || server.game_status !== 'Stopped'} title={server.game_status !== 'Stopped' ? t('mods_plugins.steam.rust.server_must_stop', { defaultValue: 'Server must be stopped' }) : t('mods_plugins.steam.update_oxide', { defaultValue: 'Update Oxide' })} className="text-xs font-bold px-3 py-1.5 bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-400 rounded-lg hover:bg-indigo-200 transition-colors disabled:opacity-50 flex items-center gap-1 min-w-max ml-4">
                {loadingOxide ? <div className="w-3 h-3 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" /> : <ArrowDownTrayIcon className="w-3 h-3" />} {t('mods_plugins.steam.update_oxide', { defaultValue: 'Update Oxide' })}
            </button>
        )}
      </div>

      {viewMode === 'browse' && (
        <div className="flex flex-col h-full overflow-hidden">
            <div className="p-4 border-b border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 flex gap-3 shrink-0">
                <div className="relative flex-1">
                <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 dark:text-gray-500" />
                <input type="text" placeholder={isRust ? t('mods_plugins.search.placeholder_umod', { defaultValue: 'Search uMod Plugins...' }) : supportsWorkshop ? t('mods_plugins.search.placeholder_workshop', { defaultValue: 'Search Steam Workshop...' }) : t('mods_plugins.search.placeholder_ficsit', { defaultValue: 'Search FICSIT Mod Repository...' })} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSearch(e)} className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-300 dark:border-slate-600 dark:bg-slate-800 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all" />
                </div>
                <button onClick={handleSearch} disabled={loadingCatalog} className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded-lg font-medium shadow-sm transition-colors disabled:opacity-50">{isSearching ? t('mods_plugins.search.searching', { defaultValue: 'Searching...' }) : t('mods_plugins.search.button', { defaultValue: 'Search' })}</button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 bg-gray-50/50 dark:bg-slate-900/50">
                {loadingCatalog && currentPage === 1 ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-500 dark:text-gray-400"><div className="animate-spin rounded-full h-8 w-8 border-4 border-indigo-600 border-t-transparent mb-3" /><p>{t('mods_plugins.catalog.scanning', { defaultValue: 'Scanning database...' })}</p></div>
                ) : catalog.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-400"><CpuChipIcon className="w-16 h-16 mb-4 opacity-20" /><p className="text-lg font-medium text-gray-500 dark:text-gray-400">{t('mods_plugins.catalog.empty_results', { defaultValue: 'No results found' })}</p></div>
                ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {catalog.map((item) => (
                    <div key={item.mod_id} className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-4 hover:border-indigo-300 hover:shadow-md transition-all flex flex-col">
                        <div className="flex gap-4 mb-3">
                        {item.icon ? (
                            <img src={item.icon} alt="" className="w-12 h-12 rounded-lg bg-gray-100 dark:bg-slate-700 object-cover shrink-0" />
                        ) : (
                            <div className="w-12 h-12 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 flex items-center justify-center text-indigo-600 font-bold text-xl shrink-0">{item.name.charAt(0).toUpperCase()}</div>
                        )}
                        <div className="flex-1 min-w-0"><h3 className="font-bold text-gray-900 dark:text-gray-100 truncate" title={item.name}>{item.name}</h3><p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1 mt-1"><ArrowDownTrayIcon className="w-3 h-3" />{item.downloads ? item.downloads.toLocaleString() : 'N/A'}</p></div>
                        </div>
                        <p className="text-xs text-gray-600 dark:text-gray-300 line-clamp-3 mb-4 flex-1 leading-relaxed">{item.description || t('mods_plugins.item.no_description', { defaultValue: "No description provided." })}</p>
                        
                        {isRust || supportsWorkshop ? (
                            <button onClick={() => handleInstall(item)} disabled={loadingInstall === item.mod_id} className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg text-sm shadow-sm transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                                {loadingInstall === item.mod_id ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : null}
                                {supportsWorkshop && (server.game === 'arma3' || server.game === 'dayz') ? t('mods_plugins.steam.install_mod_keys', { defaultValue: 'Install Mod & Keys' }) : t('mods_plugins.steam.download_install', { defaultValue: 'Download & Install' })}
                            </button>
                        ) : (
                            <button onClick={() => fetchVersions(item)} className="w-full py-2 bg-gray-50 dark:bg-slate-700 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 text-indigo-700 dark:text-indigo-400 font-medium rounded-lg text-sm border border-gray-200 dark:border-slate-600 hover:border-indigo-200 dark:hover:border-indigo-600 transition-colors">{t('mods_plugins.item.select_version', { defaultValue: 'Select Version' })}</button>
                        )}
                    </div>
                    ))}
                </div>
                )}
                {catalog.length > 0 && hasMoreResults && (<div className="mt-6 text-center"><button onClick={handleLoadMore} disabled={loadingCatalog} className="px-6 py-2 bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-700 text-gray-700 dark:text-gray-300 rounded-full text-sm font-medium hover:bg-gray-50 dark:hover:bg-slate-700/50 shadow-sm transition-all disabled:opacity-50">{loadingCatalog ? t('mods_plugins.catalog.loading_more', { defaultValue: 'Loading...' }) : t('mods_plugins.catalog.load_more', { defaultValue: 'Load More' })}</button></div>)}
            </div>
        </div>
      )}

      {viewMode === 'installed' && (
        <div className="flex-1 overflow-y-auto p-4 bg-gray-50/50 dark:bg-slate-900/50">
            {loadingInstalled ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-500 dark:text-gray-400"><div className="animate-spin rounded-full h-8 w-8 border-4 border-indigo-600 border-t-transparent mb-3" /><p>{t('mods_plugins.steam.scanning_folder', { defaultValue: 'Scanning folder...' })}</p></div>
            ) : (!isRust && !supportsWorkshop && Object.keys(installedMods).length === 0) || ((isRust || supportsWorkshop) && installedMods.length === 0) ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-400"><QueueListIcon className="w-16 h-16 mb-4 opacity-20" /><p className="text-lg font-medium text-gray-500 dark:text-gray-400">{isRust ? t('mods_plugins.steam.empty_installed_plugins', { defaultValue: 'No plugins currently installed.' }) : t('mods_plugins.steam.empty_installed_mods', { defaultValue: 'No mods currently installed.' })}</p><button onClick={() => setViewMode('browse')} className="mt-4 text-indigo-600 dark:text-indigo-400 hover:underline font-medium">{t('mods_plugins.steam.browse_catalog_link', { defaultValue: 'Browse the Catalog' })}</button></div>
            ) : (
                <div className="max-w-4xl mx-auto space-y-3">
                    <div className="flex items-center justify-between px-2 mb-4">
                        <h3 className="font-bold text-gray-900 dark:text-gray-100">{isRust ? t('mods_plugins.steam.installed_title_plugins', { defaultValue: 'Installed Plugins' }) : t('mods_plugins.steam.installed_title_mods', { defaultValue: 'Installed Mods' })}</h3>
                        <p className="text-xs text-gray-500 dark:text-gray-400">{isRust ? t('mods_plugins.steam.read_from_oxide', { defaultValue: 'Read from oxide/plugins/' }) : supportsWorkshop ? t('mods_plugins.steam.read_from_workshop', { appId: clientAppId, defaultValue: `Read from workshop/content/${clientAppId}/` }) : t('mods_plugins.steam.read_from_profiles', { defaultValue: 'Read from profiles.json' })}</p>
                    </div>
                    {isRust || supportsWorkshop ? (
                        installedMods.map((file) => (
                            <div key={file.name} className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 p-4 rounded-xl flex items-center justify-between gap-4 hover:border-indigo-300 dark:hover:border-indigo-600 transition-colors">
                                <div className="flex items-center gap-4 flex-1 min-w-0">
                                    {file.preview_url ? (
                                        <img src={file.preview_url} alt="" className="w-12 h-12 rounded-lg bg-gray-100 dark:bg-slate-700 object-cover shrink-0" />
                                    ) : (
                                        <div className="w-12 h-12 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 flex items-center justify-center text-indigo-600 shrink-0">
                                            {supportsWorkshop ? <PuzzlePieceIcon className="w-6 h-6" /> : <CodeBracketIcon className="w-6 h-6" />}
                                        </div>
                                    )}
                                    <div className="flex-1 min-w-0">
                                        <h4 className="font-bold text-gray-900 dark:text-gray-100 truncate" title={file.title || file.name}>
                                            {file.title || file.name}
                                        </h4>
                                        <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-3 mt-1">
                                            <span className="font-mono bg-gray-100 dark:bg-slate-700 px-1.5 py-0.5 rounded text-[10px]">
                                                {supportsWorkshop ? `ID: ${file.name}` : t('mods_plugins.steam.type_script', { defaultValue: 'C# Script' })}
                                            </span>
                                            {file.modified && <span>{new Date(file.modified).toLocaleDateString()}</span>}
                                        </div>
                                    </div>
                                </div>
                                <button onClick={() => handleUninstall(file.name)} disabled={loadingUninstall === file.name} className="shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium text-red-600 bg-red-50 hover:bg-red-100 dark:bg-red-900/20 transition-colors disabled:opacity-50 border border-red-100 dark:border-red-900/30">
                                    {loadingUninstall === file.name ? (<div className="w-4 h-4 border-2 border-red-600 border-t-transparent rounded-full animate-spin" />) : (<TrashIcon className="w-4 h-4" />)} {t('mods_plugins.steam.btn_delete', { defaultValue: 'Delete' })}
                                </button>
                            </div>
                        ))
                    ) : (
                        Object.entries(installedMods).map(([slug, details]) => (
                            <div key={slug} className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 p-4 rounded-xl flex items-center justify-between gap-4 hover:border-indigo-300 dark:hover:border-indigo-600 transition-colors">
                                <div className="flex items-center gap-4 flex-1 min-w-0">
                                    <div className="w-10 h-10 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 flex items-center justify-center text-indigo-600 font-bold text-lg shrink-0">{slug.charAt(0).toUpperCase()}</div>
                                    <div className="flex-1 min-w-0">
                                        <h4 className="font-bold text-gray-900 dark:text-gray-100 truncate">{slug}</h4>
                                        <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-3 mt-1">
                                            <span className="font-mono bg-gray-100 dark:bg-slate-700 px-1.5 py-0.5 rounded">v{details.version.replace('>=', '')}</span>
                                            {details.enabled ? (<span className="text-green-600 font-medium flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-green-500" /> {t('mods_plugins.steam.status_enabled', { defaultValue: 'Enabled' })}</span>) : (<span className="text-gray-400 font-medium flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-gray-400" /> {t('mods_plugins.steam.status_disabled', { defaultValue: 'Disabled' })}</span>)}
                                        </div>
                                    </div>
                                </div>
                                <button onClick={() => handleUninstall(slug)} disabled={loadingUninstall === slug} className="shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium text-red-600 bg-red-50 hover:bg-red-100 dark:bg-red-900/20 transition-colors disabled:opacity-50 border border-red-100 dark:border-red-900/30">
                                    {loadingUninstall === slug ? (<div className="w-4 h-4 border-2 border-red-600 border-t-transparent rounded-full animate-spin" />) : (<TrashIcon className="w-4 h-4" />)} {t('mods_plugins.steam.btn_uninstall', { defaultValue: 'Uninstall' })}
                                </button>
                            </div>
                        ))
                    )}
                </div>
            )}
        </div>
      )}

      {selectedItem && isSatisfactory && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex justify-center items-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="p-5 border-b border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-700"><div className="flex justify-between items-start"><div className="flex-1 pr-4"><h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">{selectedItem.name}</h3><p className="text-sm text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">{selectedItem.description}</p></div><button onClick={() => setSelectedItem(null)} className="p-1 rounded-full hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-500 dark:text-gray-400 transition-colors"><XCircleIcon className="w-6 h-6" /></button></div></div>
            <div className="overflow-y-auto p-4 flex-1 bg-gray-50/30 dark:bg-slate-900/50 scrollbar-thin">
              {loadingVersions ? (<div className="py-12 flex flex-col items-center text-gray-400"><div className="animate-spin rounded-full h-6 w-6 border-2 border-indigo-600 border-t-transparent mb-2" /><p className="text-sm">{t('mods_plugins.modal.loading_versions', { defaultValue: 'Fetching available versions...' })}</p></div>) : selectedVersions.length === 0 ? (<div className="py-12 flex flex-col items-center text-gray-400"><p className="text-sm">{t('mods_plugins.modal.empty_versions', { defaultValue: 'No versions found for this mod.' })}</p></div>) : (
                <div className="space-y-3">
                  {selectedVersions.map((v) => (
                    <div key={v.id} className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 p-3 rounded-xl flex items-center justify-between gap-3 hover:border-indigo-300 transition-colors">
                      <div className="flex-1 min-w-0"><span className="font-bold text-gray-900 dark:text-gray-100 text-sm">v{v.name}</span><div className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-3 mt-1"><span>{t('mods_plugins.modal.sml_required', { defaultValue: 'SML Required:' })} <span className="font-mono font-semibold text-indigo-600">v{v.smlVersion || t('mods_plugins.modal.any', { defaultValue: 'Any' })}</span></span><span>•</span><span>{new Date(v.fileDate).toLocaleDateString()}</span></div></div>
                      <button onClick={() => handleInstall(selectedItem, v)} disabled={loadingInstall === item.mod_id} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium shadow-sm transition-all disabled:opacity-50">{loadingInstall === item.mod_id ? t('mods_plugins.modal.installing_btn', { defaultValue: 'Installing...' }) : t('mods_plugins.modal.install_btn', { defaultValue: 'Install' })}</button>
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