// pages/tools/server-status.js
import { useState, useMemo } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import Image from 'next/image';
import { useTranslation } from 'next-i18next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import Navbar from '../../components/Navbar';
import ServersFooter from '../../components/ServersFooter';
import { 
  ShieldExclamationIcon, 
  CheckCircleIcon, 
  XCircleIcon,
  MagnifyingGlassIcon,
  ServerStackIcon
} from '@heroicons/react/24/outline';

const getSupportedGames = (t) => [
  { id: 'minecraft', name: t('status_checker.games.minecraft', 'Minecraft'), defaultPort: 25565, logo: '/games/minecraft-logo.webp', gamedigId: 'minecraft' },
  { id: 'satisfactory', name: t('status_checker.games.satisfactory', 'Satisfactory'), defaultPort: 7777, logo: '/games/satisfactory-logo.png', gamedigId: 'satisfactory' },
  { id: 'rust', name: t('status_checker.games.rust', 'Rust'), defaultPort: 28015, logo: '/games/rust-logo.png', gamedigId: 'rust' },
  { id: 'palworld', name: t('status_checker.games.palworld', 'Palworld'), defaultPort: 8211, logo: '/games/palworld-logo.jpg', gamedigId: 'palworld' },
  { id: 'valheim', name: t('status_checker.games.valheim', 'Valheim'), defaultPort: 2456, logo: '/games/valheim-logo.jpg', gamedigId: 'valheim' },
  { id: 'ark_sa', name: t('status_checker.games.ark_sa', 'ARK: Survival Ascended'), defaultPort: 7777, logo: '/games/ark_sa-logo.jpg', gamedigId: 'arksa' },
  { id: 'ark_se', name: t('status_checker.games.ark_se', 'ARK: Survival Evolved'), defaultPort: 7777, logo: '/games/ark_se-logo.jpg', gamedigId: 'arkse' },
  { id: 'factorio', name: t('status_checker.games.factorio', 'Factorio'), defaultPort: 34197, logo: '/games/factorio-logo.jpg', gamedigId: 'factorio' },
  { id: 'project_zomboid', name: t('status_checker.games.project_zomboid', 'Project Zomboid'), defaultPort: 16261, logo: '/games/project_zomboid-logo.jpg', gamedigId: 'projectzomboid' },
  { id: 'gmod', name: t('status_checker.games.gmod', "Garry's Mod"), defaultPort: 27015, logo: '/games/gmod-logo.jpg', gamedigId: 'garrysmod' },
  { id: 'cs2', name: t('status_checker.games.cs2', 'Counter-Strike 2'), defaultPort: 27015, logo: '/games/cs2-logo.jpg', gamedigId: 'csgo' },
  { id: 'arma3', name: t('status_checker.games.arma3', 'Arma 3'), defaultPort: 2302, logo: '/games/arma3-logo.jpg', gamedigId: 'arma3' },
  { id: 'arma_reforger', name: t('status_checker.games.arma_reforger', 'Arma Reforger'), defaultPort: 19999, logo: '/games/arma_reforger-logo.jpg', gamedigId: 'armareforger' },
  { id: 'space_engineers', name: t('status_checker.games.space_engineers', 'Space Engineers'), defaultPort: 27016, logo: '/games/space_engineers-logo.jpg', gamedigId: 'spaceengineers' },
  { id: 'seven_days_to_die', name: t('status_checker.games.seven_days_to_die', '7 Days to Die'), defaultPort: 26900, logo: '/games/7dtd-logo.jpg', gamedigId: '7d2d' },
  { id: 'conan_exiles', name: t('status_checker.games.conan_exiles', 'Conan Exiles'), defaultPort: 7777, logo: '/games/conan_exiles-logo.jpg', gamedigId: 'conanexiles' },
  { id: 'dayz', name: t('status_checker.games.dayz', 'DayZ'), defaultPort: 2302, logo: '/games/dayz-logo.jpg', gamedigId: 'dayz' },
  { id: 'enshrouded', name: t('status_checker.games.enshrouded', 'Enshrouded'), defaultPort: 15636, logo: '/games/enshrouded-logo.png', gamedigId: 'enshrouded' },
  { id: 'sons_of_the_forest', name: t('status_checker.games.sons_of_the_forest', 'Sons of the Forest'), defaultPort: 8766, logo: '/games/sotf-logo.png', gamedigId: 'sonsoftheforest' },
  { id: 'v_rising', name: t('status_checker.games.v_rising', 'V Rising'), defaultPort: 9876, logo: '/games/vrising-logo.png', gamedigId: 'vrising' },
  { id: 'core_keeper', name: t('status_checker.games.core_keeper', 'Core Keeper'), defaultPort: 27015, logo: '/games/core_keeper-logo.jpg', gamedigId: 'corekeeper' },
  { id: 'mindustry', name: t('status_checker.games.mindustry', 'Mindustry'), defaultPort: 6567, logo: '/games/mindustry-logo.png', gamedigId: 'mindustry' },
  { id: 'squad', name: t('status_checker.games.squad', 'Squad'), defaultPort: 7787, logo: '/games/squad-logo.png', gamedigId: 'squad' },
  { id: 'insurgency_sandstorm', name: t('status_checker.games.insurgency_sandstorm', 'Insurgency: Sandstorm'), defaultPort: 27102, logo: '/games/insurgency-logo.png', gamedigId: 'insurgencysandstorm' },
  { id: 'unturned', name: t('status_checker.games.unturned', 'Unturned'), defaultPort: 27015, logo: '/games/unturned-logo.png', gamedigId: 'unturned' },
  { id: 'tf2', name: t('status_checker.games.tf2', 'Team Fortress 2'), defaultPort: 27015, logo: '/games/tf2-logo.png', gamedigId: 'tf2' },
  { id: 'l4d2', name: t('status_checker.games.l4d2', 'Left 4 Dead 2'), defaultPort: 27015, logo: '/games/l4d2-logo.png', gamedigId: 'l4d2' },
  { id: 'dst', name: t('status_checker.games.dst', "Don't Starve Together"), defaultPort: 10999, logo: '/games/dst-logo.webp', gamedigId: 'dst' },
  { id: 'terraria', name: t('status_checker.games.terraria', 'Terraria'), defaultPort: 7777, logo: '/games/terraria-logo.png', gamedigId: 'terraria' },
  { id: 'stardew_valley', name: t('status_checker.games.stardew_valley', 'Stardew Valley'), defaultPort: 24642, logo: '/games/stardew-logo.webp', gamedigId: 'stardewvalley' }
];

