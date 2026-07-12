// pages/games/index.js
import React, { useMemo } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useTranslation } from 'next-i18next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import Navbar from '../../components/Navbar';
import Footer from '../../components/Footer';
import { getGamesList } from '../../lib/gamesList';

export default function GamesList() {
  const { t } = useTranslation('landing');
  const games = useMemo(() => getGamesList(t), [t]);

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-300 font-sans">
      <Head>
        <title>{t('games.seo.title', 'Supported Games | Spawnly')}</title>
        <meta name="description" content={t('games.seo.description', 'Browse our full catalog of supported dedicated servers including Minecraft, Rust, Palworld, and more.')} />
      </Head>

      <Navbar />

      <main className="flex-grow w-full pt-32 pb-20">
        <div className="w-full px-6 md:px-12 lg:px-24">
          
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h1 className="text-4xl md:text-5xl font-bold text-slate-900 dark:text-white mb-6">
              {t('games.hero.title', 'Choose your Game')}
            </h1>
            <p className="text-lg text-slate-600 dark:text-slate-400">
              {t('games.hero.subtitle', 'From hardcore survival to lightweight indie co-op, we provide the performance you need to host your community.')}
            </p>
          </div>

          {/* Games Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
            {games.map((game) => (
              <Link 
                key={game.id} 
                href={`/games/${game.id}`}
                className="group relative flex flex-col aspect-[4/3] rounded-2xl overflow-hidden bg-slate-900 transition-all duration-300 transform hover:-translate-y-1 hover:shadow-xl hover:shadow-blue-500/20 border border-transparent hover:border-blue-500/50"
              >
                <img
                  src={game.image}
                  alt={game.name}
                  className="absolute inset-0 w-full h-full object-cover pointer-events-none transition-transform duration-700 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/60 to-transparent opacity-90 transition-opacity duration-300 group-hover:opacity-80"></div>
                
                <div className="relative z-10 flex flex-col justify-end h-full p-6">
                  <h3 className="text-2xl font-bold text-white mb-1 drop-shadow-md group-hover:text-blue-400 transition-colors">
                    {game.name}
                  </h3>
                  <p className={`text-xs font-semibold ${game.accent} uppercase tracking-wider mb-2`}>
                    {game.edition}
                  </p>
                  <p className="text-sm text-slate-300 line-clamp-2">
                    {game.description}
                  </p>
                </div>
              </Link>
            ))}
          </div>

        </div>
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