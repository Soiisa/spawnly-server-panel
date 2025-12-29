import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { 
  MagnifyingGlassIcon, 
  CurrencyDollarIcon, 
  NoSymbolIcon, 
  CheckCircleIcon 
} from "@heroicons/react/24/outline";

export default function UserTable() {
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [giftModal, setGiftModal] = useState({ open: false, userId: null, email: '' });
  const [giftAmount, setGiftAmount] = useState(10);

  useEffect(() => {
    fetchUsers();
  }, [search]); // Re-fetch when search changes (debounce would be better in prod)

  const fetchUsers = async () => {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    try {
      const query = search ? `?search=${encodeURIComponent(search)}` : '';
      const res = await fetch(`/api/admin/users${query}`, {
        headers: { Authorization: `Bearer ${session.access_token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users);
      }
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const handleGift = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}` 
      },
      body: JSON.stringify({
        action: 'gift',
        userId: giftModal.userId,
        amount: giftAmount
      })
    });

    if (res.ok) {
      setGiftModal({ open: false, userId: null, email: '' });
      fetchUsers(); // Refresh list
    } else {
      alert("Failed to gift credits");
    }
  };

  const toggleBan = async (userId) => {
    if (!confirm("Are you sure you want to change the ban status for this user?")) return;
    
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}` 
      },
      body: JSON.stringify({ action: 'toggle_ban', userId })
    });

    if (res.ok) {
      fetchUsers();
    }
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
      
      {/* Header & Search */}
      <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row justify-between items-center gap-4">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">User Management</h2>
        <div className="relative">
          <MagnifyingGlassIcon className="h-5 w-5 absolute left-3 top-2.5 text-slate-400" />
          <input 
            type="text" 
            placeholder="Search email or ID..." 
            className="pl-10 pr-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:ring-2 focus:ring-indigo-500 outline-none w-full sm:w-64"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800">
          <thead className="bg-slate-50 dark:bg-slate-950">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">User</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Credits</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Status</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-slate-900 divide-y divide-slate-200 dark:divide-slate-800">
            {loading ? (
               <tr><td colSpan="4" className="px-6 py-4 text-center text-slate-500">Loading users...</td></tr>
            ) : users.length === 0 ? (
               <tr><td colSpan="4" className="px-6 py-4 text-center text-slate-500">No users found.</td></tr>
            ) : (
              users.map((user) => (
                <tr key={user.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-slate-900 dark:text-white">{user.email}</div>
                    <div className="text-xs text-slate-500 font-mono">{user.id}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      user.credits > 0 ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                    }`}>
                      {user.credits.toFixed(2)} CR
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {user.banned ? (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
                        <NoSymbolIcon className="h-3 w-3" /> Banned
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                        <CheckCircleIcon className="h-3 w-3" /> Active
                      </span>
                    )}
                    {user.is_admin && <span className="ml-2 text-xs text-indigo-500 font-bold">ADMIN</span>}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button 
                      onClick={() => setGiftModal({ open: true, userId: user.id, email: user.email })}
                      className="text-indigo-600 hover:text-indigo-900 dark:text-indigo-400 dark:hover:text-indigo-300 mr-4"
                    >
                      Gift
                    </button>
                    <button 
                      onClick={() => toggleBan(user.id)}
                      className={`${user.banned ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'} hover:underline`}
                    >
                      {user.banned ? 'Unban' : 'Ban'}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Gift Modal */}
      {giftModal.open && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-lg p-6 w-full max-w-sm border border-slate-200 dark:border-slate-700 shadow-xl">
            <h3 className="text-lg font-bold mb-2">Gift Credits</h3>
            <p className="text-sm text-slate-500 mb-4">Add credits to <span className="font-mono text-indigo-500">{giftModal.email}</span></p>
            
            <div className="flex items-center border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 mb-6">
              <CurrencyDollarIcon className="h-5 w-5 text-slate-400 mr-2" />
              <input 
                type="number" 
                className="bg-transparent outline-none w-full"
                value={giftAmount}
                onChange={(e) => setGiftAmount(e.target.value)}
              />
            </div>

            <div className="flex justify-end gap-3">
              <button 
                onClick={() => setGiftModal({ open: false, userId: null, email: '' })}
                className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
              >
                Cancel
              </button>
              <button 
                onClick={handleGift}
                className="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg"
              >
                Confirm Gift
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}