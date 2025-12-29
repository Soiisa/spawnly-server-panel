import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useRouter } from 'next/router';
import { motion } from 'framer-motion';
import { Line } from 'react-chartjs-2';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import { useTranslation } from 'next-i18next';

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Filler,
} from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Filler);

export default function LiveDashboard() {
  const { t } = useTranslation('common');
  const [data, setData] = useState(null);
  const router = useRouter();

  // --- POLLING LOGIC ---
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
      } catch (e) {
        console.error("Polling error", e);
      }
    };

    fetchLive();
    const interval = setInterval(fetchLive, 5000); // 5s Poll
    return () => clearInterval(interval);
  }, []);

  if (!data) return (
    <div className="bg-black h-screen w-screen flex flex-col items-center justify-center text-cyan-400 font-mono text-xl">
      <div className="animate-spin h-12 w-12 border-4 border-cyan-500 border-t-transparent rounded-full mb-4 shadow-[0_0_20px_#00f3ff]"></div>
      <span className="animate-pulse tracking-widest">INITIALIZING NEURAL LINK...</span>
    </div>
  );

  // --- CHART CONFIG ---
  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 0 },
    scales: {
      x: { display: false },
      y: { display: false }
    },
    plugins: { legend: { display: false } },
    elements: {
      point: { radius: 2, hoverRadius: 5, backgroundColor: '#00f3ff' },
      line: { tension: 0.2, borderWidth: 2 } 
    }
  };

  const chartData = {
    labels: data.chartData.map(d => d.time),
    datasets: [
      {
        fill: true,
        data: data.chartData.map(d => d.amount),
        borderColor: '#00f3ff', 
        backgroundColor: (context) => {
          const ctx = context.chart.ctx;
          const gradient = ctx.createLinearGradient(0, 0, 0, 400);
          gradient.addColorStop(0, 'rgba(0, 243, 255, 0.4)');
          gradient.addColorStop(1, 'rgba(0, 243, 255, 0)');
          return gradient;
        },
      },
    ],
  };

  // --- PROFIT CALC ---
  const profit = data.profit?.profitPerHour || 0;
  const isProfitable = profit >= 0;

  return (
    <div className="h-screen w-screen bg-[#050510] overflow-hidden text-cyan-50 font-mono relative selection:bg-cyan-500/30">
      
      {/* --- GLOBAL CSS STYLES FOR CYBERPUNK EFFECTS --- */}
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Share+Tech+Mono&display=swap');
        
        body { font-family: 'Share Tech Mono', monospace; }
        
        .cyber-clip {
          clip-path: polygon(
            0 0, 
            100% 0, 
            100% calc(100% - 20px), 
            calc(100% - 20px) 100%, 
            0 100%
          );
        }

        .cyber-clip-inv {
          clip-path: polygon(
            20px 0, 
            100% 0, 
            100% 100%, 
            0 100%, 
            0 20px
          );
        }
        
        .scanlines {
          background: linear-gradient(
            to bottom,
            rgba(255,255,255,0),
            rgba(255,255,255,0) 50%,
            rgba(0,0,0,0.2) 50%,
            rgba(0,0,0,0.2)
          );
          background-size: 100% 4px;
          animation: scroll 10s linear infinite;
          pointer-events: none;
        }

        @keyframes scroll {
          0% { background-position: 0 0; }
          100% { background-position: 0 100%; }
        }

        .neon-text-glow { text-shadow: 0 0 10px #00f3ff, 0 0 20px #00f3ff; }
        .neon-border-glow { box-shadow: 0 0 10px rgba(0, 243, 255, 0.3), inset 0 0 20px rgba(0, 243, 255, 0.1); }
        .neon-red-glow { text-shadow: 0 0 10px #ff2a2a; }
        .neon-green-glow { text-shadow: 0 0 10px #39ff14; }
      `}</style>

      {/* --- BACKGROUND EFFECTS --- */}
      <div className="absolute inset-0 bg-[url('/grid.svg')] bg-center opacity-10 pointer-events-none"></div>
      <div className="absolute inset-0 scanlines z-50 opacity-20"></div>
      
      {/* --- HEADER --- */}
      <header className="absolute top-0 left-0 w-full p-6 flex justify-between items-end border-b border-cyan-900/50 bg-[#050510]/80 backdrop-blur-md z-40">
        <div>
          <h1 className="text-4xl font-bold tracking-widest italic neon-text-glow text-cyan-400 transform -skew-x-12">
            SPAWNLY<span className="text-white">.SYS</span>
          </h1>
          <p className="text-xs text-cyan-600 mt-1 tracking-[0.3em]">QUANTUM INFRASTRUCTURE MONITOR // V.9.0</p>
        </div>
        
        <div className="flex items-center gap-6">
           {/* Decorative Hex Code Block */}
           <div className="hidden md:block text-[10px] text-cyan-900 leading-none text-right opacity-50">
             0x4F 0xA1 0x00<br/>0x1B 0xC2 0xFF<br/>0x99 0x00 0x1A
           </div>
           
           <div className="flex items-center gap-3 border border-cyan-500/30 px-4 py-2 bg-cyan-950/30 rounded-sm cyber-clip-inv">
            <div className="h-3 w-3 bg-green-500 animate-pulse shadow-[0_0_10px_#39ff14]"></div>
            <span className="text-sm font-bold text-green-400 tracking-wider">SYSTEM OPTIMAL</span>
          </div>
        </div>
      </header>

      {/* --- MAIN GRID --- */}
      <main className="h-full pt-32 pb-8 px-8 grid grid-cols-12 grid-rows-6 gap-6 relative z-10">
        
        {/* === TILE 1: ACTIVE NODES === */}
        <motion.div 
          initial={{ opacity: 0, x: -50 }}
          animate={{ opacity: 1, x: 0 }}
          className="col-span-4 row-span-3 bg-[#0a0a14] border-l-4 border-cyan-500 relative cyber-clip neon-border-glow p-6 flex flex-col justify-between"
        >
          {/* Decor */}
          <div className="absolute top-2 right-2 text-cyan-900 text-[10px]">/// NODES.MX</div>

          <h3 className="text-cyan-500 text-sm tracking-[0.2em] font-bold mb-2">ACTIVE INSTANCES</h3>
          
          <div className="flex items-end gap-4">
            <span className="text-8xl font-black text-white neon-text-glow leading-none">{data.servers.active}</span>
            <span className="text-2xl text-cyan-700 font-bold mb-2">/ {data.servers.total}</span>
          </div>
          
          <div className="space-y-2 mt-4">
             <div className="flex justify-between text-xs text-cyan-400">
               <span>LOAD</span>
               <span>{Math.round((data.servers.active / data.servers.total) * 100)}%</span>
             </div>
             <div className="w-full bg-cyan-900/30 h-2 skew-x-12">
                <motion.div 
                  className="h-full bg-cyan-400 shadow-[0_0_15px_#00f3ff]"
                  initial={{ width: 0 }}
                  animate={{ width: `${(data.servers.active / data.servers.total) * 100}%` }}
                  transition={{ duration: 1 }}
                />
             </div>
          </div>
        </motion.div>


        {/* === TILE 2: REVENUE GRAPH === */}
        <motion.div 
           initial={{ opacity: 0, y: -50 }}
           animate={{ opacity: 1, y: 0 }}
           transition={{ delay: 0.1 }}
           className="col-span-8 row-span-3 bg-[#0a0a14] border border-cyan-500/30 p-1 relative"
        >
          {/* Inner Frame */}
          <div className="h-full w-full border border-cyan-500/20 bg-cyan-950/5 p-6 flex flex-col relative overflow-hidden">
            {/* Grid Overlay */}
            <div className="absolute inset-0 bg-[linear-gradient(rgba(0,243,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(0,243,255,0.03)_1px,transparent_1px)] bg-[size:20px_20px]"></div>

            <div className="flex justify-between mb-4 z-10">
              <div>
                <h3 className="text-cyan-500 text-xs tracking-[0.2em] font-bold">TRANSACTION VELOCITY</h3>
                <p className="text-[10px] text-cyan-700">REAL-TIME CREDIT CONSUMPTION</p>
              </div>
              <div className="text-right">
                 <span className="text-3xl font-bold text-white neon-text-glow">{data.financials.revenue24h.toFixed(2)}</span>
                 <span className="text-sm text-cyan-500 ml-2">CR</span>
              </div>
            </div>

            <div className="flex-grow relative w-full h-full z-10">
              <Line options={chartOptions} data={chartData} />
            </div>
          </div>
          
          {/* Corner Accents */}
          <div className="absolute top-0 left-0 w-2 h-2 bg-cyan-500"></div>
          <div className="absolute top-0 right-0 w-2 h-2 bg-cyan-500"></div>
          <div className="absolute bottom-0 left-0 w-2 h-2 bg-cyan-500"></div>
          <div className="absolute bottom-0 right-0 w-2 h-2 bg-cyan-500"></div>
        </motion.div>


        {/* === TILE 3: PROFIT REACTOR (Center) === */}
        <motion.div 
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.4 }}
          className={`col-span-4 row-span-3 relative flex flex-col justify-center items-center text-center p-6 border-2 ${isProfitable ? 'border-green-500/50 bg-green-900/10' : 'border-red-500/50 bg-red-900/10'} cyber-clip`}
        >
          {/* Animated Circle BG */}
          <div className={`absolute w-64 h-64 rounded-full border-4 border-dashed opacity-20 animate-[spin_10s_linear_infinite] ${isProfitable ? 'border-green-500' : 'border-red-500'}`}></div>
          <div className={`absolute w-48 h-48 rounded-full border border-dotted opacity-40 animate-[spin_5s_linear_infinite_reverse] ${isProfitable ? 'border-green-500' : 'border-red-500'}`}></div>

          <h3 className={`text-sm tracking-[0.3em] font-bold mb-4 z-10 ${isProfitable ? 'text-green-400' : 'text-red-400'}`}>NET YIELD / HR</h3>
          
          <div className="z-10 relative">
             <span className={`text-7xl font-bold tracking-tighter ${isProfitable ? 'text-white neon-green-glow' : 'text-white neon-red-glow'}`}>
                {isProfitable ? '+' : ''}{profit.toFixed(3)}
             </span>
             <div className="text-center mt-2 font-bold text-lg opacity-80">EUR</div>
          </div>

          {/* Data Bars */}
          <div className="w-full mt-8 flex justify-between px-8 text-xs font-mono z-10">
            <div className="text-left">
              <div className="text-green-500 opacity-70">INCOMING</div>
              <div className="text-white">{data.profit?.revenuePerHour?.toFixed(3)}</div>
            </div>
            <div className="h-8 w-px bg-white/20"></div>
            <div className="text-right">
              <div className="text-red-500 opacity-70">OUTGOING</div>
              <div className="text-white">{data.profit?.costPerHour?.toFixed(3)}</div>
            </div>
          </div>
        </motion.div>


        {/* === TILE 4: STATS & LOGS === */}
        <div className="col-span-8 row-span-3 grid grid-cols-2 gap-6">
            
            {/* Sub-Tile: USERS */}
            <motion.div 
               initial={{ opacity: 0, x: 20 }}
               animate={{ opacity: 1, x: 0 }}
               className="bg-[#0a0a14] border-t-2 border-magenta-500 cyber-clip-inv p-6 flex flex-col justify-center items-center relative"
               style={{ borderTopColor: '#ff00ff' }} // Magenta override
            >
              <h3 className="text-[#ff00ff] text-xs tracking-widest mb-2 font-bold">TOTAL USERS</h3>
              <span className="text-5xl font-bold text-white drop-shadow-[0_0_10px_#ff00ff]">{data.users}</span>
              <div className="absolute bottom-2 right-2 text-[#ff00ff] opacity-40 text-[10px]">db_users_table</div>
            </motion.div>

            {/* Sub-Tile: LIABILITY */}
            <motion.div 
               initial={{ opacity: 0, x: 20 }}
               animate={{ opacity: 1, x: 0 }}
               transition={{ delay: 0.1 }}
               className="bg-[#0a0a14] border-t-2 border-yellow-500 cyber-clip-inv p-6 flex flex-col justify-center items-center relative"
            >
              <h3 className="text-yellow-400 text-xs tracking-widest mb-2 font-bold">LIABILITY</h3>
              <span className="text-4xl font-bold text-white drop-shadow-[0_0_10px_#fbbf24]">{Math.floor(data.financials.liability)}<span className="text-lg text-yellow-500 ml-1">CR</span></span>
            </motion.div>

            {/* Sub-Tile: TERMINAL LOGS */}
            <motion.div 
               initial={{ opacity: 0 }}
               animate={{ opacity: 1 }}
               transition={{ delay: 0.5 }}
               className="col-span-2 bg-black border border-cyan-800 p-4 font-mono text-xs text-cyan-600 overflow-hidden relative"
            >
               <div className="absolute top-0 left-0 w-full h-1 bg-cyan-500 opacity-30 animate-pulse"></div>
               <div className="space-y-1.5 opacity-80">
                  <p><span className="text-cyan-300">root@spawnly:~$</span> ./watch_metrics.sh --silent</p>
                  <p className="text-cyan-700">[{new Date().toLocaleTimeString()}] <span className="text-white">Connecting to Hetzner Cloud API...</span> [OK]</p>
                  <p className="text-cyan-700">[{new Date().toLocaleTimeString()}] <span className="text-white">Syncing container states ({data.servers.active} active)...</span> [OK]</p>
                  <p className="text-cyan-700">[{new Date().toLocaleTimeString()}] <span className={isProfitable ? "text-green-400" : "text-red-400"}>Profit delta calculated: {profit.toFixed(4)} EUR</span></p>
                  <p className="animate-pulse">_</p>
               </div>
            </motion.div>
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