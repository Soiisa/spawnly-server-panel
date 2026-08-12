import React, { useMemo } from 'react';
import Link from 'next/link';
import { useTranslation } from 'next-i18next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import {
  BoltIcon,
  ClockIcon,
  WrenchScrewdriverIcon,
  CircleStackIcon,
  ArchiveBoxIcon,
  CubeIcon,
  CommandLineIcon,
  UsersIcon,
  ArrowRightIcon,
} from '@heroicons/react/24/outline';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import SEO from '../components/SEO';
import { getGamesList } from '../lib/gamesList';

const SITE_URL = process.env.SITE_URL || 'https://spawnly.net';

function Eyebrow({ children }) {
  return (
    <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-emerald-600 dark:text-emerald-400 mb-3">
      {children}
    </p>
  );
}

export default function Home() {
  const { t } = useTranslation('landing');
  const games = useMemo(() => getGamesList(t), [t]);
  const showcaseGames = games.slice(0, 7);

  const specs = [
    { value: '<60s', label: t('stats.deploy', 'deploy_time') },
    { value: '99.9%', label: t('stats.uptime', 'uptime') },
    { value: '480Gbps', label: t('stats.ddos', 'ddos_shield') },
    { value: '30+', label: t('stats.games', 'games_supported') },
  ];

  const steps = [
    {
      n: '01',
      title: t('steps.choose.title', 'Choose your game'),
      desc: t('steps.choose.desc', 'Pick from 30+ supported titles, from Minecraft to hardcore survival games.'),
    },
    {
      n: '02',
      title: t('steps.configure.title', 'Configure resources'),
      desc: t('steps.configure.desc', 'Slide to the RAM you need and choose hourly or monthly billing. No contracts.'),
    },
    {
      n: '03',
      title: t('steps.deploy.title', 'Deploy instantly'),
      desc: t('steps.deploy.desc', 'Your container spins up in under a minute, ready to invite your community.'),
    },
  ];

  const bigFeatures = [
    {
      icon: CommandLineIcon,
      title: t('deepdive.access.title', 'Raw access & control'),
      desc: t('deepdive.access.desc', 'Stop relying on FTP clients. Our built-in web file manager lets you edit configs, upload worlds, and manage mods directly from your browser, paired with a live WebSocket console.'),
    },
    {
      icon: UsersIcon,
      title: t('deepdive.teams.title', 'Built for teams'),
      desc: t('deepdive.teams.desc', "Don't share your password. Use Role-Based Access Control to invite friends or admins with specific permissions like Start/Stop, Edit Files, or View Console."),
    },
  ];

  const smallFeatures = [
    { icon: BoltIcon, title: t('features.billing.title', 'Fractional hourly billing'), desc: t('features.billing.desc', 'Top up credits and pay strictly for the hours your server is online.') },
    { icon: ClockIcon, title: t('features.schedules.title', 'Automated schedules'), desc: t('features.schedules.desc', 'Cron jobs to restart your server, broadcast commands, or trigger backups.') },
    { icon: WrenchScrewdriverIcon, title: t('features.mods.title', '1-click mod manager'), desc: t('features.mods.desc', 'Deep integration with CurseForge and SteamCMD for mods and plugins.') },
    { icon: CircleStackIcon, title: t('features.world.title', 'World management'), desc: t('features.world.desc', 'Upload existing saves to the cloud, or download your map anytime.') },
    { icon: ArchiveBoxIcon, title: t('features.backups.title', 'Secure backups'), desc: t('features.backups.desc', 'Manual restore points instantly, or automated backups on a schedule.') },
    { icon: CubeIcon, title: t('features.isolation.title', 'Hard isolation'), desc: t('features.isolation.desc', 'Every server runs in a dedicated container — never throttled by noisy neighbors.') },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-300 font-sans selection:bg-emerald-500/30 transition-colors duration-300 overflow-x-hidden">
      <SEO
        title={t('seo.title', 'Spawnly | Premium Game Server Hosting')}
        description={t('seo.description', 'High-performance game servers for Minecraft, Satisfactory, and more. Pay hourly, control everything.')}
        path="/"
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'Organization',
            name: 'Spawnly',
            url: SITE_URL,
            logo: `${SITE_URL}/logo.png`,
            description: 'High-performance game server hosting for Minecraft, Satisfactory, and more.',
          }),
        }}
      />

      <Navbar />

      <main className="flex-grow w-full">
        {/* === HERO === */}
        <section className="relative pt-32 pb-16 lg:pt-44 lg:pb-24 overflow-hidden">
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#cbd5e1_1px,transparent_1px),linear-gradient(to_bottom,#cbd5e1_1px,transparent_1px)] dark:bg-[linear-gradient(to_right,#1e293b_1px,transparent_1px),linear-gradient(to_bottom,#1e293b_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] opacity-30 dark:opacity-20"></div>

          <div className="w-full px-6 md:px-12 lg:px-24 relative z-10">
            <div className="grid lg:grid-cols-2 gap-12 items-center">
              <div className="text-center lg:text-left">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-400 font-mono text-[11px] uppercase tracking-widest mb-6">
                  <span className="w-1.5 h-1.5 bg-emerald-500 animate-pulse"></span>
                  [ {t('hero.badge', 'deploy_time: under 60s')} ]
                </div>

                <h1 className="text-5xl lg:text-7xl font-bold tracking-tight text-slate-900 dark:text-white leading-[1.05] mb-6">
                  {t('hero.title_p1', 'Command Your')}
                  <br />
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-500 to-lime-400">
                    {t('hero.title_p2', 'Multiplayer Universe.')}
                  </span>
                </h1>

                <p className="text-lg md:text-xl text-slate-600 dark:text-slate-400 mb-10 max-w-2xl mx-auto lg:mx-0">
                  {t('hero.subtitle', 'Containerized hosting for Minecraft, Satisfactory, and 30+ more. Zero-lag NVMe performance, fractional hourly billing, and absolute control via our custom-built management panel.')}
                </p>

                <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4 mb-14">
                  <Link href="/register" className="w-full sm:w-auto px-8 py-4 bg-emerald-400 hover:bg-emerald-300 text-slate-950 rounded-lg font-bold transition-all shadow-[0_0_25px_rgba(52,211,153,0.35)]">
                    {t('hero.cta_primary', 'Deploy a Server')}
                  </Link>
                  <Link href="/pricing" className="w-full sm:w-auto px-8 py-4 bg-transparent hover:bg-white dark:hover:bg-slate-800 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700 rounded-lg font-semibold transition-colors">
                    {t('hero.cta_secondary', 'View Pricing')}
                  </Link>
                </div>

                {/* Spec strip */}
                <div className="flex flex-wrap justify-center lg:justify-start gap-2 border-t border-slate-200 dark:border-slate-800 pt-8">
                  {specs.map((spec) => (
                    <div key={spec.label} className="font-mono text-xs px-3 py-2 rounded-md bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-500">
                      <span className="text-slate-900 dark:text-white font-bold">{spec.value}</span>{' '}
                      <span className="text-slate-500 dark:text-slate-500">{spec.label}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Console Mockup */}
              <div className="hidden lg:block relative perspective-1000">
                <div className="w-full max-w-xl ml-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/50 rounded-xl shadow-2xl overflow-hidden transform rotate-y-[-10deg] rotate-x-[5deg] hover:rotate-y-0 hover:rotate-x-0 transition-transform duration-700">
                  <div className="flex items-center px-4 py-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900">
                    <div className="flex space-x-2">
                      <div className="w-3 h-3 rounded-full bg-slate-300 dark:bg-slate-700"></div>
                      <div className="w-3 h-3 rounded-full bg-slate-300 dark:bg-slate-700"></div>
                      <div className="w-3 h-3 rounded-full bg-slate-300 dark:bg-slate-700"></div>
                    </div>
                    <div className="mx-auto text-xs font-mono uppercase tracking-widest text-slate-500">{t('mockup.status', 'node_status')}</div>
                  </div>
                  <div className="p-6 space-y-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-slate-900 dark:text-white font-semibold">{t('mockup.server_name', 'Satisfactory Dedicated')}</h3>
                        <p className="text-xs text-emerald-600 dark:text-emerald-400 font-mono flex items-center mt-1">
                          <span className="w-2 h-2 bg-emerald-500 mr-2 animate-pulse"></span> {t('mockup.online', 'ONLINE')} :7777
                        </p>
                      </div>
                    </div>
                    <div className="space-y-4">
                      <div>
                        <div className="flex justify-between text-xs font-mono mb-2">
                          <span className="text-slate-500 dark:text-slate-400">{t('mockup.cpu_load', 'cpu_load')}</span>
                          <span className="text-slate-900 dark:text-white">28%</span>
                        </div>
                        <div className="h-1.5 bg-slate-100 dark:bg-slate-800 overflow-hidden">
                          <div className="h-full bg-emerald-500 w-[28%]"></div>
                        </div>
                      </div>
                      <div>
                        <div className="flex justify-between text-xs font-mono mb-2">
                          <span className="text-slate-500 dark:text-slate-400">{t('mockup.memory', 'memory_ram')}</span>
                          <span className="text-slate-900 dark:text-white">6.4 / 16 GB</span>
                        </div>
                        <div className="h-1.5 bg-slate-100 dark:bg-slate-800 overflow-hidden">
                          <div className="h-full bg-lime-400 w-[40%]"></div>
                        </div>
                      </div>
                    </div>
                    <div className="pt-4 border-t border-slate-100 dark:border-slate-800 font-mono text-xs text-slate-500 dark:text-slate-400 space-y-1.5">
                      <p>[10:45:15] <span className="text-emerald-600 dark:text-emerald-400">INFO</span>: Done (3.124s)! For help, type "help"</p>
                      <div className="flex items-center pt-1">
                        <span className="mr-2">&gt;</span>
                        <span className="w-2 h-4 bg-slate-500 dark:bg-slate-400 animate-pulse"></span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* === GAME SHOWCASE (bento grid) === */}
        <section className="py-20 bg-slate-950 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-b from-[#0e1420] to-[#0a0f18] pointer-events-none"></div>

          <div className="w-full px-6 md:px-12 lg:px-24 relative z-10">
            <div className="mb-10 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-emerald-400 mb-3">// {t('carousel.eyebrow', 'library')}</p>
                <h2 className="text-3xl md:text-4xl font-bold text-white tracking-tight">
                  {t('carousel.title', 'Select your title')}
                </h2>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {showcaseGames.map((game) => (
                <Link
                  key={game.id}
                  href={`/games/${game.id}`}
                  className="group relative aspect-square overflow-hidden bg-slate-900 block transition-all duration-300 border border-slate-800 hover:border-emerald-500 shadow-lg hover:shadow-[0_0_30px_rgba(52,211,153,0.25)]"
                >
                  <img
                    src={game.image}
                    alt={game.name}
                    className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-900/30 to-transparent"></div>
                  <div className="absolute inset-x-0 bottom-0 p-4">
                    <h3 className="text-base md:text-lg font-bold text-white drop-shadow-lg leading-tight">
                      {game.name}
                    </h3>
                    <p className="text-[11px] font-mono uppercase tracking-wider text-emerald-400 drop-shadow-md opacity-0 group-hover:opacity-100 transition-opacity">
                      &gt; {t('carousel.launch', 'launch')}
                    </p>
                  </div>
                </Link>
              ))}

              <Link
                href="/games"
                className="group relative aspect-square overflow-hidden bg-slate-900 border border-slate-800 hover:border-emerald-500 flex flex-col items-center justify-center gap-3 text-center p-4 transition-all"
              >
                <div className="w-10 h-10 bg-emerald-500/10 text-emerald-400 flex items-center justify-center group-hover:bg-emerald-400 group-hover:text-slate-950 transition-colors">
                  <ArrowRightIcon className="w-5 h-5" />
                </div>
                <span className="text-sm font-bold text-white">{t('carousel.view_all', 'Explore all 30+ games')}</span>
              </Link>
            </div>
          </div>
        </section>

        {/* === HOW IT WORKS === */}
        <section className="py-24 border-b border-slate-200 dark:border-slate-800/50">
          <div className="w-full px-6 md:px-12 lg:px-24">
            <div className="max-w-2xl mx-auto text-center mb-16">
              <Eyebrow>// {t('steps.eyebrow', 'process')}</Eyebrow>
              <h2 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-white mb-4">
                {t('steps.title', 'From zero to online in three steps.')}
              </h2>
              <p className="text-slate-600 dark:text-slate-400 text-lg">
                {t('steps.subtitle', 'No tickets, no waiting on provisioning. Just configure and go.')}
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-8 relative">
              {steps.map((step) => (
                <div key={step.n} className="relative border-l-2 border-emerald-500/30 pl-6">
                  <div className="font-mono text-xs text-emerald-600 dark:text-emerald-400 mb-3">STEP // {step.n}</div>
                  <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-3">{step.title}</h3>
                  <p className="text-slate-600 dark:text-slate-400 leading-relaxed">{step.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* === FEATURES BENTO === */}
        <section className="py-24 bg-slate-50 dark:bg-slate-950/50">
          <div className="w-full px-6 md:px-12 lg:px-24">
            <div className="text-center max-w-3xl mx-auto mb-16">
              <Eyebrow>// {t('features.eyebrow', 'capabilities')}</Eyebrow>
              <h2 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-white mb-4">
                {t('features.title', 'Everything you need to host.')}
              </h2>
              <p className="text-slate-600 dark:text-slate-400 text-lg">
                {t('features.subtitle', 'A comprehensive suite of tools built specifically for community leaders and game server admins.')}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {bigFeatures.map((feature) => (
                <div
                  key={feature.title}
                  className="lg:col-span-3 md:col-span-2 grid md:grid-cols-2 gap-8 items-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-8 md:p-10"
                >
                  <div>
                    <div className="w-12 h-12 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-6">
                      <feature.icon className="w-6 h-6" />
                    </div>
                    <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-3">{feature.title}</h3>
                    <p className="text-slate-600 dark:text-slate-400 leading-relaxed">{feature.desc}</p>
                  </div>

                  {feature.icon === CommandLineIcon ? (
                    <div className="bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-4 font-mono text-xs text-slate-600 dark:text-slate-400 space-y-1.5">
                      <p>[10:45:12] <span className="text-emerald-600 dark:text-emerald-400">INFO</span>: Starting minecraft server version 1.20.4</p>
                      <p>[10:45:14] <span className="text-emerald-600 dark:text-emerald-400">INFO</span>: Loading properties</p>
                      <p>[10:45:15] <span className="text-lime-600 dark:text-lime-400">INFO</span>: Done (3.124s)! For help, type "help"</p>
                    </div>
                  ) : (
                    <div className="bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-4 space-y-3">
                      <div className="flex items-center justify-between p-2.5 bg-white dark:bg-slate-900">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 bg-emerald-500 text-slate-950 flex items-center justify-center text-[10px] font-bold">JD</div>
                          <span className="text-xs font-semibold text-slate-900 dark:text-white">{t('roles.co_admin', 'Co-Admin')}</span>
                        </div>
                        <span className="px-2 py-0.5 text-[10px] font-mono uppercase bg-emerald-100 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">{t('roles.full_access', 'full_access')}</span>
                      </div>
                      <div className="flex items-center justify-between p-2.5 bg-white dark:bg-slate-900">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 bg-slate-400 dark:bg-slate-600 text-white flex items-center justify-center text-[10px] font-bold">MK</div>
                          <span className="text-xs font-semibold text-slate-900 dark:text-white">{t('roles.moderator', 'Moderator')}</span>
                        </div>
                        <span className="px-2 py-0.5 text-[10px] font-mono uppercase bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400">{t('roles.console_only', 'console_only')}</span>
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {smallFeatures.map((feature) => (
                <div key={feature.title} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-8 hover:border-emerald-500/50 transition-colors">
                  <div className="w-12 h-12 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-6">
                    <feature.icon className="w-6 h-6" />
                  </div>
                  <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-3">{feature.title}</h3>
                  <p className="text-slate-600 dark:text-slate-400 leading-relaxed text-sm">{feature.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* === BOTTOM CTA === */}
        <section className="py-24 relative overflow-hidden bg-white dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800/50">
          <div className="absolute inset-0 bg-emerald-50 dark:bg-emerald-500/5"></div>

          <div className="w-full px-6 md:px-12 lg:px-24 relative z-10 text-center">
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-emerald-600 dark:text-emerald-400 mb-4">// {t('cta.eyebrow', 'get started')}</p>
            <h2 className="text-4xl md:text-5xl font-bold text-slate-900 dark:text-white mb-6">
              {t('cta.title', 'Ready to start your community?')}
            </h2>
            <p className="text-xl text-slate-600 dark:text-slate-300 mb-4 max-w-2xl mx-auto">
              {t('cta.subtitle', 'Create an account, add credits, and have your server online in less than 60 seconds.')}
            </p>
            <div className="flex flex-col items-center gap-4">
              <Link href="/register" className="inline-block px-10 py-4 bg-emerald-400 hover:bg-emerald-300 text-slate-950 font-bold text-lg rounded-lg transition-all shadow-[0_0_30px_rgba(52,211,153,0.35)] hover:-translate-y-1">
                {t('cta.button', 'Get Started Now')}
              </Link>
              <p className="text-sm text-slate-500 dark:text-slate-500">
                {t('cta.no_card', 'No credit card required to register.')}
              </p>
            </div>
          </div>
        </section>
      </main>

      <Footer />
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
