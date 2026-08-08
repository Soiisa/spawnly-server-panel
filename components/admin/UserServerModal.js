// components/admin/UserServerModal.js

import { useState, useEffect } from 'react';
import { XMarkIcon, ServerIcon } from "@heroicons/react/24/outline";

export default function UserServerModal({ userId, userEmail, onClose, adminToken }) {
    const [servers, setServers] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchUserServers = async () => {
            setLoading(true);
            try {
                const res = await fetch(`/api/admin/servers?userId=${userId}`, {
                    headers: { Authorization: `Bearer ${adminToken}` }
                });
                if (res.ok) {
                    const data = await res.json();
                    setServers(data.servers);
                }
            } catch(e) {
                console.error("Error fetching user servers:", e);
            }
            setLoading(false);
        };

        if(userId && adminToken) {
            fetchUserServers();
        }
    }, [userId, adminToken]);

    return (
        <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-white dark:bg-slate-900 w-full max-w-3xl rounded-2xl shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-700 transform transition-all scale-100">
                
                {/* Header */}
                <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-950">
                    <div>
                        <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                            <ServerIcon className="h-5 w-5 text-indigo-500" />
                            User Servers
                        </h3>
                        <p className="text-xs text-slate-500 font-mono mt-0.5">{userEmail || userId}</p>
                    </div>
                    <button 
                        onClick={onClose} 
                        className="p-1 rounded-full text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
                    >
                        <XMarkIcon className="h-6 w-6" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-0 max-h-[60vh] overflow-y-auto bg-white dark:bg-slate-900">
                    {loading ? (
                        <div className="p-8 text-center text-slate-500 animate-pulse">Scanning database...</div>
                    ) : servers.length === 0 ? (
                        <div className="p-8 text-center flex flex-col items-center">
                            <ServerIcon className="h-10 w-10 text-slate-300 mb-2" />
                            <p className="text-slate-500">No servers found for this user.</p>
                        </div>
                    ) : (
                        <table className="w-full text-left text-sm">
                            <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500 font-medium border-b border-slate-200 dark:border-slate-800">
                                <tr>
                                    <th className="px-6 py-3">Server Name</th>
                                    <th className="px-6 py-3">Game & Software</th>
                                    <th className="px-6 py-3">Billing</th>
                                    <th className="px-6 py-3">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                {servers.map(s => (
                                    <tr key={s.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                                        <td className="px-6 py-3">
                                            <div className="font-medium text-slate-900 dark:text-white">{s.name}</div>
                                            <div className="text-xs text-slate-500 font-mono">{s.subdomain}.spawnly.net</div>
                                        </td>
                                        
                                        <td className="px-6 py-3">
                                            <div className="font-medium text-slate-900 dark:text-white capitalize">{s.game ? s.game.replace('_', ' ') : 'Minecraft'}</div>
                                            <div className="flex items-center gap-1.5 mt-0.5">
                                                <span className="text-[10px] text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded capitalize border border-slate-200 dark:border-slate-700">
                                                    {s.type}
                                                </span>
                                                <span className="text-[10px] text-slate-500 truncate max-w-[120px]">{s.version}</span>
                                            </div>
                                        </td>

                                        <td className="px-6 py-3">
                                            <span className={`text-[10px] px-2 py-1 rounded-md font-bold uppercase tracking-wider ${
                                                s.billing_type === 'monthly' 
                                                ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 border border-purple-200 dark:border-purple-800' 
                                                : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border border-blue-200 dark:border-blue-800'
                                            }`}>
                                                {s.billing_type === 'monthly' ? 'Monthly' : 'Hourly'}
                                            </span>
                                        </td>

                                        <td className="px-6 py-3">
                                            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                                                s.status === 'Running' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' : 
                                                s.status === 'Stopped' ? 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-400' : 'bg-yellow-100 text-yellow-800'
                                            }`}>
                                                {s.status}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </div>
    );
}