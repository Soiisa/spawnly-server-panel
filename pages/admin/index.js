import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabaseClient';
import Link from 'next/link';
import { useRouter } from 'next/router';
import UserTable from '../../components/admin/UserTable';
import ServerTable from '../../components/admin/ServerTable';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import { useTranslation } from 'next-i18next';
import { 
  ArrowLeftIcon, 
  ArrowTopRightOnSquareIcon,
  UsersIcon,
  ServerIcon,
} from "@heroicons/react/24/outline";

export default function AdminDashboard() {
  const { t } = useTranslation('common');
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('users'); 

  const router = useRouter();

  useEffect(() => {
    fetchData();
    const interval = setInterval(() => {
        fetchData(false);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const fetchData = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return router.push('/login');

    try {
        const res = await fetch('/api/admin/stats', {
          headers: { Authorization: `Bearer ${session.access_token}` }
        });

        if (res.status === 403) return router.push('/');
        if (res.ok) {
          const data = await res.json();
          setStats(data);
        }
    } catch (e) {
        console.error("Failed to fetch admin stats", e);
    }
    
    if (showLoading) setLoading(false);
  };

  // Helper to calculate 24h revenue from the chart data
  const revenue24h = useMemo(() => {
    if (!stats?.economics?.chart) return 0;
    return stats.economics.chart.reduce((acc, curr) => acc + (curr.value || 0), 0);
  }, [stats]);

  if (loading) return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-white font-mono">Loading Command...</div>;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white flex flex-col">
      
      {/* Header Bar */}
      <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 py-4 flex justify-between items-center sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <Link 
            href="/"
            className="flex items-center gap-2 text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400 transition-colors font-medium text-sm"
          >
            <ArrowLeftIcon className="h-4 w-4" />
            Back to Website
          </Link>
          <div className="h-6 w-px bg-slate-300 dark:bg-slate-700"></div>
          <h1 className="text-xl font-bold tracking-tight hidden sm:block">Admin Command</h1>
        </div>

        {/* Central Tab Toggle */}
        <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
          <button
            onClick={() => setActiveTab('users')}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
              activeTab === 'users' 
                ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm' 
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
            }`}
          >
            <UsersIcon className="h-4 w-4" />
            Users
          </button>
          <button
            onClick={() => setActiveTab('servers')}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
              activeTab === 'servers' 
                ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm' 
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
            }`}
          >
            <ServerIcon className="h-4 w-4" />
            Servers
          </button>
        </div>

        <Link 
            href="/admin/live" 
            target="_blank"
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition-colors text-sm shadow-lg shadow-indigo-500/20"
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-white"></span>
            </span>
            <span className="hidden sm:inline">Launch Live View</span>
            <span className="sm:hidden">Live</span>
            <ArrowTopRightOnSquareIcon className="h-4 w-4 opacity-70" />
        </Link>
      </header>
      
      {/* Main Content */}
      <main className="flex-grow w-full px-6 py-8">
        
        {/* Quick Stats Row */}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-5 mb-8">
          <StatCard 
             title="Est. Profit / Hour" 
             value={
                <span className={`transition-colors duration-500 ${stats?.economics?.profit_hr >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                   {stats?.economics?.profit_hr >= 0 ? '+' : ''}{stats?.economics?.profit_hr?.toFixed(3)}€
                </span>
             }
             subValue={
               <div className="flex gap-2 text-xs mt-1">
                 <span className="text-green-600/70">In: {stats?.economics?.revenue_hr?.toFixed(3)}€</span>
                 <span className="text-red-600/70">Out: {stats?.economics?.cost_hr?.toFixed(3)}€</span>
               </div>
             }
          />
          <StatCard title="Active Servers" value={`${stats?.overview?.active_nodes} / ${stats?.overview?.servers}`} />
          <StatCard title="Total Users" value={stats?.overview?.users} />
          <StatCard title="24h Revenue" value={`${revenue24h.toFixed(0)} CR`} />
          <StatCard title="Total Liability" value={`${(stats?.overview?.liability || 0).toFixed(0)} CR`} />
        </div>

        {/* Content Area */}
        <div className="w-full h-[calc(100vh-280px)] min-h-[500px] flex flex-col">
          {activeTab === 'users' ? (
             <UserTable />
          ) : (
             <ServerTable />
          )}
        </div>

      </main>
    </div>
  );
}

function StatCard({ title, value, subValue }) {
  return (
    <div className="bg-white dark:bg-slate-900 overflow-hidden rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 p-5 flex flex-col justify-center">
      <dt className="truncate text-sm font-medium text-slate-500 dark:text-slate-400">{title}</dt>
      <dd className="mt-1 text-3xl font-semibold tracking-tight text-slate-900 dark:text-white">{value}</dd>
      {subValue}
    </div>
  );
}

export async function getStaticProps({ locale }) {
  return {
    props: {
      ...(await serverSideTranslations(locale, ['common'])),
    },
  };
}