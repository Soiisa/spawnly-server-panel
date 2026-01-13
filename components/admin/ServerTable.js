import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import FileManager from '../FileManager';
import { 
  MagnifyingGlassIcon, 
  ServerIcon, 
  TrashIcon, 
  StopCircleIcon,
  CpuChipIcon,
  FolderIcon,
  XMarkIcon
} from "@heroicons/react/24/outline";

export default function ServerTable() {
  const [servers, setServers] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  // State for File Manager Modal
  const [viewingServer, setViewingServer] = useState(null);
  const [adminToken, setAdminToken] = useState(null);

  useEffect(() => {
    fetchServers();
  }, [search]);

  const fetchServers = async () => {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    try {
      const query = search ? `?search=${encodeURIComponent(search)}` : '';
      const res = await fetch(`/api/admin/servers${query}`, {
        headers: { Authorization: `Bearer ${session.access_token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setServers(data.servers);
      }
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const handleOpenFiles = async (server) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      setAdminToken(session.access_token);
      setViewingServer(server);
    }
  };

  const handleAction = async (action, serverId, serverName) => {
    const actionText = action === 'force_stop' ? 'FORCE STOP' : 'DELETE';
    if (!confirm(`WARNING: Are you sure you want to ${actionText} server "${serverName}"?\n\nThis will immediately terminate the VPS.`)) return;

    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch('/api/admin/servers', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}` 
      },
      body: JSON.stringify({ action, serverId })
    });

    if (res.ok) {
      fetchServers();
    } else {
      alert(`Failed to ${action} server.`);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'Running': return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
      case 'Stopped': return 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-400';
      case 'Starting': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden h-full flex flex-col relative">
      
      {/* File Manager Modal */}
      {viewingServer && adminToken && (
        <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6">
          <div className="bg-white dark:bg-slate-900 w-full max-w-6xl h-[90vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-slate-200 dark:border-slate-700 animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-950">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg">
                  <FolderIcon className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                    File Manager
                  </h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400 font-mono">
                    {viewingServer.name}
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setViewingServer(null)}
                className="p-2 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-full transition-colors text-slate-500 dark:text-slate-400"
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>
            
            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto bg-slate-50 dark:bg-slate-950 p-4">
              <FileManager 
                server={viewingServer} 
                token={adminToken} 
                isAdmin={true} 
                setActiveTab={() => {}} 
              />
            </div>
          </div>
        </div>
      )}

      {/* Header & Search */}
      <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row justify-between items-center gap-4">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
          <ServerIcon className="h-5 w-5 text-indigo-500" />
          Server Master List
        </h2>
        <div className="relative w-full sm:w-auto">
          <MagnifyingGlassIcon className="h-5 w-5 absolute left-3 top-2.5 text-slate-400" />
          <input 
            type="text" 
            placeholder="Search name, owner..." 
            className="pl-10 pr-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:ring-2 focus:ring-indigo-500 outline-none w-full sm:w-64"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto flex-grow">
        <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800">
          <thead className="bg-slate-50 dark:bg-slate-950">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Server Info</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Owner</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Resources</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Status</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Admin Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-slate-900 divide-y divide-slate-200 dark:divide-slate-800">
            {loading ? (
               <tr><td colSpan="5" className="px-6 py-4 text-center text-slate-500">Scanning network...</td></tr>
            ) : servers.length === 0 ? (
               <tr><td colSpan="5" className="px-6 py-4 text-center text-slate-500">No servers found.</td></tr>
            ) : (
              servers.map((server) => (
                <tr key={server.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-slate-900 dark:text-white">{server.name}</div>
                    <div className="text-xs text-slate-500 font-mono">{server.subdomain}.spawnly.net</div>
                    {server.hetzner_id && <div className="text-[10px] text-indigo-400 font-mono">HZ-ID: {server.hetzner_id}</div>}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-slate-700 dark:text-slate-300">{server.owner_email}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center text-sm text-slate-600 dark:text-slate-400 gap-1">
                      <CpuChipIcon className="h-4 w-4" />
                      {server.ram} GB
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(server.status)}`}>
                      {server.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex justify-end gap-3">
                      <button
                        onClick={() => handleOpenFiles(server)}
                        className="text-indigo-600 hover:text-indigo-900 dark:text-indigo-400 dark:hover:text-indigo-300"
                        title="Browse Files"
                      >
                        <FolderIcon className="h-5 w-5" />
                      </button>
                      <button 
                        onClick={() => handleAction('force_stop', server.id, server.name)}
                        disabled={server.status === 'Stopped'}
                        className={`text-orange-600 hover:text-orange-900 dark:text-orange-400 dark:hover:text-orange-300 ${server.status === 'Stopped' ? 'opacity-30 cursor-not-allowed' : ''}`}
                        title="Force Stop (Kill VPS)"
                      >
                        <StopCircleIcon className="h-5 w-5" />
                      </button>
                      <button 
                        onClick={() => handleAction('delete', server.id, server.name)}
                        className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300"
                        title="Delete Permanently"
                      >
                        <TrashIcon className="h-5 w-5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}