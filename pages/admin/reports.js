// pages/admin/reports.js
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Header from '../../components/ServersHeader';
import Footer from '../../components/ServersFooter';
import { 
  UserPlusIcon, 
  ServerStackIcon, 
  CurrencyDollarIcon, 
  ClockIcon,
  ArrowPathIcon,
  DocumentChartBarIcon
} from '@heroicons/react/24/outline';

export default function AdminReports() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  
  const [period, setPeriod] = useState('daily'); // 'daily', 'weekly', 'monthly'
  const [reportData, setReportData] = useState(null);
  const [fetchingReport, setFetchingReport] = useState(false);

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/login');
        return;
      }
      setUser(session.user);

      const { data: prof } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single();

      if (!prof || !prof.is_admin) {
        router.push('/dashboard');
        return;
      }
      setProfile(prof);
      setLoading(false);
    };
    init();
  }, [router]);

  useEffect(() => {
    if (profile?.is_admin) {
      fetchReport();
    }
  }, [period, profile]);

  const fetchReport = async () => {
    setFetchingReport(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`/api/admin/reports?period=${period}`, {
        headers: { Authorization: `Bearer ${session.access_token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setReportData(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setFetchingReport(false);
    }
  };

  const formatRuntime = (seconds) => {
    if (!seconds) return '0h 0m';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${h}h ${m}m`;
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-indigo-600 border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900 flex flex-col font-sans">
      <Head><title>Admin Reports - Spawnly</title></Head>
      <Header user={user} credits={profile?.credits} onLogout={handleLogout} />

      <main className="flex-grow w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-24">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-3">
              <DocumentChartBarIcon className="w-8 h-8 text-indigo-600" />
              Performance Reports
            </h1>
            <p className="text-gray-600 dark:text-gray-400 mt-1">
              View daily, weekly, and monthly aggregate statistics for Spawnly.
            </p>
          </div>
          
          <div className="flex items-center gap-2 bg-white dark:bg-slate-800 p-1.5 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm">
            {['daily', 'weekly', 'monthly'].map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-4 py-2 rounded-lg text-sm font-bold capitalize transition-all ${
                  period === p 
                  ? 'bg-indigo-600 text-white shadow-md' 
                  : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        {fetchingReport ? (
          <div className="flex justify-center py-24">
            <ArrowPathIcon className="w-10 h-10 text-indigo-600 animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            
            {/* New Users */}
            <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 border border-gray-200 dark:border-slate-700 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">New Users</h3>
                <div className="p-2 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-lg">
                  <UserPlusIcon className="w-6 h-6" />
                </div>
              </div>
              <p className="text-4xl font-black text-gray-900 dark:text-white">
                {reportData?.newUsers.toLocaleString()}
              </p>
            </div>

            {/* New Servers */}
            <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 border border-gray-200 dark:border-slate-700 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">New Servers</h3>
                <div className="p-2 bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400 rounded-lg">
                  <ServerStackIcon className="w-6 h-6" />
                </div>
              </div>
              <p className="text-4xl font-black text-gray-900 dark:text-white">
                {reportData?.newServers.toLocaleString()}
              </p>
            </div>

            {/* Revenue */}
            <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 border border-gray-200 dark:border-slate-700 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Deposits (Cr)</h3>
                <div className="p-2 bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 rounded-lg">
                  <CurrencyDollarIcon className="w-6 h-6" />
                </div>
              </div>
              <p className="text-4xl font-black text-gray-900 dark:text-white">
                {reportData?.revenueCredits.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>

            {/* Total Runtime */}
            <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 border border-gray-200 dark:border-slate-700 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Total Runtime</h3>
                <div className="p-2 bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 rounded-lg">
                  <ClockIcon className="w-6 h-6" />
                </div>
              </div>
              <p className="text-4xl font-black text-gray-900 dark:text-white">
                {formatRuntime(reportData?.totalRuntimeSeconds)}
              </p>
            </div>

          </div>
        )}
      </main>
      
      <Footer />
    </div>
  );
}