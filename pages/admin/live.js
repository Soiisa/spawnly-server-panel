import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useRouter } from 'next/router';
import { motion } from 'framer-motion';
import { Line, Doughnut } from 'react-chartjs-2';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Filler,
  ArcElement
} from 'chart.js';
import { 
  ServerIcon, 
  UserGroupIcon, 
  CpuChipIcon, 
  BanknotesIcon,
  BoltIcon,
  ClockIcon
} from '@heroicons/react/24/outline';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Filler, ArcElement);

export default function LiveDashboard() {
  const [data, setData] = useState(null);
  const router = useRouter();

  // --- Data Fetching ---
  useEffect(() => {
    const fetchLive = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return router.push('/login');
      try {
        const res = await fetch('/api/admin/stats', {
          headers: { Authorization: `Bearer ${session.access_token}` }
        });
        if (res.status === 403) return router.push('/');
        if (res.ok) setData(await res.json());
      } catch (e) { console.error(e); }
    };
    fetchLive();
    const interval = setInterval(fetchLive, 3000); // 3s polling for "live" feel
    return () => clearInterval(interval);
  }, []);

  if (!data) return (
    <div className="h-screen w-screen bg-slate-950 flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-16 h-16 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
        <div className="text-indigo-400 font-medium tracking-widest text-sm uppercase">Connecting to Satellite...</div>
      </div>
    </div>
  );

  // --- Chart Configs ---
  const lineChartData = {
    labels: data.economics.chart.map(d => new Date(d.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })),
    datasets: [{
      fill: true,
      data: data.economics.chart.map(d => d.value),
      borderColor: '#818cf8', // Indigo 400
      borderWidth: 2,
      pointRadius: 0,
      pointHoverRadius: 4,
      tension: 0.4,
      backgroundColor: (context) => {
        const ctx = context.chart.ctx;
        const gradient = ctx.createLinearGradient(0, 0, 0, 300);
        gradient.addColorStop(0, 'rgba(129, 140, 248, 0.3)');
        gradient.addColorStop(1, 'rgba(129, 140, 248, 0)');
        return gradient;
      },
    }],
  };

  const lineOptions = {
    responsive: true,
    maintainAspectRatio: false,
    scales: { x: { display: false }, y: { display: false } },
    plugins: { legend: { display: false }, tooltip: { mode: 'index', intersect: false } },
    interaction: { mode: 'nearest', axis: 'x', intersect: false }
  };

  const doughnutData = {
    labels: Object.keys(data.distribution),
    datasets: [{
      data: Object.values(data.distribution),
      backgroundColor: ['#6366f1', '#ec4899', '#f59e0b', '#10b981'], // Indigo, Pink, Amber, Emerald
      borderWidth: 0,
      hoverOffset: 4
    }]
  };

  const doughnutOptions = {
    cutout: '75%',
    plugins: { legend: { display: false } }
  };

  return (
    <div className="min-h-screen bg-[#09090b] text-white font-sans selection:bg-indigo-500/30 overflow-hidden relative">
      
      {/* Background Ambience */}
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-indigo-900/20 rounded-full blur-[128px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-fuchsia-900/10 rounded-full blur-[128px] pointer-events-none" />

      {/* Header */}
      <header className="absolute top-0 w-full px-8 py-6 flex justify-between items-center z-50 bg-[#09090b]/50 backdrop-blur-md border-b border-white/5">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <h1 className="font-bold text-xl tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-white to-gray-400">
            Spawnly <span className="font-light text-gray-500">Mission Control</span>
          </h1>
        </div>
        <div className="flex items-center gap-6 text-xs font-medium text-gray-500">
          <div className="flex flex-col items-end">
             <span>REGION: eu-central</span>
             <span className="text-gray-300">HETZNER CLOUD</span>
          </div>
          <div className="h-8 w-px bg-white/10" />
          <div className="flex flex-col items-end">
             <span>STATUS</span>
             <span className="text-emerald-400">OPERATIONAL</span>
          </div>
        </div>
      </header>

      {/* Main Grid */}
      <main className="pt-24 pb-8 px-8 h-screen w-full max-w-[1920px] mx-auto">
        <div className="grid grid-cols-12 grid-rows-12 gap-6 h-full">

          {/* === KPIS === */}
          
          {/* Active Fleet */}
          <div className="col-span-3 row-span-3 bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-xl flex flex-col justify-between group hover:bg-white/[0.07] transition-all">
             <div className="flex justify-between items-start">
                <div className="p-3 bg-indigo-500/10 rounded-xl text-indigo-400">
                   <ServerIcon className="w-6 h-6" />
                </div>
                <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">Active Fleet</span>
             </div>
             <div>
                <div className="flex items-baseline gap-2">
                   <span className="text-4xl font-bold text-white">{data.overview.active_nodes}</span>
                   <span className="text-sm text-gray-500">/ {data.overview.servers}</span>
                </div>
                <div className="mt-4 w-full bg-gray-800 rounded-full h-1.5 overflow-hidden">
                   <motion.div 
                     initial={{ width: 0 }} 
                     animate={{ width: `${(data.overview.active_nodes / data.overview.servers) * 100}%` }}
                     className="h-full bg-indigo-500 rounded-full" 
                   />
                </div>
             </div>
          </div>

          {/* Memory Load */}
          <div className="col-span-3 row-span-3 bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-xl flex flex-col justify-between group hover:bg-white/[0.07] transition-all">
             <div className="flex justify-between items-start">
                <div className="p-3 bg-fuchsia-500/10 rounded-xl text-fuchsia-400">
                   <CpuChipIcon className="w-6 h-6" />
                </div>
                <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">Memory Load</span>
             </div>
             <div>
                <div className="flex items-baseline gap-2">
                   <span className="text-4xl font-bold text-white">{data.overview.active_ram}</span>
                   <span className="text-lg text-gray-500">GB</span>
                </div>
                <p className="text-xs text-gray-500 mt-2">Provisioned via Cloud Init</p>
             </div>
          </div>

          {/* User Base */}
          <div className="col-span-3 row-span-3 bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-xl flex flex-col justify-between group hover:bg-white/[0.07] transition-all">
             <div className="flex justify-between items-start">
                <div className="p-3 bg-amber-500/10 rounded-xl text-amber-400">
                   <UserGroupIcon className="w-6 h-6" />
                </div>
                <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">User Base</span>
             </div>
             <div className="flex justify-between items-end">
                <div>
                   <div className="text-4xl font-bold text-white">{data.overview.users}</div>
                   <p className="text-xs text-gray-500 mt-1">Total Registered</p>
                </div>
                <div className="text-right">
                   <div className="text-2xl font-bold text-amber-400">{data.overview.active_players}</div>
                   <p className="text-xs text-gray-500">Live Players</p>
                </div>
             </div>
          </div>

          {/* Profitability (Small) */}
          <div className="col-span-3 row-span-3 bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-xl flex flex-col justify-between relative overflow-hidden">
             <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/20 blur-[50px] -mr-10 -mt-10 pointer-events-none" />
             <div className="flex justify-between items-start z-10">
                <div className="p-3 bg-emerald-500/10 rounded-xl text-emerald-400">
                   <BanknotesIcon className="w-6 h-6" />
                </div>
                <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">Net Yield / Hr</span>
             </div>
             <div className="z-10">
                <div className="text-4xl font-bold text-emerald-400">
                  {data.economics.profit_hr >= 0 ? '+' : ''}{data.economics.profit_hr.toFixed(2)}€
                </div>
                <div className="flex gap-4 mt-2 text-xs">
                   <span className="text-gray-400">Rev: <span className="text-white">{data.economics.revenue_hr.toFixed(2)}€</span></span>
                   <span className="text-gray-400">Cost: <span className="text-white">{data.economics.cost_hr.toFixed(2)}€</span></span>
                </div>
             </div>
          </div>

          {/* === CHART SECTION === */}
          <div className="col-span-9 row-span-5 bg-white/5 border border-white/10 rounded-2xl p-1 relative overflow-hidden backdrop-blur-xl">
            <div className="absolute top-6 left-6 z-10">
               <h3 className="text-sm font-semibold text-white">Credit Consumption Velocity</h3>
               <p className="text-xs text-gray-400">Real-time usage metrics (24h)</p>
            </div>
            <div className="w-full h-full pt-12 pb-2 px-2">
               <Line options={lineOptions} data={lineChartData} />
            </div>
          </div>

          {/* === DISTRIBUTION & LOGS === */}
          <div className="col-span-3 row-span-5 bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-xl flex flex-col">
             <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-6">Software Distribution</h3>
             <div className="flex-1 flex flex-col items-center justify-center relative">
                <div className="w-48 h-48 relative z-10">
                   <Doughnut data={doughnutData} options={doughnutOptions} />
                   <div className="absolute inset-0 flex items-center justify-center flex-col pointer-events-none">
                      <span className="text-3xl font-bold text-white">{data.overview.active_nodes}</span>
                      <span className="text-[10px] text-gray-400 uppercase tracking-wider">Nodes</span>
                   </div>
                </div>
             </div>
             <div className="grid grid-cols-2 gap-2 mt-6">
                {Object.entries(data.distribution).map(([key, val], i) => (
                  <div key={key} className="flex items-center gap-2 text-xs">
                     <div className="w-2 h-2 rounded-full" style={{ backgroundColor: doughnutData.datasets[0].backgroundColor[i] }} />
                     <span className="text-gray-300 flex-1">{key}</span>
                     <span className="font-bold text-white">{val}</span>
                  </div>
                ))}
             </div>
          </div>

          {/* === ACTIVITY LOGS === */}
          <div className="col-span-12 row-span-4 bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-xl overflow-hidden flex flex-col">
             <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                   <BoltIcon className="w-5 h-5 text-indigo-400" />
                   <h3 className="text-sm font-semibold text-white">Live Operations Feed</h3>
                </div>
                <div className="flex items-center gap-2">
                   <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                   </span>
                   <span className="text-xs text-gray-400 uppercase tracking-wider">Live</span>
                </div>
             </div>
             
             <div className="grid grid-cols-4 gap-4 px-4 py-2 text-xs font-medium text-gray-500 uppercase tracking-wider border-b border-white/10 pb-2">
                <div>Timestamp</div>
                <div>Action</div>
                <div>Entity</div>
                <div>Payload</div>
             </div>

             <div className="flex-1 overflow-y-auto mt-2 space-y-1 custom-scrollbar">
                {data.activity.map((log, i) => (
                  <div key={i} className="grid grid-cols-4 gap-4 px-4 py-3 rounded-lg hover:bg-white/5 transition-colors text-sm border border-transparent hover:border-white/5">
                     <div className="flex items-center gap-2 text-gray-400">
                        <ClockIcon className="w-4 h-4" />
                        {new Date(log.time).toLocaleTimeString()}
                     </div>
                     <div className="flex items-center">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                           SERVER_DEPLOY
                        </span>
                     </div>
                     <div className="text-white font-medium truncate">{log.name}</div>
                     <div className="text-gray-400 text-xs font-mono bg-black/30 rounded px-2 py-1 w-fit">
                        {log.type}
                     </div>
                  </div>
                ))}
             </div>
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