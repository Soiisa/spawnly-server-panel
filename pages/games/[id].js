import React, { useMemo } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import Navbar from '../../components/Navbar';
import Footer from '../../components/Footer';
import { getGamesList } from '../../lib/gamesList';

export default function GameDetailPage() {
  const router = useRouter();
  const { id } = router.query;
  const { t } = useTranslation('landing');
  
  const games = useMemo(() => getGamesList(t), [t]);
  const game = games.find((g) => g.id === id);

  if (!game) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white">
        <h1 className="text-3xl font-bold">{t('game_detail.not_found', 'Game Not Found')}</h1>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-300 font-sans">
      <Head>
        <title>{t('game_detail.meta_title', { game: game.name, defaultValue: `${game.name} Server Hosting | Spawnly` })}</title>
        <meta name="description" content={t('game_detail.meta_description', { game: game.name, description: game.description, defaultValue: `Premium ${game.name} dedicated server hosting. ${game.description}` })} />
      </Head>

      <Navbar />

      <main className="flex-grow w-full">
        {/* Dynamic Hero Section */}
        <section className="relative pt-32 pb-24 lg:pt-48 lg:pb-32 overflow-hidden border-b border-slate-200 dark:border-slate-800">
          <img
            src={game.image}
            alt={game.name}
            className="absolute inset-0 w-full h-full object-cover pointer-events-none"
          />
          <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-sm"></div>

          <div className="w-full px-6 md:px-12 lg:px-24 relative z-10">
            <div className="max-w-3xl">
              <span className={`inline-block px-3 py-1 text-xs font-bold uppercase tracking-wider rounded-full bg-slate-800/80 border border-slate-700 mb-4 ${game.accent}`}>
                {game.edition}
              </span>
              <h1 className="text-5xl lg:text-7xl font-bold text-white mb-6 tracking-tight">
                {game.name} <span className="text-slate-400 font-light">{t('game_detail.hero_hosting', 'Hosting')}</span>
              </h1>
              <p className="text-xl text-slate-300 mb-10 leading-relaxed">
                {game.longDescription}
              </p>
              
              <div className="flex flex-col sm:flex-row gap-4">
                <Link 
                  href={`/register?game=${game.id}`}
                  className={`px-8 py-4 text-white rounded-lg font-bold transition-all shadow-lg text-center ${game.btnBg} ${game.btnHover} hover:-translate-y-1`}
                >
                  {t('game_detail.deploy', { defaultValue: 'Deploy {{game}} Server', game: game.name })}
                </Link>
                <Link 
                  href={`/pricing?game=${game.id}`}
                  className="px-8 py-4 bg-slate-800/80 hover:bg-slate-700 text-white border border-slate-600 rounded-lg font-bold transition-colors text-center backdrop-blur-md"
                >
                  {t('game_detail.pricing', 'View Pricing')}
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* Specs & Features Section */}
        <section className="py-24">
          <div className="w-full px-6 md:px-12 lg:px-24">
            <div className="grid md:grid-cols-3 gap-8">
              
              <div className="col-span-2 bg-white dark:bg-slate-900 p-8 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
                <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-6">
                  {t('game_detail.features_title', 'Why host with us?')}
                </h2>
                <div className="space-y-6">
                  <div className="flex gap-4">
                    <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                    </div>
                    <div>
                      <h4 className="text-lg font-bold text-slate-900 dark:text-white">{t('game_detail.features.ddos_title', 'DDoS Protection')}</h4>
                      <p className="text-slate-600 dark:text-slate-400 text-sm mt-1">{t('game_detail.features.ddos_desc', 'Enterprise-grade Cloudflare and Hetzner DDoS mitigation comes standard.')}</p>
                    </div>
                  </div>
                  <div className="flex gap-4">
                    <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" /></svg>
                    </div>
                    <div>
                      <h4 className="text-lg font-bold text-slate-900 dark:text-white">{t('game_detail.features.nvme_title', 'NVMe Storage')}</h4>
                      <p className="text-slate-600 dark:text-slate-400 text-sm mt-1">{t('game_detail.features.nvme_desc', 'Say goodbye to save-pauses. Our Gen4 NVMe drives ensure instant saving and chunk loading.')}</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-slate-100 dark:bg-slate-800/50 p-8 rounded-2xl border border-slate-200 dark:border-slate-800">
                <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-6">{t('game_detail.specs_title', 'Technical Specs')}</h3>
                <ul className="space-y-4">
                  <li className="flex justify-between items-center border-b border-slate-200 dark:border-slate-700 pb-4">
                    <span className="text-slate-500 dark:text-slate-400 text-sm">{t('game_detail.specs_engine', 'Game Engine')}</span>
                    <span className="font-semibold text-slate-900 dark:text-white text-sm text-right">{game.engine}</span>
                  </li>
                  <li className="flex justify-between items-center border-b border-slate-200 dark:border-slate-700 pb-4">
                    <span className="text-slate-500 dark:text-slate-400 text-sm">{t('game_detail.specs_mod_support', 'Mod Support')}</span>
                    <span className="font-semibold text-green-600 dark:text-green-400 text-sm text-right">{t('game_detail.specs_mod_supported', 'Fully Supported')}</span>
                  </li>
                  <li className="flex justify-between items-center border-b border-slate-200 dark:border-slate-700 pb-4">
                    <span className="text-slate-500 dark:text-slate-400 text-sm">{t('game_detail.specs_billing', 'Billing')}</span>
                    <span className="font-semibold text-blue-600 dark:text-blue-400 text-sm text-right">{t('game_detail.specs_billing_value', 'Hourly & Monthly')}</span>
                  </li>
                  <li className="flex justify-between items-center pt-2">
                    <span className="text-slate-500 dark:text-slate-400 text-sm">{t('game_detail.specs_deployment', 'Deployment Time')}</span>
                    <span className="font-semibold text-slate-900 dark:text-white text-sm text-right">{t('game_detail.specs_deployment_value', '< 60 Seconds')}</span>
                  </li>
                </ul>
              </div>

            </div>
          </div>
        </section>

      </main>

      <Footer />
    </div>
  );
}

// Generates the static HTML routes for every game in our list
export async function getStaticPaths({ locales }) {
  // We need a dummy translation function just to get the IDs out of the list
  const t = (key, fallback) => fallback;
  const games = getGamesList(t);
  
  const paths = [];
  
  // Generate a path for every game, across every supported language
  for (const locale of locales) {
    for (const game of games) {
      paths.push({ params: { id: game.id }, locale });
    }
  }

  return {
    paths,
    fallback: false, // Return 404 if a game ID isn't in the list
  };
}

export async function getStaticProps({ locale, params }) {
  return {
    props: {
      ...(await serverSideTranslations(locale, ['landing', 'common'])),
    },
  };
}