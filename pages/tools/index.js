// pages/tools/index.js
import Head from 'next/head';
import Link from 'next/link';
import { useTranslation } from 'next-i18next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import Navbar from '../../components/Navbar';
import ServersFooter from '../../components/ServersFooter';
import { 
  WrenchScrewdriverIcon, 
  SignalIcon, 
  CommandLineIcon, 
  CalculatorIcon,
  CpuChipIcon,
  ArrowRightIcon,
  FireIcon
} from '@heroicons/react/24/outline';

const getTools = (t) => [
  {
    id: 'status-checker',
    title: t('hub.tools.status_checker.title', 'Network & Port Checker'),
    description: t('hub.tools.status_checker.desc', 'Ping any game server, check if your ports are forwarded correctly, and view live player counts.'),
    href: '/tools/server-status',
    icon: <SignalIcon className="w-8 h-8 text-emerald-400" />,
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/20',
    badge: t('hub.tools.status_checker.badge', 'Most Popular'),
    isPopular: true
  },
  {
    id: 'config-generator',
    title: t('hub.tools.config_generator.title', 'Server Config Generator'),
    description: t('hub.tools.config_generator.desc', 'Visual UI editor to generate perfect server.properties, PalWorldSettings.ini, and server.cfg files.'),
    href: '/tools/config-generator',
    icon: <CommandLineIcon className="w-8 h-8 text-indigo-400" />,
    bg: 'bg-indigo-500/10',
    border: 'border-indigo-500/20',
    badge: t('hub.tools.config_generator.badge', 'New'),
    isPopular: false
  },
  {
    id: 'player-calculators',
    title: t('hub.tools.player_calculators.title', 'Player Calculators Hub'),
    description: t('hub.tools.player_calculators.desc', 'Rust raid costs, Minecraft Nether portal sync coordinates, and Factorio production ratios.'),
    href: '/tools/player-calculators',
    icon: <CalculatorIcon className="w-8 h-8 text-rose-400" />,
    bg: 'bg-rose-500/10',
    border: 'border-rose-500/20',
    badge: null,
    isPopular: false
  },
  {
    id: 'ram-calculator',
    title: t('hub.tools.ram_calculator.title', 'Server RAM Calculator'),
    description: t('hub.tools.ram_calculator.desc', 'Find out exactly how much RAM you need based on your game, player count, and modpack size.'),
    href: '/tools/ram-calculator',
    icon: <CpuChipIcon className="w-8 h-8 text-sky-400" />,
    bg: 'bg-sky-500/10',
    border: 'border-sky-500/20',
    badge: null,
    isPopular: false
  }
];

