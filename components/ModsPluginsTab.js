// components/ModsPluginsTab.js
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

export default function ModsPluginsTab({ server }) {
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

  // Fetch catalog based on server type and version
  const fetchCatalog = async (page = 1, isNewSearch = false) => {
    if (!server?.type || !server?.version) return;

    setLoadingCatalog(true);
    setError(null);
    try {
      let items = [];
      let totalItems = 0;
      const pageSize = 20;

      if (server.type === 'paper' || server.type === 'spigot') {
        const apiUrl = searchQuery
          ? `https://api.spiget.org/v2/search/resources/${encodeURIComponent(searchQuery)}?size=${pageSize}&page=${page}&sort=-downloads&fields=id,name,description,version,downloads,file,testedVersions`
          : `https://api.spiget.org/v2/resources?size=${pageSize}&page=${page}&sort=-downloads&fields=id,name,description,version,downloads,file,testedVersions`;

        const spigetRes = await fetch(apiUrl);
        const spigetData = await spigetRes.json();

        totalItems = 1000;
        items = spigetData
          .filter(item => !item.testedVersions || item.testedVersions.includes(server.version))
          .map(item => ({
            id: item.id,
            name: item.name,
            description: item.description,
            version: item.version.name,
            downloads: item.downloads,
            source: 'spiget',
            type: 'plugin',
            downloadUrl: `https://api.spiget.org/v2/resources/${item.id}/download`
          }));
      } else if (server.type === 'forge' || server.type === 'fabric') {
        const loader = server.type === 'forge' ? 'forge' : 'fabric';
        const apiUrl = searchQuery
          ? `https://api.modrinth.com/v2/search?query=${encodeURIComponent(searchQuery)}&facets=[["categories:${loader}"],["versions:${server.version}"]]&limit=${pageSize}&offset=${(page - 1) * pageSize}`
          : `https://api.modrinth.com/v2/search?facets=[["categories:${loader}"],["versions:${server.version}"]]&limit=${pageSize}&offset=${(page - 1) * pageSize}`;

        const modrinthRes = await fetch(apiUrl);
        const modrinthData = await modrinthRes.json();

        totalItems = modrinthData.total_hits;
        items = modrinthData.hits.map(item => ({
          id: item.project_id,
          name: item.title,
          description: item.description,
          version: item.latest_version,
          downloads: item.downloads,
          source: 'modrinth',
          type: 'mod',
          downloadUrl: `https://api.modrinth.com/v2/project/${item.project_id}/version/${item.latest_version}/file`
        }));
      }

      const totalPages = Math.ceil(totalItems / pageSize);
      setTotalPages(totalPages);
      setHasMoreResults(page < totalPages);

      if (isNewSearch || page === 1) {
        setCatalog(items);
      } else {
        setCatalog(prev => [...prev, ...items]);
      }
    } catch (error) {
      console.error('Error fetching catalog:', error);
      setError(`Failed to load catalog: ${error.message}`);
    } finally {
      setLoadingCatalog(false);
      setIsSearching(false);
    }
  };

  // Load catalog
  useEffect(() => {
    fetchCatalog(1, true);
    setCurrentPage(1);
  }, [server?.type, server?.version]);

  // Handle search submission
  const handleSearch = (e) => {
    if (e) e.preventDefault();
    setIsSearching(true);
    setCurrentPage(1);
    fetchCatalog(1, true);
  };

  // Handle load more
  const handleLoadMore = () => {
    const nextPage = currentPage + 1;
    setCurrentPage(nextPage);
    fetchCatalog(nextPage);
  };

  // Fetch versions for selected item
  useEffect(() => {
    const fetchVersions = async () => {
      if (!selectedItem) return;
      setSelectedVersions([]);
      try {
        let versions = [];
        if (selectedItem.source === 'spiget') {
          const res = await fetch(`https://api.spiget.org/v2/resources/${selectedItem.id}/versions?size=100&sort=-releaseDate`);
          if (!res.ok) throw new Error('Failed to fetch versions');
          const data = await res.json();
          versions = data.map(v => ({
            id: v.id,
            name: v.name,
            downloadUrl: `https://api.spiget.org/v2/resources/${selectedItem.id}/versions/${v.id}/download`,
            filename: `${selectedItem.name}-${v.name}.jar`
          }));
        } else if (selectedItem.source === 'modrinth') {
          const loader = server.type === 'forge' ? 'forge' : 'fabric';
          const res = await fetch(`https://api.modrinth.com/v2/project/${selectedItem.id}/version?game_versions=["${server.version}"]&loaders=["${loader}"]`);
          if (!res.ok) throw new Error('Failed to fetch versions');
          const data = await res.json();
          versions = data.map(v => {
            const primaryFile = v.files.find(f => f.primary) || v.files[0];
            return {
              id: v.id,
              name: v.version_number,
              downloadUrl: primaryFile.url,
              filename: primaryFile.filename
            };
          });
        }
        setSelectedVersions(versions);
      } catch (err) {
        setError(`Failed to load versions: ${err.message}`);
      }
    };
    fetchVersions();
  }, [selectedItem, server.type, server.version]);

  // Handle version install
  const handleVersionInstall = async (version) => {
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
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Installation failed');
      }
      setSuccess(`${selectedItem.name} (${version.name}) added successfully and will be installed when the server is started.`);
      setSelectedItem(null);
    } catch (error) {
      console.error('Installation error:', error);
      setError(`Failed to add ${selectedItem.name}: ${error.message}`);
    } finally {
      setLoadingInstall(false);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow p-6">
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

      <div>
        <form onSubmit={handleSearch} className="mb-6 flex gap-2">
          <input
            type="text"
            placeholder={`Search ${server.type === 'paper' || server.type === 'spigot' ? 'plugins' : 'mods'}...`}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 rounded border-gray-300 shadow-sm p-2"
          />
          <button
            type="submit"
            disabled={loadingCatalog}
            className="bg-indigo-600 hover:bg-indigo-700 text-white py-2 px-4 rounded-lg disabled:opacity-50"
          >
            {isSearching ? 'Searching...' : 'Search'}
          </button>
        </form>

        {loadingCatalog && currentPage === 1 ? (
          <div className="flex justify-center py-10">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600" />
          </div>
        ) : catalog.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            {searchQuery
              ? `No ${server.type === 'paper' || server.type === 'spigot' ? 'plugins' : 'mods'} found for "${searchQuery}"`
              : `No ${server.type === 'paper' || server.type === 'spigot' ? 'plugins' : 'mods'} found`}
          </div>
        ) : (
          <div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {catalog.map((item) => (
                <div
                  key={`${item.source}-${item.id}`}
                  className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-bold text-lg text-gray-900">{item.name}</h3>
                      <p className="text-gray-600 text-sm mt-1">{item.version}</p>
                    </div>
                    <span className="bg-indigo-100 text-indigo-800 text-xs px-2 py-1 rounded">
                      {item.downloads.toLocaleString()} downloads
                    </span>
                  </div>

                  {item.description && (
                    <p className="text-gray-700 mt-3 text-sm line-clamp-2">
                      {item.description.replace(/<\/?[^>]+(>|$)/g, "")}
                    </p>
                  )}

                  <button
                    onClick={() => setSelectedItem(item)}
                    disabled={loadingInstall}
                    className="mt-4 bg-indigo-600 hover:bg-indigo-700 text-white py-2 px-4 rounded-lg text-sm flex items-center disabled:opacity-50"
                  >
                    View Versions
                  </button>
                </div>
              ))}
            </div>

            {hasMoreResults && (
              <div className="mt-6 text-center">
                <button
                  onClick={handleLoadMore}
                  disabled={loadingCatalog}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white py-2 px-6 rounded-lg disabled:opacity-50"
                >
                  {loadingCatalog ? 'Loading more...' : 'Load More'}
                </button>
                <p className="mt-2 text-sm text-gray-500">
                  Page {currentPage} of {totalPages > 0 ? totalPages : 'many'}
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Versions Modal */}
      {selectedItem && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
          <div className="bg-white rounded-xl shadow-lg p-6 w-full max-w-2xl">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold">Versions for {selectedItem.name}</h3>
              <button
                onClick={() => setSelectedItem(null)}
                className="text-gray-400 hover:text-gray-500"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {selectedVersions.length === 0 ? (
              <div className="flex justify-center py-10">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600" />
              </div>
            ) : (
              <ul className="space-y-2 max-h-96 overflow-y-auto">
                {selectedVersions.map((version) => (
                  <li key={version.id} className="flex justify-between items-center border-b py-2">
                    <span>{version.name}</span>
                    <button
                      onClick={() => handleVersionInstall(version)}
                      disabled={loadingInstall}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white py-1 px-3 rounded-lg text-sm disabled:opacity-50"
                    >
                      {loadingInstall ? 'Installing...' : 'Install'}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}