export default function ServerStatusTool() {
  const { t } = useTranslation('tools');
  const SUPPORTED_GAMES = getSupportedGames(t);

  const [activeTab, setActiveTab] = useState('status'); 
  const [ip, setIp] = useState('');
  const [port, setPort] = useState(SUPPORTED_GAMES[0].defaultPort);
  const [selectedGame, setSelectedGame] = useState(SUPPORTED_GAMES[0]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const filteredGames = useMemo(() => {
    return SUPPORTED_GAMES.filter(game => 
      game.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [searchQuery, SUPPORTED_GAMES]);

  const handleGameSelect = (game) => {
    setSelectedGame(game);
    setPort(game.defaultPort);
    setResult(null);
  };

  const handleCheck = async (e) => {
    e.preventDefault();
    setLoading(true);
    setResult(null);

    try {
      const res = await fetch('/api/tools/network-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: activeTab, ip, port, game: selectedGame.gamedigId }),
      });
      
      const data = await res.json();
      setResult(data);
    } catch (error) {
      setResult({ error: t('status_checker.errors.connection_failed', 'Failed to connect to the testing server.') });
    } finally {
      setLoading(false);
    }
  };

  // SEO Schema Markup
  const schemaMarkup = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    "name": t('status_checker.seo.schema_name', 'Spawnly Server Status & Port Checker'),
    "url": "https://spawnly.net/tools/server-status",
    "description": t('status_checker.seo.schema_desc', 'A free diagnostic tool to test game server uptime and verify open ports.'),
    "applicationCategory": "DeveloperApplication"
  };

  return (
    <div className="min-h-screen bg-[#020617] bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-[#020617] to-[#020617] flex flex-col selection:bg-indigo-500/30">
      
      {/* SEO HEAD */}
      <Head>
        <title>{t('status_checker.seo.title', 'Server Status & Port Checker | Spawnly Free Tools')}</title>
        <meta name="description" content={t('status_checker.seo.desc', 'Free tool to check if your game server is online. Supports Minecraft, Palworld, Rust, ARK, and 25+ more games.')} />
        <link rel="canonical" href="https://spawnly.net/tools/server-status" />
        
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://spawnly.net/tools/server-status" />
        <meta property="og:title" content={t('status_checker.seo.title', 'Server Status & Port Checker | Spawnly Free Tools')} />
        <meta property="og:description" content={t('status_checker.seo.desc', 'Free tool to check if your game server is online. Supports Minecraft, Palworld, Rust, ARK, and 25+ more games.')} />
        
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schemaMarkup) }} />
      </Head>

      <Navbar />

      <main className="flex-grow w-full max-w-7xl mx-auto py-12 px-4 sm:px-6 relative">
        
        {/* Glow behind title */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3/4 h-64 bg-indigo-500/10 blur-[100px] rounded-full pointer-events-none"></div>

        {/* Header section */}
        <div className="text-center mb-10 relative z-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
          <div className="inline-flex items-center justify-center p-3 bg-indigo-500/10 rounded-2xl mb-4 border border-indigo-500/20 shadow-[0_0_30px_rgba(99,102,241,0.15)]">
            <ServerStackIcon className="w-8 h-8 text-indigo-400" />
          </div>
          <h1 className="text-4xl md:text-5xl font-extrabold text-white mb-4 tracking-tight">
            {t('status_checker.hero.title', 'Network Diagnostic Tools')}
          </h1>
          <p className="text-lg text-slate-400 max-w-2xl mx-auto">
            {t('status_checker.hero.subtitle', 'Instantly ping your game server to check uptime, or verify if your router\'s port forwarding rules are active.')}
          </p>
        </div>

        {/* Dashboard Split Container (Neo-Glassmorphism) */}
        <div className="bg-[#0f172a]/80 backdrop-blur-2xl border border-slate-700/50 rounded-[2rem] overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.5)] ring-1 ring-white/5 flex flex-col lg:flex-row relative z-10">
          
          {/* ========================================== */}
          {/* LEFT COLUMN: GAME SELECTOR (35% Width)     */}
          {/* ========================================== */}
          <div className="lg:w-[35%] bg-slate-900/50 border-b lg:border-b-0 lg:border-r border-slate-700/50 flex flex-col h-[500px] lg:h-[700px]">
            
            {/* Left Sidebar Header */}
            <div className="p-6 border-b border-slate-700/50 bg-slate-900/40">
              <h2 className="text-sm font-black text-slate-500 uppercase tracking-widest mb-4">
                {activeTab === 'status' 
                  ? t('status_checker.sidebar.step1_status', '1. Select Game to Ping') 
                  : t('status_checker.sidebar.step1_port', '1. Select Game (Auto-fills Port)')
                }
              </h2>
              <div className="relative">
                <MagnifyingGlassIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="text"
                  placeholder={t('status_checker.sidebar.search_placeholder', 'Search 30+ games...')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-900/80 backdrop-blur-md border border-slate-700/50 rounded-xl pl-11 pr-4 py-3.5 text-sm font-medium text-white placeholder:text-slate-500 focus:ring-2 focus:ring-indigo-500/50 focus:border-transparent outline-none transition-all shadow-sm"
                />
              </div>
            </div>

            {/* Scrollable Game Grid */}
            <div className="flex-grow overflow-y-auto p-5 custom-scrollbar">
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3 gap-3">
                {filteredGames.length > 0 ? filteredGames.map(game => {
                  const isActive = selectedGame.id === game.id;
                  return (
                    <div 
                      key={game.id}
                      onClick={() => handleGameSelect(game)}
                      className={`cursor-pointer rounded-xl border-2 transition-all duration-300 flex flex-col items-center justify-center p-3 gap-2 
                        ${isActive 
                          ? 'border-indigo-500/50 bg-indigo-500/10 shadow-[0_0_20px_-5px_rgba(99,102,241,0.3)] ring-1 ring-indigo-500/20' 
                          : 'border-slate-700/50 bg-slate-800/40 hover:border-slate-500/50 hover:bg-slate-800/80'}`}
                    >
                      <div className="w-10 h-10 relative">
                        <Image 
                          src={game.logo} 
                          alt={`${game.name} logo`}
                          fill
                          className="object-cover rounded-md shadow-sm" 
                        />
                      </div>
                      <span className={`text-xs text-center truncate w-full ${isActive ? 'text-indigo-300 font-bold' : 'text-slate-300 font-medium'}`}>
                        {game.name}
                      </span>
                    </div>
                  );
                }) : (
                  <div className="col-span-full py-8 text-center text-slate-500 text-sm font-medium">
                    {t('status_checker.sidebar.no_games_found', 'No games found matching "{{query}}"', { query: searchQuery })}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ========================================== */}
          {/* RIGHT COLUMN: INPUTS & RESULTS (65% Width) */}
          {/* ========================================== */}
          <div className="lg:w-[65%] flex flex-col bg-slate-900/20 p-6 md:p-10 min-h-[500px] lg:h-[700px] overflow-y-auto custom-scrollbar relative">
            
            {/* Background Orb for Right Column */}
            <div className="absolute top-0 right-0 w-80 h-80 bg-indigo-500/10 rounded-full blur-[100px] -mr-20 -mt-20 pointer-events-none"></div>

            {/* Tabs */}
            <div className="flex space-x-1 bg-slate-900/80 backdrop-blur-md p-1.5 rounded-2xl mb-8 border border-slate-700/50 relative z-10 shadow-sm">
              <button 
                onClick={() => { setActiveTab('status'); setResult(null); }} 
                className={`flex-1 py-3 text-sm font-bold rounded-xl transition-all duration-300 ${activeTab === 'status' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/25 ring-1 ring-white/10' : 'text-slate-400 hover:text-white hover:bg-slate-800/80'}`}
              >
                {t('status_checker.tabs.tab_status', 'Game Server Status')}
              </button>
              <button 
                onClick={() => { setActiveTab('port'); setResult(null); }} 
                className={`flex-1 py-3 text-sm font-bold rounded-xl transition-all duration-300 ${activeTab === 'port' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/25 ring-1 ring-white/10' : 'text-slate-400 hover:text-white hover:bg-slate-800/80'}`}
              >
                {t('status_checker.tabs.tab_port', 'Port Forwarding Tester')}
              </button>
            </div>

            <form onSubmit={handleCheck} className="space-y-6 relative z-10">
              
              {/* Context Header */}
              <div className="flex items-center gap-4 mb-5 p-4 bg-slate-900/50 rounded-2xl border border-slate-700/50">
                <Image src={selectedGame.logo} alt="Selected Game" width={40} height={40} className="rounded-lg shadow-sm" />
                <div>
                  <h3 className="text-white font-bold text-lg">
                    {activeTab === 'status' 
                      ? t('status_checker.form.context_status_title', 'Check {{game}} Server', { game: selectedGame.name }) 
                      : t('status_checker.form.context_port_title', 'Test {{game}} Port', { game: selectedGame.name })}
                  </h3>
                  <p className="text-slate-400 text-sm font-medium">
                    {activeTab === 'status' 
                      ? t('status_checker.form.context_status_desc', 'Enter the IP address of the server to ping it.') 
                      : t('status_checker.form.context_port_desc', 'Enter your public IP to see if the port is open.')}
                  </p>
                </div>
              </div>

              {/* Inputs Container */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                <div className="md:col-span-2">
                  <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2">{t('status_checker.form.ip_label', 'IP Address / Domain')}</label>
                  <input
                    type="text"
                    required
                    placeholder={t('status_checker.form.ip_placeholder', 'e.g., 192.168.1.1 or play.server.com')}
                    className="w-full bg-slate-900/80 backdrop-blur-md border border-slate-700/50 rounded-xl px-4 py-4 text-white font-medium placeholder:text-slate-600 focus:ring-2 focus:ring-indigo-500/50 outline-none transition-all shadow-sm"
                    value={ip}
                    onChange={(e) => setIp(e.target.value)}
                  />
                </div>
                
                <div>
                  <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2">{t('status_checker.form.port_label', 'Port')}</label>
                  <input
                    type="number"
                    required
                    className="w-full bg-slate-900/80 backdrop-blur-md border border-slate-700/50 rounded-xl px-4 py-4 text-white font-medium placeholder:text-slate-600 focus:ring-2 focus:ring-indigo-500/50 outline-none transition-all shadow-sm"
                    value={port}
                    onChange={(e) => setPort(e.target.value)}
                  />
                </div>
              </div>

              <button 
                type="submit" 
                disabled={loading} 
                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-lg py-4 rounded-xl transition-all shadow-[0_0_20px_rgba(99,102,241,0.3)] hover:shadow-[0_0_30px_rgba(99,102,241,0.5)] flex justify-center items-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed hover:-translate-y-0.5 ring-1 ring-white/10"
              >
                {loading ? (
                  <>
                    <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                    {t('status_checker.form.btn_loading', 'Running Diagnostics...')}
                  </>
                ) : (
                  t('status_checker.form.btn_submit', 'Execute Network Test')
                )}
              </button>
            </form>

            {/* Results Area */}
            {result && (
              <div className="mt-8 pt-8 border-t border-slate-700/50 animate-in fade-in slide-in-from-bottom-4 duration-500 flex-grow relative z-10">
                
                {/* Port Checker Result */}
                {activeTab === 'port' && (
                  <div className={`p-6 rounded-2xl border shadow-inner backdrop-blur-md ${result.open ? 'bg-emerald-500/10 border-emerald-500/30 ring-1 ring-emerald-500/20' : 'bg-rose-500/10 border-rose-500/30 ring-1 ring-rose-500/20'}`}>
                    <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5 text-center sm:text-left">
                      {result.open ? <CheckCircleIcon className="w-12 h-12 text-emerald-400 flex-shrink-0 drop-shadow-md" /> : <XCircleIcon className="w-12 h-12 text-rose-400 flex-shrink-0 drop-shadow-md" />}
                      <div>
                        <h3 className={`text-xl font-extrabold tracking-tight ${result.open ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {result.open 
                            ? t('status_checker.results.port_open', 'Port {{port}} is Open!', { port }) 
                            : t('status_checker.results.port_closed', 'Port {{port}} is Closed', { port })}
                        </h3>
                        <p className="text-slate-300 mt-1.5 font-medium">{result.message}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Status Checker Result */}
                {activeTab === 'status' && (
                  <div className={`p-6 rounded-2xl border shadow-inner backdrop-blur-md ${result.online ? 'bg-emerald-500/10 border-emerald-500/30 ring-1 ring-emerald-500/20' : 'bg-rose-500/10 border-rose-500/30 ring-1 ring-rose-500/20'}`}>
                    <div className="flex flex-col md:flex-row items-center md:items-start gap-5">
                      {result.online ? <CheckCircleIcon className="w-12 h-12 text-emerald-400 flex-shrink-0 drop-shadow-md" /> : <XCircleIcon className="w-12 h-12 text-rose-400 flex-shrink-0 drop-shadow-md" />}
                      <div className="w-full text-center md:text-left">
                        <h3 className={`text-xl font-extrabold tracking-tight ${result.online ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {result.online ? t('status_checker.results.server_online', 'Server is Online!') : t('status_checker.results.server_offline', 'Server is Offline')}
                        </h3>
                        {result.online ? (
                          <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="bg-slate-900/80 p-3.5 rounded-xl border border-slate-700/50 shadow-sm">
                              <span className="text-[10px] text-slate-500 uppercase font-black tracking-widest">{t('status_checker.results.hostname', 'Hostname')}</span>
                              <p className="text-white text-sm font-bold truncate mt-1">{result.name}</p>
                            </div>
                            <div className="bg-slate-900/80 p-3.5 rounded-xl border border-slate-700/50 shadow-sm">
                              <span className="text-[10px] text-slate-500 uppercase font-black tracking-widest">{t('status_checker.results.players', 'Players')}</span>
                              <p className="text-white text-sm font-bold mt-1">{result.players} / {result.maxPlayers}</p>
                            </div>
                          </div>
                        ) : (
                          <p className="text-slate-300 mt-1.5 font-medium">{result.message}</p>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* The Conversion Upsell */}
                {((activeTab === 'port' && !result.open) || (activeTab === 'status' && !result.online)) && (
                  <div className="mt-6 bg-gradient-to-br from-indigo-900/40 to-purple-900/40 border border-indigo-500/30 p-6 rounded-2xl flex flex-col items-center text-center gap-4 shadow-lg">
                    <div>
                      <h4 className="text-lg font-extrabold text-white flex items-center justify-center gap-2">
                        <ShieldExclamationIcon className="w-6 h-6 text-indigo-400" />
                        {t('status_checker.upsell.title', 'Network issues driving you crazy?')}
                      </h4>
                      <p className="text-indigo-200/80 mt-2 text-sm font-medium leading-relaxed max-w-md mx-auto"
                         dangerouslySetInnerHTML={{ __html: t('status_checker.upsell.desc', 'Skip the router configurations. Get a pre-configured <strong>{{game}}</strong> server running on DDoS-protected enterprise hardware instantly.', { game: selectedGame.name }) }}
                      />
                    </div>
                    <Link href="/pricing" className="px-8 py-3.5 bg-indigo-500 hover:bg-indigo-400 text-white font-bold rounded-xl transition-all duration-300 shadow-[0_0_20px_rgba(99,102,241,0.3)] hover:shadow-[0_0_30px_rgba(99,102,241,0.5)] ring-1 ring-white/10 hover:-translate-y-0.5">
                      {t('status_checker.upsell.btn', 'View {{game}} Hosting', { game: selectedGame.name })}
                    </Link>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* --- SEO TEXT SECTION --- */}
        <section className="max-w-4xl mx-auto mt-24 space-y-8 text-slate-300 relative z-10">
          <div className="bg-slate-800/30 backdrop-blur-sm border border-slate-700/50 p-6 lg:p-8 rounded-3xl shadow-sm">
            <h2 className="text-2xl font-bold text-white mb-4 tracking-tight">{t('status_checker.seo_text.q1_title', 'Why is my game server port closed?')}</h2>
            <p className="leading-relaxed font-medium text-slate-400 text-sm">
              {t('status_checker.seo_text.q1_desc', 'If our Port Forwarding Tester says your port is closed, outside players will not be able to join your server. This usually happens for three reasons: your ISP uses CGNAT (meaning you don\'t have a true public IP), your router\'s port forwarding rules are set up incorrectly, or Windows Defender Firewall is blocking the application.')}
            </p>
          </div>
          
          <div className="bg-slate-800/30 backdrop-blur-sm border border-slate-700/50 p-6 lg:p-8 rounded-3xl shadow-sm">
            <h2 className="text-2xl font-bold text-white mb-4 tracking-tight">{t('status_checker.seo_text.q2_title', 'How does the Server Status Checker work?')}</h2>
            <p className="leading-relaxed font-medium text-slate-400 text-sm">
              {t('status_checker.seo_text.q2_desc', 'Our tool sends a direct network query using the specific protocol for your selected game. We use the official query protocols (like the Source Engine Query or standard Minecraft Ping) to reach out to the IP and Port provided. If the server responds, we display the active map, hostname, and player count.')}
            </p>
          </div>
        </section>

      </main>

      {/* Tailwind Custom Scrollbar Styling */}
      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 8px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent; 
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(51, 65, 85, 0.6);
          border-radius: 10px;
          border: 2px solid transparent;
          background-clip: padding-box;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(79, 70, 229, 0.8);
          border: 2px solid transparent;
          background-clip: padding-box;
        }
      `}</style>

      <ServersFooter />
    </div>
  );
}

// Ensure SSR Translations are loaded
export async function getStaticProps({ locale }) {
  return {
    props: {
      ...(await serverSideTranslations(locale, ['common', 'tools', 'navbar', 'footer'])),
    },
  };
}