export default function ToolsHub() {
  const { t } = useTranslation('tools');
  const toolsList = getTools(t);

  // SEO Schema Markup for a list of tools
  const schemaMarkup = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "itemListElement": toolsList.map((tool, index) => ({
      "@type": "ListItem",
      "position": index + 1,
      "url": `https://spawnly.net${tool.href}`,
      "name": tool.title,
      "description": tool.description
    }))
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col selection:bg-indigo-500/30">
      <Head>
        <title>{t('hub.seo.title', 'Free Game Server Tools & Calculators | Spawnly')}</title>
        <meta name="description" content={t('hub.seo.description', 'Free utilities for server admins and gamers. Network port checkers, server config generators, Rust raid calculators, and server RAM calculators.')} />
        <link rel="canonical" href="https://spawnly.net/tools" />
        
        {/* Open Graph / Social Meta Tags */}
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://spawnly.net/tools" />
        <meta property="og:title" content={t('hub.seo.og_title', 'Free Game Server Tools & Calculators | Spawnly')} />
        <meta property="og:description" content={t('hub.seo.og_desc', 'Free utilities for server admins and gamers. Network port checkers, server config generators, Rust raid calculators, and more.')} />
        <meta property="og:image" content="https://spawnly.net/images/og-tools.jpg" />
        
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={t('hub.seo.og_title', 'Free Game Server Tools & Calculators | Spawnly')} />
        <meta name="twitter:description" content={t('hub.seo.og_desc', 'Free utilities for server admins and gamers. Network port checkers, server config generators, and more.')} />
        
        {/* JSON-LD Schema */}
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schemaMarkup) }} />
      </Head>

      <Navbar />

      <main className="flex-grow w-full max-w-7xl mx-auto py-16 px-4 sm:px-6">
        
        {/* Hero Section */}
        <div className="text-center mb-16 animate-in fade-in slide-in-from-bottom-4 duration-700">
          <div className="inline-flex items-center justify-center p-3 bg-indigo-500/10 rounded-2xl mb-6 border border-indigo-500/20">
            <WrenchScrewdriverIcon className="w-8 h-8 text-indigo-400" />
          </div>
          <h1 className="text-5xl md:text-6xl font-extrabold text-white mb-6 tracking-tight">
            {t('hub.hero.title', 'Free Tools for')} <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-sky-400">{t('hub.hero.title_highlight', 'Gamers & Admins')}</span>
          </h1>
          <p className="text-xl text-slate-400 max-w-2xl mx-auto leading-relaxed">
            {t('hub.hero.subtitle', 'Stop guessing and start playing. We built these free utilities to help you configure, test, and run your game servers flawlessly.')}
          </p>
        </div>

        {/* Tools Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6 max-w-5xl mx-auto">
          {toolsList.map((tool) => (
            <Link href={tool.href} key={tool.id} className="group outline-none">
              <div className="h-full bg-slate-900 border border-slate-800 rounded-3xl p-8 transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl hover:shadow-indigo-500/10 hover:border-indigo-500/50 relative overflow-hidden flex flex-col">
                
                <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>

                <div className="relative z-10 flex-grow">
                  <div className="flex items-start justify-between mb-6">
                    <div className={`p-4 rounded-2xl border ${tool.bg} ${tool.border} shadow-inner`}>
                      {tool.icon}
                    </div>
                    {tool.badge && (
                      <span className="px-3 py-1 bg-indigo-500/20 text-indigo-300 text-xs font-bold rounded-full border border-indigo-500/30 flex items-center gap-1">
                        {tool.isPopular && <FireIcon className="w-3 h-3" />}
                        {tool.badge}
                      </span>
                    )}
                  </div>
                  
                  <h3 className="text-2xl font-bold text-white mb-3 group-hover:text-indigo-300 transition-colors">
                    {tool.title}
                  </h3>
                  <p className="text-slate-400 leading-relaxed mb-6">
                    {tool.description}
                  </p>
                </div>

                <div className="relative z-10 flex items-center text-sm font-bold text-indigo-400 group-hover:text-indigo-300 transition-colors mt-auto">
                  {t('hub.card.launch_tool', 'Launch Tool')} <ArrowRightIcon className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            </Link>
          ))}
        </div>

        {/* Global Upsell Banner */}
        <div className="mt-20 max-w-5xl mx-auto mb-10">
          <div className="bg-gradient-to-r from-indigo-600 to-sky-600 rounded-3xl p-1 sm:p-1.5 shadow-2xl shadow-indigo-500/20">
            <div className="bg-slate-950 rounded-[1.25rem] p-8 md:p-12 flex flex-col md:flex-row items-center justify-between gap-8 text-center md:text-left">
              <div>
                <h2 className="text-3xl font-bold text-white mb-3">{t('hub.upsell.title', 'Tired of managing servers manually?')}</h2>
                <p className="text-slate-400 text-lg">{t('hub.upsell.desc', 'Spawnly includes automated setups, instant modpack installations, and a beautiful control panel so you never have to touch a config file again.')}</p>
              </div>
              <div className="flex-shrink-0 w-full md:w-auto">
                <Link href="/pricing" className="inline-flex w-full md:w-auto items-center justify-center px-8 py-4 bg-white text-indigo-600 hover:bg-slate-50 font-bold text-lg rounded-xl transition-all shadow-xl hover:shadow-indigo-500/25 hover:-translate-y-0.5">
                  {t('hub.upsell.cta', 'View Hosting Plans')}
                </Link>
              </div>
            </div>
          </div>
        </div>

      </main>

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