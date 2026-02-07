import { useState, useEffect } from 'react';
import { useTranslation } from 'next-i18next';
import { 
  TrashIcon, UserPlusIcon, PencilIcon, XMarkIcon, 
  ClipboardDocumentListIcon, MagnifyingGlassIcon, 
  ChevronLeftIcon, ChevronRightIcon 
} from '@heroicons/react/24/outline';
import { supabase } from '../lib/supabaseClient';

export default function AccessTab({ server }) {
  const { t } = useTranslation('common');
  const [users, setUsers] = useState([]);
  
  // Logs State
  const [logs, setLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalLogs, setTotalLogs] = useState(0);
  const [search, setSearch] = useState('');
  
  const [loading, setLoading] = useState(true);
  
  // Form State
  const [inviteEmail, setInviteEmail] = useState('');
  const [editingUser, setEditingUser] = useState(null); 
  
  const defaultPerms = {
    control: true, console: false, files: false, settings: false,
    schedules: false, players: false, software: false, mods: false,
    world: false, backups: false
  };

  const [perms, setPerms] = useState(defaultPerms);

  useEffect(() => {
    fetchUsers();
    // fetchLogs called via debounced effect below
  }, [server.id]);

  // Debounced Search & Pagination Effect
  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      fetchLogs(page, search);
    }, 500);

    return () => clearTimeout(delayDebounceFn);
  }, [search, page, server.id]);

  const fetchUsers = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(`/api/servers/${server.id}/users`, {
      headers: { Authorization: `Bearer ${session.access_token}` }
    });
    if (res.ok) {
      const data = await res.json();
      setUsers(data.users);
    }
    setLoading(false);
  };

  const fetchLogs = async (pageNum = 1, searchQuery = '') => {
    setLogsLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    
    const query = new URLSearchParams({
        page: pageNum,
        limit: 10,
        search: searchQuery
    });

    try {
        const res = await fetch(`/api/servers/${server.id}/audit-logs?${query.toString()}`, {
            headers: { Authorization: `Bearer ${session.access_token}` }
        });
        if (res.ok) {
            const data = await res.json();
            setLogs(data.logs || []);
            setTotalPages(data.totalPages || 1);
            setTotalLogs(data.total || 0);
        }
    } catch (e) {
        console.error("Failed to fetch logs", e);
    } finally {
        setLogsLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const { data: { session } } = await supabase.auth.getSession();
    
    const method = editingUser ? 'PUT' : 'POST';
    const body = editingUser 
      ? { permissionId: editingUser.id, permissions: perms }
      : { email: inviteEmail, permissions: perms };

    const res = await fetch(`/api/servers/${server.id}/users`, {
      method,
      headers: { 
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}` 
      },
      body: JSON.stringify(body)
    });

    if (res.ok) {
      resetForm();
      fetchUsers();
    } else {
      alert('Operation failed');
    }
  };

  const startEdit = (u) => {
    setEditingUser(u);
    setInviteEmail(u.email);
    setPerms({ ...defaultPerms, ...u.permissions });
  };

  const resetForm = () => {
    setEditingUser(null);
    setInviteEmail('');
    setPerms(defaultPerms);
  };

  const removeUser = async (permId) => {
    if(!confirm('Revoke access?')) return;
    const { data: { session } } = await supabase.auth.getSession();
    await fetch(`/api/servers/${server.id}/users`, {
      method: 'DELETE',
      headers: { 
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}` 
      },
      body: JSON.stringify({ permissionId: permId })
    });
    fetchUsers();
  };

  const PermissionCheckbox = ({ label, pKey }) => (
    <label className="flex items-center gap-2 cursor-pointer p-2 rounded hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors">
        <input 
            type="checkbox" 
            checked={perms[pKey]} 
            onChange={e => setPerms({...perms, [pKey]: e.target.checked})} 
            className="rounded text-indigo-600 focus:ring-indigo-500 bg-gray-100 dark:bg-slate-800 border-gray-300 dark:border-slate-600" 
        />
        <span className="text-sm text-gray-700 dark:text-gray-300 select-none">{label}</span>
    </label>
  );

  return (
    <div className="space-y-8">
      {/* Access Management Section */}
      <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700">
        <h3 className="text-lg font-bold mb-6 text-gray-900 dark:text-white flex items-center gap-2">
          <UserPlusIcon className="w-5 h-5" /> {editingUser ? 'Edit Permissions' : 'Manage Access'}
        </h3>

        {/* Form */}
        <form onSubmit={handleSubmit} className="mb-8 bg-gray-50 dark:bg-slate-900 p-4 rounded-xl border border-gray-200 dark:border-slate-700">
          <div className="flex gap-4 mb-4">
            <input
              type="email"
              required
              placeholder="User Email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              disabled={!!editingUser} 
              className="flex-1 rounded-lg border-gray-300 dark:border-slate-600 dark:bg-slate-800 dark:text-white disabled:opacity-50 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none p-2"
            />
            <button type="submit" className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 font-medium transition-colors">
              {editingUser ? 'Update' : 'Invite'}
            </button>
            {editingUser && (
              <button type="button" onClick={resetForm} className="bg-gray-200 text-gray-700 px-3 py-2 rounded-lg hover:bg-gray-300 transition-colors">
                <XMarkIcon className="w-5 h-5" />
              </button>
            )}
          </div>
          
          <div className="border-t border-gray-200 dark:border-slate-700 pt-4">
              <p className="text-xs font-semibold text-gray-500 uppercase mb-3 tracking-wider">Permissions</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <PermissionCheckbox label="Control (Start/Stop)" pKey="control" />
                  <PermissionCheckbox label="Console Access" pKey="console" />
                  <PermissionCheckbox label="File Manager" pKey="files" />
                  <PermissionCheckbox label="Settings (Properties)" pKey="settings" />
                  <PermissionCheckbox label="Schedules" pKey="schedules" />
                  <PermissionCheckbox label="Player Manager" pKey="players" />
                  <PermissionCheckbox label="Change Software" pKey="software" />
                  <PermissionCheckbox label="Mods & Plugins" pKey="mods" />
                  <PermissionCheckbox label="World Manager" pKey="world" />
                  <PermissionCheckbox label="Backups" pKey="backups" />
              </div>
          </div>
        </form>

        {/* Users List */}
        <div className="space-y-3">
          {users.length === 0 && !loading && (
              <p className="text-center text-gray-500 dark:text-gray-400 py-4">No users have been granted access yet.</p>
          )}
          {users.map((u) => {
             const activeCount = Object.values(u.permissions || {}).filter(Boolean).length;
             return (
              <div key={u.id} className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${editingUser?.id === u.id ? 'bg-indigo-50 border-indigo-200 dark:bg-indigo-900/20 dark:border-indigo-800' : 'bg-gray-50 dark:bg-slate-700/50 border-gray-100 dark:border-slate-700'}`}>
                  <div>
                  <p className="font-medium text-gray-900 dark:text-white">{u.email}</p>
                  <p className="text-xs text-gray-500 mt-1">
                      {activeCount} active permissions
                  </p>
                  </div>
                  <div className="flex items-center gap-2">
                      <button onClick={() => startEdit(u)} className="text-gray-500 hover:text-indigo-600 p-2 rounded hover:bg-gray-200 dark:hover:bg-slate-600 transition-colors" title="Edit Permissions">
                          <PencilIcon className="w-5 h-5" />
                      </button>
                      <button onClick={() => removeUser(u.id)} className="text-red-500 hover:text-red-700 p-2 rounded hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors" title="Revoke Access">
                          <TrashIcon className="w-5 h-5" />
                      </button>
                  </div>
              </div>
             )
          })}
        </div>
      </div>

      {/* Action Logs Section */}
      <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700">
        <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <ClipboardDocumentListIcon className="w-5 h-5" /> Activity Logs
            </h3>
            
            {/* Search Input */}
            <div className="relative w-full sm:w-64">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <MagnifyingGlassIcon className="h-4 w-4 text-gray-400" />
                </div>
                <input
                    type="text"
                    placeholder="Search logs..."
                    value={search}
                    onChange={(e) => {
                        setSearch(e.target.value);
                        setPage(1); // Reset to page 1 on search
                    }}
                    className="block w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-gray-50 dark:bg-slate-900 text-sm text-gray-900 dark:text-white focus:ring-indigo-500 focus:border-indigo-500"
                />
            </div>
        </div>
        
        <div className="overflow-hidden border border-gray-200 dark:border-slate-700 rounded-xl relative">
          {logsLoading && (
              <div className="absolute inset-0 bg-white/50 dark:bg-slate-900/50 flex items-center justify-center z-10">
                  <div className="animate-spin rounded-full h-8 w-8 border-2 border-indigo-600 border-t-transparent"></div>
              </div>
          )}
          <table className="min-w-full divide-y divide-gray-200 dark:divide-slate-700">
            <thead className="bg-gray-50 dark:bg-slate-900">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">User</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Action</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Details</th>
                <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Time</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-slate-800 divide-y divide-gray-200 dark:divide-slate-700">
              {logs.length === 0 ? (
                <tr>
                  <td colSpan="4" className="px-6 py-12 text-center text-sm text-gray-500 dark:text-gray-400">
                    {search ? 'No logs found matching your search.' : 'No activity recorded yet.'}
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                      {log.users?.email || 'System / Unknown'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-indigo-600 dark:text-indigo-400 font-medium">
                      {log.action_type}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-300 max-w-xs truncate" title={log.details}>
                      {log.details || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-500 dark:text-gray-400">
                      {new Date(log.created_at).toLocaleString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls */}
        {totalLogs > 0 && (
            <div className="flex items-center justify-between mt-4 px-2">
                <div className="text-sm text-gray-500 dark:text-gray-400">
                    Showing <span className="font-medium">{(page - 1) * 10 + 1}</span> to <span className="font-medium">{Math.min(page * 10, totalLogs)}</span> of <span className="font-medium">{totalLogs}</span> results
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setPage(p => Math.max(1, p - 1))}
                        disabled={page === 1}
                        className="p-2 rounded-lg border border-gray-200 dark:border-slate-700 text-gray-500 hover:bg-gray-50 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        <ChevronLeftIcon className="w-4 h-4" />
                    </button>
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300 px-2">
                        Page {page} of {totalPages}
                    </span>
                    <button
                        onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                        disabled={page === totalPages}
                        className="p-2 rounded-lg border border-gray-200 dark:border-slate-700 text-gray-500 hover:bg-gray-50 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        <ChevronRightIcon className="w-4 h-4" />
                    </button>
                </div>
            </div>
        )}
      </div>
    </div>
  );
}