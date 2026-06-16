import React, { useState, useCallback, useMemo } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useTranslation } from 'next-i18next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';

export default function Home() {
  const { t } = useTranslation('landing');
  const [currentIndex, setCurrentIndex] = useState(0);

  // Drag and Swipe State
  const [dragStartX, setDragStartX] = useState(0);
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  // Array of games wrapped in useMemo so translations update when language changes
  const featuredGames = useMemo(() => [
    {
      id: 'minecraft',
      name: 'Minecraft',
      edition: t('carousel.minecraft.edition', 'Java & Bedrock Edition'),
      description: t('carousel.minecraft.desc', 'Instantly deploy high-performance servers with full plugin and modpack support.'),
      image: '/games/minecraft-bg.jpg',
      accent: 'text-green-400',
      btnBg: 'bg-green-500',
      btnHover: 'hover:bg-green-600'
    },
    {
      id: 'satisfactory',
      name: 'Satisfactory',
      edition: t('carousel.satisfactory.edition', '1.0 Dedicated Servers'),
      description: t('carousel.satisfactory.desc', 'Build massive factories without lag. Optimized for continuous background processing.'),
      image: '/games/satisfactory-bg.jpg',
      accent: 'text-orange-400',
      btnBg: 'bg-orange-500',
      btnHover: 'hover:bg-orange-600'
    },
    {
      id: 'rust',
      name: 'Rust',
      edition: t('carousel.rust.edition', 'Vanilla & Modded'),
      description: t('carousel.rust.desc', 'Survive the wipe with extreme NVMe performance for seamless monument loading.'),
      image: '/games/rust-bg.jpg',
      accent: 'text-red-500',
      btnBg: 'bg-red-600',
      btnHover: 'hover:bg-red-700'
    }
  ], [t]);

  // Handlers for Deck Navigation
  const nextSlide = useCallback(() => {
    setCurrentIndex((prev) => (prev === featuredGames.length - 1 ? 0 : prev + 1));
  }, [featuredGames.length]);

  const prevSlide = useCallback(() => {
    setCurrentIndex((prev) => (prev === 0 ? featuredGames.length - 1 : prev - 1));
  }, [featuredGames.length]);

  // Drag Handlers
  const handleDragStart = (e) => {
    setIsDragging(true);
    setDragStartX(e.type.includes('mouse') ? e.clientX : e.touches[0].clientX);
  };

  const handleDragMove = (e) => {
    if (!isDragging) return;
    const currentX = e.type.includes('mouse') ? e.clientX : e.touches[0].clientX;
    setDragOffset(currentX - dragStartX);
  };

  const handleDragEnd = () => {
    setIsDragging(false);
    if (dragOffset > 50) {
      prevSlide(); 
    } else if (dragOffset < -50) {
      nextSlide(); 
    }
    setDragOffset(0);
  };

  // Helper to calculate 3D card classes based on its position relative to the center
  const getCardClasses = (index) => {
    const total = featuredGames.length;
    const diff = (index - currentIndex + total) % total;

    if (diff === 0) {
      return `z-30 scale-100 translate-x-0 opacity-100 shadow-2xl`;
    } else if (diff === 1) {
      return `z-20 scale-90 translate-x-[15%] md:translate-x-[30%] opacity-50 blur-[2px] cursor-pointer hover:opacity-80`;
    } else if (diff === total - 1) {
      return `z-20 scale-90 -translate-x-[15%] md:-translate-x-[30%] opacity-50 blur-[2px] cursor-pointer hover:opacity-80`;
    } else {
      return `z-10 scale-75 opacity-0 pointer-events-none`;
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

        {/* === INTERACTIVE 3D GAME DECK === */}
        <section className="py-24 bg-slate-100 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800/50 overflow-hidden">
          <div className="w-full px-6 md:px-12 lg:px-24">
            <div className="text-center mb-16">
              <h2 className="text-3xl font-bold text-slate-900 dark:text-white mb-3">{t('carousel.title', 'Deploy Your Next Adventure')}</h2>
              <p className="text-slate-500 dark:text-slate-400 flex items-center justify-center gap-2">
                <svg className="w-5 h-5 animate-bounce-x" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"></path></svg>
                {t('carousel.drag_instruction', 'Drag left or right to explore')}
              </p>
            </div>

            {/* Deck Container */}
            <div 
              className="relative w-full max-w-6xl mx-auto h-[500px] flex items-center justify-center cursor-grab active:cursor-grabbing select-none perspective-1000"
              onMouseDown={handleDragStart}
              onMouseMove={handleDragMove}
              onMouseUp={handleDragEnd}
              onMouseLeave={handleDragEnd}
              onTouchStart={handleDragStart}
              onTouchMove={handleDragMove}
              onTouchEnd={handleDragEnd}
            >
              {featuredGames.map((game, index) => {
                const isCenter = index === currentIndex;
                
                return (
                  <div
                    key={game.id}
                    onClick={() => {
                      if (!isCenter) setCurrentIndex(index);
                    }}
                    className={`absolute w-[85%] md:w-[60%] lg:w-[50%] h-[450px] rounded-2xl overflow-hidden border border-slate-300 dark:border-slate-700 transition-all duration-500 ease-out ${getCardClasses(index)}`}
                    style={{
                      transform: isCenter && isDragging ? `translateX(${dragOffset}px) scale(1)` : '',
                    }}
                  >
                    <img
                      src={game.image}
                      alt={game.name}
                      className="absolute inset-0 w-full h-full object-cover pointer-events-none"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-900/80 to-transparent pointer-events-none"></div>

                    {/* Card Content */}
                    <div className="absolute bottom-0 left-0 w-full p-8 md:p-10 pointer-events-none">
                      <h3 className="text-4xl md:text-5xl font-black text-white tracking-tight mb-2">
                        {game.name}
                      </h3>
                      <p className={`text-lg font-semibold ${game.accent} mb-4`}>
                        {game.edition}
                      </p>
                      
                      <div className={`transition-opacity duration-300 ${isCenter ? 'opacity-100' : 'opacity-0'}`}>
                        <p className="text-slate-300 text-sm md:text-base mb-6 max-w-md">
                          {game.description}
                        </p>
                        <Link 
                          href="/register" 
                          className={`pointer-events-auto inline-block px-8 py-3 text-white font-bold rounded-lg shadow-lg transition-colors ${game.btnBg} ${game.btnHover}`}
                          onMouseDown={(e) => e.stopPropagation()} 
                          onTouchStart={(e) => e.stopPropagation()}
                        >
                          {t('carousel.host_button', 'Host {{game}}', { game: game.name })}
                        </Link>
                      </div>
                    </div>
                  </div>
                );
              })}
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