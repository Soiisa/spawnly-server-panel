// components/admin/UserServerModal.js

import { useState, useEffect } from 'react';
import { XMarkIcon, ServerIcon, CpuChipIcon } from "@heroicons/react/24/outline";

export default function UserServerModal({ userId, userEmail, onClose, adminToken }) {
    const [servers, setServers] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchUserServers = async () => {
            setLoading(true);
            try {
                // Fetch servers filtered by this specific user
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
            <div className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-700 transform transition-all scale-100">
                
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
                                    <th className="px-6 py-3">Software</th>
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
                                            <div className="text-slate-700 dark:text-slate-300 capitalize">{s.type}</div>
                                            <div className="text-xs text-slate-500">{s.version}</div>
                                        </td>
                                        <td className="px-6 py-3">
                                            <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
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