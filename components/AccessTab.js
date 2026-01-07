import { useState, useEffect } from 'react';
import { useTranslation } from 'next-i18next';
import { TrashIcon, UserPlusIcon } from '@heroicons/react/24/outline';
import { supabase } from '../lib/supabaseClient';

export default function AccessTab({ server }) {
  const { t } = useTranslation('common');
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState('');
  
  // Default Permissions
  const [newPerms, setNewPerms] = useState({
    control: true,  // Start/Stop
    console: false, // View Console
    files: false    // Read/Write Files
  });

  useEffect(() => {
    fetchUsers();
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

  const inviteUser = async (e) => {
    e.preventDefault();
    const { data: { session } } = await supabase.auth.getSession();
    
    const res = await fetch(`/api/servers/${server.id}/users`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}` 
      },
      body: JSON.stringify({ email: inviteEmail, permissions: newPerms })
    });

    if (res.ok) {
      setInviteEmail('');
      fetchUsers();
    } else {
      alert('Failed to invite user (User must be registered)');
    }
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

  return (
    <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700">
      <h3 className="text-lg font-bold mb-6 text-gray-900 dark:text-white flex items-center gap-2">
        <UserPlusIcon className="w-5 h-5" /> Manage Access
      </h3>

      {/* Invite Form */}
      <form onSubmit={inviteUser} className="mb-8 bg-gray-50 dark:bg-slate-900 p-4 rounded-xl border border-gray-200 dark:border-slate-700">
        <div className="flex gap-4 mb-4">
          <input
            type="email"
            required
            placeholder="User Email (must be registered)"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            className="flex-1 rounded-lg border-gray-300 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
          />
          <button type="submit" className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 font-medium">
            Invite
          </button>
        </div>
        
        <div className="flex gap-6 text-sm">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={newPerms.control} onChange={e => setNewPerms({...newPerms, control: e.target.checked})} className="rounded text-indigo-600 focus:ring-indigo-500" />
            <span className="text-gray-700 dark:text-gray-300">Control (Start/Stop)</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={newPerms.console} onChange={e => setNewPerms({...newPerms, console: e.target.checked})} className="rounded text-indigo-600 focus:ring-indigo-500" />
            <span className="text-gray-700 dark:text-gray-300">Console</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={newPerms.files} onChange={e => setNewPerms({...newPerms, files: e.target.checked})} className="rounded text-indigo-600 focus:ring-indigo-500" />
            <span className="text-gray-700 dark:text-gray-300">Files</span>
          </label>
        </div>
      </form>

      {/* Users List */}
      <div className="space-y-3">
        {users.map((u) => (
          <div key={u.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-slate-700/50 rounded-lg border border-gray-100 dark:border-slate-700">
            <div>
              <p className="font-medium text-gray-900 dark:text-white">{u.email}</p>
              <p className="text-xs text-gray-500 flex gap-2 mt-1">
                {u.permissions.control && <span className="bg-green-100 text-green-700 px-1.5 py-0.5 rounded">Control</span>}
                {u.permissions.console && <span className="bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">Console</span>}
                {u.permissions.files && <span className="bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded">Files</span>}
              </p>
            </div>
            <button onClick={() => removeUser(u.id)} className="text-red-500 hover:text-red-700 p-2">
              <TrashIcon className="w-5 h-5" />
            </button>
          </div>
        ))}
        {users.length === 0 && !loading && <p className="text-center text-gray-500">No shared users yet.</p>}
      </div>
    </div>
  );
}