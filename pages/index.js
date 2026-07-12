import React, { useRef, useState, useMemo } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useTranslation } from 'next-i18next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { getGamesList } from '../lib/gamesList'; // <--- IMPORT ADDED

export default function Home() {
  const { t } = useTranslation('landing');
  const scrollContainerRef = useRef(null);

  // Drag-to-scroll state & refs
  const [isDragging, setIsDragging] = useState(false);
  const startX = useRef(0);
  const scrollLeft = useRef(0);
  const dragDistance = useRef(0);

  // --- MASSIVE CLEANUP ---
  // We now pull the centralized games list which already includes 
  // the perfect translation keys from your landing.json file!
  const featuredGames = useMemo(() => getGamesList(t), [t]);

  // Desktop navigation for the carousel arrows
  const scroll = (direction) => {
    if (scrollContainerRef.current) {
      const { current } = scrollContainerRef;
      const scrollAmount = current.clientWidth * 0.7; 
      current.scrollBy({ left: direction === 'left' ? -scrollAmount : scrollAmount, behavior: 'smooth' });
    }
  };

  // --- Drag to Scroll Handlers ---
  const handleMouseDown = (e) => {
    setIsDragging(true);
    dragDistance.current = 0;
    startX.current = e.pageX - scrollContainerRef.current.offsetLeft;
    scrollLeft.current = scrollContainerRef.current.scrollLeft;
    // Disable scroll snapping while actively dragging for fluidity
    scrollContainerRef.current.style.scrollSnapType = 'none';
  };

  const handleMouseLeaveOrUp = () => {
    setIsDragging(false);
    // Re-enable scroll snapping when released
    if (scrollContainerRef.current) {
      scrollContainerRef.current.style.scrollSnapType = 'x mandatory';
    }
  };

  const handleMouseMove = (e) => {
    if (!isDragging) return;
    e.preventDefault();
    const x = e.pageX - scrollContainerRef.current.offsetLeft;
    const walk = (x - startX.current) * 1.5; // Multiply for faster scrolling
    dragDistance.current = Math.abs(walk);
    scrollContainerRef.current.scrollLeft = scrollLeft.current - walk;
  };

  // Prevent navigating if the user was just dragging the carousel
  const handleLinkClick = (e) => {
    if (dragDistance.current > 10) {
      e.preventDefault();
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-300 font-sans selection:bg-blue-500/30 transition-colors duration-300 overflow-x-hidden">
      <Head>
        <title>{t('seo.title', 'Spawnly | Premium Game Server Hosting')}</title>
        <meta name="description" content={t('seo.description', 'High-performance game servers for Minecraft, Satisfactory, and more. Pay hourly, control everything.')} />
      </Head>

      <Navbar />

      <main className="flex-grow w-full">
        {/* === HERO SECTION === */}
        <section className="relative pt-32 pb-20 lg:pt-40 lg:pb-28 overflow-hidden border-b border-slate-200 dark:border-slate-800/50">
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#cbd5e1_1px,transparent_1px),linear-gradient(to_bottom,#cbd5e1_1px,transparent_1px)] dark:bg-[linear-gradient(to_right,#1e293b_1px,transparent_1px),linear-gradient(to_bottom,#1e293b_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] opacity-30 dark:opacity-20 transition-colors duration-300"></div>

          <div className="w-full px-6 md:px-12 lg:px-24 relative z-10">
            <div className="grid lg:grid-cols-2 gap-12 items-center">
              <div className="text-center lg:text-left">
                <h1 className="text-5xl lg:text-7xl font-bold tracking-tight text-slate-900 dark:text-white leading-tight mb-6">
                  {t('hero.title_p1', 'Command Your')} <br />
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-400 dark:to-indigo-400">
                    {t('hero.title_p2', 'Multiplayer Universe.')}
                  </span>
                </h1>
                
                <p className="text-lg md:text-xl text-slate-600 dark:text-slate-400 mb-10 max-w-2xl mx-auto lg:mx-0">
                  {t('hero.subtitle', 'Containerized hosting for Minecraft and Satisfactory. Experience zero-lag NVMe performance, fractional hourly billing, and absolute control via our custom-built management panel.')}
                </p>
                
                <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4">
                  <Link href="/register" className="w-full sm:w-auto px-8 py-4 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-semibold transition-all shadow-[0_0_20px_rgba(37,99,235,0.2)] dark:shadow-[0_0_20px_rgba(37,99,235,0.3)]">
                    {t('hero.cta_primary', 'Deploy a Server')}
                  </Link>
                  <Link href="/pricing" className="w-full sm:w-auto px-8 py-4 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700 rounded-lg font-semibold transition-colors">
                    {t('hero.cta_secondary', 'View Pricing')}
                  </Link>
                </div>
              </div>

              {/* Server UI Abstract Mockup */}
              <div className="hidden lg:block relative perspective-1000">
                <div className="w-full max-w-xl ml-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/50 rounded-xl shadow-2xl overflow-hidden transform rotate-y-[-10deg] rotate-x-[5deg] hover:rotate-y-0 hover:rotate-x-0 transition-transform duration-700">
                  <div className="flex items-center px-4 py-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900">
                    <div className="flex space-x-2">
                      <div className="w-3 h-3 rounded-full bg-slate-300 dark:bg-slate-700"></div>
                      <div className="w-3 h-3 rounded-full bg-slate-300 dark:bg-slate-700"></div>
                      <div className="w-3 h-3 rounded-full bg-slate-300 dark:bg-slate-700"></div>
                    </div>
                    <div className="mx-auto text-xs font-semibold text-slate-500">{t('mockup.status', 'Node Status')}</div>
                  </div>
                  <div className="p-6 space-y-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-slate-900 dark:text-white font-semibold">{t('mockup.server_name', 'Satisfactory Dedicated')}</h3>
                        <p className="text-xs text-green-500 dark:text-green-400 flex items-center mt-1">
                          <span className="w-2 h-2 rounded-full bg-green-500 mr-2 animate-pulse"></span> {t('mockup.online', 'Online')} (Port: 7777)
                        </p>
                      </div>
                    </div>
                    <div className="space-y-4">
                      <div>
                        <div className="flex justify-between text-xs mb-2">
                          <span className="text-slate-500 dark:text-slate-400">{t('mockup.cpu_load', 'CPU Load')}</span>
                          <span className="text-slate-900 dark:text-white">28%</span>
                        </div>
                        <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                          <div className="h-full bg-blue-500 rounded-full w-[28%]"></div>
                        </div>
                      </div>
                      <div>
                        <div className="flex justify-between text-xs mb-2">
                          <span className="text-slate-500 dark:text-slate-400">{t('mockup.memory', 'Memory (RAM)')}</span>
                          <span className="text-slate-900 dark:text-white">6.4 / 16 GB</span>
                        </div>
                        <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                          <div className="h-full bg-indigo-500 rounded-full w-[40%]"></div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* === STEAM BIG PICTURE STYLE CAROUSEL === */}
        <section className="py-20 bg-slate-950 border-b border-slate-900 relative overflow-hidden">
          {/* Deep dark gradient to force the "Big Picture" aesthetic regardless of system theme */}
          <div className="absolute inset-0 bg-gradient-to-b from-[#0e1420] to-[#0a0f18] pointer-events-none"></div>
          
          <div className="w-full relative z-10">
            <div className="px-6 md:px-12 lg:px-24 mb-6 flex justify-between items-end">
              <div>
                <h2 className="text-3xl md:text-4xl font-bold text-white mb-2 tracking-tight">
                  {t('carousel.title', 'Library')}
                </h2>
                <p className="text-slate-400 text-lg">
                  {t('carousel.subtitle', 'Select a title to deploy your dedicated server.')}
                </p>
              </div>
              
              {/* Desktop Navigation Arrows */}
              <div className="hidden md:flex gap-3">
                <button 
                  onClick={() => scroll('left')} 
                  className="p-3 rounded-full bg-slate-800/80 text-white hover:bg-slate-700 hover:text-blue-400 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
                  aria-label="Scroll left"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" /></svg>
                </button>
                <button 
                  onClick={() => scroll('right')} 
                  className="p-3 rounded-full bg-slate-800/80 text-white hover:bg-slate-700 hover:text-blue-400 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
                  aria-label="Scroll right"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" /></svg>
                </button>
              </div>
            </div>

            {/* Horizontal Scrolling Container with Mouse Drag Events */}
            <div 
              ref={scrollContainerRef}
              onMouseDown={handleMouseDown}
              onMouseLeave={handleMouseLeaveOrUp}
              onMouseUp={handleMouseLeaveOrUp}
              onMouseMove={handleMouseMove}
              className={`flex gap-6 overflow-x-auto snap-x snap-mandatory px-6 md:px-12 lg:px-24 pb-12 pt-4 custom-scrollbar ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
              style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
            >
              {featuredGames.map((game) => (
                <div 
                  key={game.id}
                  className="group relative flex-none w-[85vw] sm:w-[55vw] md:w-[45vw] lg:w-[32vw] xl:w-[28vw] aspect-[16/9] snap-center rounded-xl overflow-hidden bg-slate-900 block transition-all duration-300 transform hover:scale-[1.03] border-2 border-transparent hover:border-blue-500 focus-within:border-blue-500 focus-within:scale-[1.03] shadow-lg hover:shadow-[0_0_30px_rgba(59,130,246,0.3)] focus-within:shadow-[0_0_30px_rgba(59,130,246,0.3)] select-none"
                >
                  <img
                    src={game.image}
                    alt={game.name}
                    draggable={false}
                    className="absolute inset-0 w-full h-full object-cover pointer-events-none transition-transform duration-700 group-hover:scale-105 group-focus-within:scale-105"
                  />
                  {/* Vignette Overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-900/50 to-transparent opacity-90 transition-opacity duration-300 group-hover:opacity-80 group-focus-within:opacity-80 pointer-events-none"></div>

                  <div className="absolute inset-0 p-6 flex flex-col justify-end">
                    <div className="transform transition-transform duration-300 translate-y-12 group-hover:translate-y-0 group-focus-within:translate-y-0">
                      <h3 className="text-2xl md:text-3xl font-bold text-white mb-1 drop-shadow-lg">
                        {game.name}
                      </h3>
                      <p className={`text-sm font-semibold ${game.accent} mb-3 drop-shadow-md`}>
                        {game.edition}
                      </p>
                      
                      <div className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-300 delay-75">
                        <p className="text-slate-300 text-sm mb-4 line-clamp-2">
                          {game.description}
                        </p>
                        <div className="flex gap-3">
                          <Link 
                            href={`/register?game=${game.id}`}
                            onClick={handleLinkClick}
                            draggable={false}
                            className={`flex-1 px-4 py-2 text-white text-sm font-bold rounded shadow-md transition-colors text-center ${game.btnBg} ${game.btnHover}`}
                          >
                            {t('carousel.host_button', { defaultValue: 'Host {{game}}', game: game.name })}
                          </Link>
                          <Link 
                            href={`/pricing?game=${game.id}`}
                            onClick={handleLinkClick}
                            draggable={false}
                            className="flex-1 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-sm font-bold rounded shadow-md transition-colors text-center border border-slate-600"
                          >
                            {t('carousel.pricing_button', { defaultValue: 'View Pricing' })}
                          </Link>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* === FEATURE DEEP DIVES === */}
        <section className="py-24 bg-slate-50 dark:bg-slate-950/50">
          <div className="w-full px-6 md:px-12 lg:px-24 space-y-32">
            
            {/* Deep Dive 1: Console & Files */}
            <div className="grid md:grid-cols-2 gap-12 items-center">
              <div className="order-2 md:order-1">
                <div className="bg-slate-200 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-2xl aspect-[4/3] p-6 shadow-inner relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-full h-8 bg-slate-300 dark:bg-slate-950 flex items-center px-4 space-x-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-red-500"></div><div className="w-2.5 h-2.5 rounded-full bg-yellow-500"></div><div className="w-2.5 h-2.5 rounded-full bg-green-500"></div>
                  </div>
                  <div className="mt-6 font-mono text-xs md:text-sm text-slate-700 dark:text-slate-400 space-y-2">
                    <p>[10:45:12] <span className="text-blue-600 dark:text-blue-400">INFO</span>: Starting minecraft server version 1.20.4</p>
                    <p>[10:45:14] <span className="text-blue-600 dark:text-blue-400">INFO</span>: Loading properties</p>
                    <p>[10:45:14] <span className="text-blue-600 dark:text-blue-400">INFO</span>: Default game type: SURVIVAL</p>
                    <p>[10:45:15] <span className="text-green-600 dark:text-green-400">INFO</span>: Done (3.124s)! For help, type "help"</p>
                    <div className="mt-4 flex items-center border-t border-slate-300 dark:border-slate-800 pt-4">
                      <span className="mr-2">&gt;</span>
                      <span className="w-2 h-4 bg-slate-500 dark:bg-slate-400 animate-pulse"></span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="order-1 md:order-2 lg:pl-12">
                <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-xl flex items-center justify-center mb-6">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                </div>
                <h2 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-white mb-4">
                  {t('deepdive.access.title', 'Raw Access & Control.')}
                </h2>
                <p className="text-lg text-slate-600 dark:text-slate-400 leading-relaxed mb-6">
                  {t('deepdive.access.desc', 'Stop relying on FTP clients. Our built-in web file manager lets you edit configs, upload worlds, and manage mods directly from your browser. Pair that with our live WebSocket console to issue commands in real-time.')}
                </p>
              </div>
            </div>

            {/* Deep Dive 2: Team Access */}
            <div className="grid md:grid-cols-2 gap-12 items-center">
              <div className="lg:pr-12">
                <div className="w-12 h-12 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-xl flex items-center justify-center mb-6">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"></path></svg>
                </div>
                <h2 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-white mb-4">
                  {t('deepdive.teams.title', 'Built for Teams.')}
                </h2>
                <p className="text-lg text-slate-600 dark:text-slate-400 leading-relaxed mb-6">
                  {t('deepdive.teams.desc', "Don't share your password. Use our advanced Role-Based Access Control (RBAC) to invite friends or admins to your server. Grant them specific permissions like 'Start/Stop', 'Edit Files', or 'View Console' safely.")}
                </p>
              </div>
              <div>
                 <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xl">
                    <h4 className="font-semibold text-slate-900 dark:text-white mb-4 border-b border-slate-100 dark:border-slate-800 pb-2">
                      {t('deepdive.teams.sub_access', 'Sub-User Access')}
                    </h4>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-indigo-500 text-white flex items-center justify-center text-xs font-bold">JD</div>
                          <div>
                            <p className="text-sm font-semibold text-slate-900 dark:text-white">john@example.com</p>
                            <p className="text-xs text-slate-500">{t('roles.co_admin', 'Co-Admin')}</p>
                          </div>
                        </div>
                        <span className="px-2 py-1 text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded">
                          {t('roles.full_access', 'Full Access')}
                        </span>
                      </div>
                      <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-slate-400 dark:bg-slate-600 text-white flex items-center justify-center text-xs font-bold">MK</div>
                          <div>
                            <p className="text-sm font-semibold text-slate-900 dark:text-white">mike@example.com</p>
                            <p className="text-xs text-slate-500">{t('roles.moderator', 'Moderator')}</p>
                          </div>
                        </div>
                        <span className="px-2 py-1 text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded">
                          {t('roles.console_only', 'Console Only')}
                        </span>
                      </div>
                    </div>
                 </div>
              </div>
            </div>

          </div>
        </section>

        {/* === FEATURE GRID === */}
        <section className="py-24 border-t border-slate-200 dark:border-slate-800/50">
          <div className="w-full px-6 md:px-12 lg:px-24">
            <div className="text-center max-w-3xl mx-auto mb-16">
              <h2 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-white mb-4">
                {t('features.title', 'Everything you need to host.')}
              </h2>
              <p className="text-slate-600 dark:text-slate-400 text-lg">
                {t('features.subtitle', 'A comprehensive suite of tools built specifically for community leaders and game server admins.')}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-8 hover:border-blue-500/50 transition-colors shadow-sm dark:shadow-none">
                <div className="w-12 h-12 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-lg flex items-center justify-center mb-6">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                </div>
                <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-3">{t('features.billing.title', 'Fractional Hourly Billing')}</h3>
                <p className="text-slate-600 dark:text-slate-400 leading-relaxed text-sm">
                  {t('features.billing.desc', 'Top up credits via Stripe and pay strictly for the hours your server is online. Turn it off, and the meter stops instantly.')}
                </p>
              </div>

               <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-8 hover:border-blue-500/50 transition-colors shadow-sm dark:shadow-none">
                <div className="w-12 h-12 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-lg flex items-center justify-center mb-6">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                </div>
                <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-3">{t('features.schedules.title', 'Automated Schedules')}</h3>
                <p className="text-slate-600 dark:text-slate-400 leading-relaxed text-sm">
                  {t('features.schedules.desc', 'Set up cron jobs to automatically restart your server, send broadcast commands to players, or trigger routine backups while you sleep.')}
                </p>
              </div>

               <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-8 hover:border-blue-500/50 transition-colors shadow-sm dark:shadow-none">
                <div className="w-12 h-12 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-lg flex items-center justify-center mb-6">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path></svg>
                </div>
                <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-3">{t('features.mods.title', '1-Click Mod Manager')}</h3>
                <p className="text-slate-600 dark:text-slate-400 leading-relaxed text-sm">
                  {t('features.mods.desc', 'Deep integration with CurseForge and SteamCMD. Search, install, and update modpacks and server plugins with a single click.')}
                </p>
              </div>

               <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-8 hover:border-blue-500/50 transition-colors shadow-sm dark:shadow-none">
                <div className="w-12 h-12 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-lg flex items-center justify-center mb-6">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                </div>
                <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-3">{t('features.world.title', 'World Management')}</h3>
                <p className="text-slate-600 dark:text-slate-400 leading-relaxed text-sm">
                  {t('features.world.desc', 'Upload your existing single-player saves directly to the cloud, or download your server\'s map to keep a local copy safe.')}
                </p>
              </div>

               <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-8 hover:border-blue-500/50 transition-colors shadow-sm dark:shadow-none">
                <div className="w-12 h-12 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-lg flex items-center justify-center mb-6">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2"></path></svg>
                </div>
                <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-3">{t('features.backups.title', 'Secure Backups')}</h3>
                <p className="text-slate-600 dark:text-slate-400 leading-relaxed text-sm">
                  {t('features.backups.desc', 'Never lose progress. Create manual restore points instantly, or rely on our automated backup system to keep your data safe.')}
                </p>
              </div>

               <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-8 hover:border-blue-500/50 transition-colors shadow-sm dark:shadow-none">
                <div className="w-12 h-12 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-lg flex items-center justify-center mb-6">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"></path></svg>
                </div>
                <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-3">{t('features.isolation.title', 'Hard Isolation')}</h3>
                <p className="text-slate-600 dark:text-slate-400 leading-relaxed text-sm">
                  {t('features.isolation.desc', 'Every server runs in a dedicated Docker/Kubernetes container environment, guaranteeing your CPU and RAM are never throttled by noisy neighbors.')}
                </p>
              </div>

            </div>
          </div>
        </section>

        {/* === BOTTOM CTA === */}
        <section className="py-24 relative overflow-hidden bg-white dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800/50">
          <div className="absolute inset-0 bg-blue-50 dark:bg-blue-600/5"></div>
          
          <div className="w-full px-6 md:px-12 lg:px-24 relative z-10 text-center">
            <h2 className="text-4xl md:text-5xl font-bold text-slate-900 dark:text-white mb-6">
              {t('cta.title', 'Ready to start your community?')}
            </h2>
            <p className="text-xl text-slate-600 dark:text-slate-300 mb-10 max-w-2xl mx-auto">
              {t('cta.subtitle', 'Create an account, add credits, and have your server online in less than 60 seconds.')}
            </p>
            <Link href="/register" className="inline-block px-10 py-4 bg-blue-600 text-white rounded-lg font-bold text-lg hover:bg-blue-700 transition-all shadow-xl hover:shadow-2xl hover:-translate-y-1">
              {t('cta.button', 'Get Started Now')}
            </Link>
          </div>
        </section>
      </main>

      <Footer />
      
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes bounce-x {
          0%, 100% { transform: translateX(0); }
          50% { transform: translateX(25%); }
        }
        .animate-bounce-x {
          animation: bounce-x 1.5s infinite ease-in-out;
        }
        .custom-scrollbar::-webkit-scrollbar {
          display: none;
        }
      `}} />
    </div>
  );
}

export async function getStaticProps({ locale }) {
  return {
    props: {
      ...(await serverSideTranslations(locale, ['landing', 'common'])),
    },
  };
}