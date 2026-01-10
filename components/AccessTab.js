import { useState, useEffect } from 'react';
import { useTranslation } from 'next-i18next';
import { TrashIcon, UserPlusIcon, PencilIcon, XMarkIcon, ClockIcon, ClipboardDocumentListIcon } from '@heroicons/react/24/outline';
import { supabase } from '../lib/supabaseClient';

export default function AccessTab({ server }) {
  const { t } = useTranslation('common');
  const [users, setUsers] = useState([]);
  const [logs, setLogs] = useState([]); // [NEW] Logs state
  const [loading, setLoading] = useState(true);
  
  // Form State
  const [inviteEmail, setInviteEmail] = useState('');
  const [editingUser, setEditingUser] = useState(null); 
  
  // Full Permission Set Default State
  const defaultPerms = {
    control: true,
    console: false,
    files: false,
    settings: false,
    schedules: false,
    players: false,
    software: false,
    mods: false,
    world: false,
    backups: false
  };

  const [perms, setPerms] = useState(defaultPerms);

  useEffect(() => {
    fetchUsers();
    fetchLogs(); // [NEW] Fetch logs
  }, [server.id]);

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

  // [NEW] Fetch Logs Function
  const fetchLogs = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    
    const res = await fetch(`/api/servers/${server.id}/audit-logs`, {
      headers: { Authorization: `Bearer ${session.access_token}` }
    });
    if (res.ok) {
      const data = await res.json();
      setLogs(data.logs || []);
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

      {/* [NEW] Action Logs Section */}
      <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700">
        <h3 className="text-lg font-bold mb-6 text-gray-900 dark:text-white flex items-center gap-2">
          <ClipboardDocumentListIcon className="w-5 h-5" /> Activity Logs
        </h3>
        
        <div className="overflow-hidden border border-gray-200 dark:border-slate-700 rounded-xl">
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
                  <td colSpan="4" className="px-6 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                    No activity recorded yet.
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50 dark:hover:bg-slate-700/50">
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
      </div>
    </div>
  );
}