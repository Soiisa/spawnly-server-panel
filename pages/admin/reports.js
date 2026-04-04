// pages/admin/reports.js
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import { 
  ArrowLeftIcon, 
  UsersIcon,
  ServerIcon,
  CurrencyDollarIcon,
  ClockIcon,
  ChartBarIcon
} from "@heroicons/react/24/outline";

export default function AdminReports() {
  const router = useRouter();
  const [period, setPeriod] = useState('daily');
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchReport(period);
  }, [period]);

  const fetchReport = async (selectedPeriod) => {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return router.push('/login');

    try {
        const res = await fetch(`/api/admin/reports?period=${selectedPeriod}`, {
          headers: { Authorization: `Bearer ${session.access_token}` }
        });

        if (res.status === 403) return router.push('/');
        if (res.ok) {
          const data = await res.json();
          setReportData(data);
        }
    } catch (e) {
        console.error("Failed to fetch reports", e);
    }
    setLoading(false);
  };

  const formatRuntime = (seconds) => {
      if (!seconds) return '0h 0m';
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      return `${hours}h ${minutes}m`;
  };

  if (loading && !reportData) {
      return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-white font-mono">Generating Report...</div>;
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white flex flex-col">
      
      {/* Header Bar */}
      <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 py-4 flex justify-between items-center sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <Link 
            href="/admin"
            className="flex items-center gap-2 text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400 transition-colors font-medium text-sm"
          >
            <ArrowLeftIcon className="h-4 w-4" />
            Back to Dashboard
          </Link>
          <div className="h-6 w-px bg-slate-300 dark:bg-slate-700"></div>
          <h1 className="text-xl font-bold tracking-tight hidden sm:block flex items-center gap-2">
            <ChartBarIcon className="w-6 h-6 text-indigo-500 inline-block mr-2" />
            Growth Reports
          </h1>
        </div>

        {/* Time Period Toggle */}
        <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
          {['daily', 'weekly', 'monthly'].map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all capitalize ${
                  period === p 
                    ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm' 
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                }`}
              >
                {p}
              </button>
          ))}
        </div>
      </header>
      
      <main className="flex-grow w-full max-w-6xl mx-auto px-6 py-12">
         
         <div className="mb-8">
             <h2 className="text-3xl font-black tracking-tight capitalize text-slate-900 dark:text-white">
                 {period} Resume
             </h2>
             <p className="text-slate-500 dark:text-slate-400 mt-1">
                 Performance metrics for the last {period === 'daily' ? '24 hours' : period === 'weekly' ? '7 days' : '30 days'}.
             </p>
         </div>

        {/* Report Metric Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            
            <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">New Users</h3>
                    <div className="p-2 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-lg">
                        <UsersIcon className="w-6 h-6" />
                    </div>
                </div>
                <p className="text-4xl font-black text-slate-900 dark:text-white">
                    {loading ? '...' : reportData?.newUsers}
                </p>
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">New Servers</h3>
                    <div className="p-2 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-lg">
                        <ServerIcon className="w-6 h-6" />
                    </div>
                </div>
                <p className="text-4xl font-black text-slate-900 dark:text-white">
                    {loading ? '...' : reportData?.newServers}
                </p>
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Deposits (EUR)</h3>
                    <div className="p-2 bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded-lg">
                        <CurrencyDollarIcon className="w-6 h-6" />
                    </div>
                </div>
                <p className="text-4xl font-black text-slate-900 dark:text-white">
                    {loading ? '...' : `+€${reportData?.revenue?.toFixed(2)}`}
                </p>
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Total Runtime</h3>
                    <div className="p-2 bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 rounded-lg">
                        <ClockIcon className="w-6 h-6" />
                    </div>
                </div>
                <p className="text-4xl font-black text-slate-900 dark:text-white">
                    {loading ? '...' : formatRuntime(reportData?.totalRuntimeSeconds)}
                </p>
            </div>

        </div>

      </main>
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