import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../../lib/supabaseClient';
import Link from 'next/link';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import { useTranslation } from 'next-i18next';
import { MagnifyingGlassIcon, BookOpenIcon, CommandLineIcon } from '@heroicons/react/24/outline';

import Navbar from '../../components/Navbar';
import ServersHeader from '../../components/ServersHeader';
import ServersFooter from '../../components/ServersFooter';
import SEO from '../../components/SEO';

import { getGamesList } from '../../lib/gamesList';

export default function KnowledgeBaseHub({ articles }) {
  const router = useRouter();
  const { t } = useTranslation('common');
  const gamesList = getGamesList(t);

  // Smart Navigation State
  const [navType, setNavType] = useState('loading');
  const [user, setUser] = useState(null);
  const [credits, setCredits] = useState(0);

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');

  // Determine Smart Nav
  useEffect(() => {
    let isMounted = true;
    const determineNav = async () => {
      let intendedNav = 'public';
      const querySource = new URLSearchParams(window.location.search).get('source');
      
      if (querySource) {
        intendedNav = querySource === 'dashboard' ? 'dashboard' : 'public';
        sessionStorage.setItem('kb_nav', intendedNav);
      } else {
        const savedNav = sessionStorage.getItem('kb_nav');
        if (savedNav) intendedNav = savedNav;
      }

      if (intendedNav === 'dashboard') {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          if (isMounted) setUser(session.user);
          const { data: profile } = await supabase.from('profiles').select('credits').eq('id', session.user.id).single();
          if (profile && isMounted) setCredits(profile.credits);
          if (isMounted) setNavType('dashboard');
        } else {
          if (isMounted) setNavType('public');
        }
      } else {
        if (isMounted) setNavType('public');
      }
    };
    determineNav();
    return () => { isMounted = false; };
  }, [router.asPath]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = '/login';
  };

  // --- FILTERING LOGIC ---
  
  // 1. Get unique categories that actually have articles
  const availableCategories = useMemo(() => {
    const categories = new Set(articles.map(article => article.game));
    return Array.from(categories);
  }, [articles]);

  // 2. Filter articles based on search text AND selected category
  const filteredArticles = useMemo(() => {
    return articles.filter(article => {
      const matchesCategory = selectedCategory === 'all' || article.game === selectedCategory;
      const searchLower = searchQuery.toLowerCase();
      const matchesSearch = 
        article.title.toLowerCase().includes(searchLower) || 
        (article.tags && article.tags.some(tag => tag.toLowerCase().includes(searchLower)));
      
      return matchesCategory && matchesSearch;
    });
  }, [articles, searchQuery, selectedCategory]);

  // Helper to get nice game names
  const getGameName = (gameId) => {
    if (gameId === 'general') return 'General / Panel';
    const found = gamesList.find(g => g.id === gameId);
    return found ? found.name : gameId;
  };

  return (
    <div className="flex flex-col min-h-screen bg-slate-950 selection:bg-indigo-500/30"> 
      <SEO
        title={t('kb_hub.seo.title', { defaultValue: 'Knowledge Base | Spawnly Help Center' })}
        description={t('kb_hub.seo.description', { defaultValue: 'Guides and tutorials for setting up, configuring, and troubleshooting your Spawnly game server — mods, backups, world management, and more.' })}
        path="/knowledge-base"
      />

      {/* Dynamic Header */}
      {navType === 'loading' ? (
        <div className="h-16 md:h-20 w-full bg-slate-950 animate-pulse border-b border-slate-800"></div>
      ) : navType === 'dashboard' && user ? (
        <ServersHeader user={user} credits={credits} isLoading={false} onLogout={handleLogout} />
      ) : (
        <Navbar />
      )}

      {/* HERO SECTION */}
      <section className="relative pt-20 pb-16 overflow-hidden border-b border-slate-800/60">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-3xl h-64 bg-indigo-600/10 blur-[100px] pointer-events-none"></div>
        <div className="absolute top-20 left-1/4 w-96 h-96 bg-blue-500/5 blur-[120px] pointer-events-none rounded-full"></div>
        
        <div className="relative z-10 w-full max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="inline-flex items-center justify-center p-3 bg-indigo-500/10 rounded-2xl mb-6 border border-indigo-500/20 text-indigo-400 shadow-inner">
            <BookOpenIcon className="w-8 h-8" />
          </div>
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold tracking-tight text-white mb-6">
            Welcome to the <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-blue-400">Spawnly Hub</span>
          </h1>
          <p className="mt-4 text-lg md:text-xl text-slate-400 max-w-3xl mx-auto leading-relaxed">
            Everything you need to master your game servers. Browse comprehensive configuration guides, explore modding tutorials, and find quick fixes for common issues.
          </p>

          {/* Search Bar */}
          <div className="mt-10 max-w-2xl mx-auto relative group">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              <MagnifyingGlassIcon className="h-6 w-6 text-slate-500 group-focus-within:text-indigo-400 transition-colors" />
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="block w-full pl-12 pr-4 py-4 bg-slate-900/50 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all shadow-xl backdrop-blur-sm text-lg"
              placeholder="Search for guides, errors, or plugins..."
            />
          </div>
        </div>
      </section>

      {/* MAIN CONTENT AREA */}
      <main className="flex-grow w-full max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
        
        {/* Category Filters */}
        {availableCategories.length > 0 && (
          <div className="mb-12">
            <div className="flex items-center gap-2 overflow-x-auto pb-4 scrollbar-hide snap-x">
              <button
                onClick={() => setSelectedCategory('all')}
                className={`snap-start whitespace-nowrap px-5 py-2.5 rounded-full text-sm font-medium transition-all shadow-sm ${
                  selectedCategory === 'all'
                    ? 'bg-indigo-600 text-white shadow-indigo-500/25 border border-indigo-500'
                    : 'bg-slate-900 text-slate-400 border border-slate-800 hover:bg-slate-800 hover:text-white'
                }`}
              >
                All Articles
              </button>
              
              {availableCategories.includes('general') && (
                <button
                  onClick={() => setSelectedCategory('general')}
                  className={`snap-start whitespace-nowrap px-5 py-2.5 rounded-full text-sm font-medium transition-all shadow-sm ${
                    selectedCategory === 'general'
                      ? 'bg-indigo-600 text-white shadow-indigo-500/25 border border-indigo-500'
                      : 'bg-slate-900 text-slate-400 border border-slate-800 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <CommandLineIcon className="w-4 h-4" />
                    General / Panel
                  </div>
                </button>
              )}

              {availableCategories.filter(c => c !== 'general').map((category) => (
                <button
                  key={category}
                  onClick={() => setSelectedCategory(category)}
                  className={`snap-start whitespace-nowrap px-5 py-2.5 rounded-full text-sm font-medium transition-all shadow-sm ${
                    selectedCategory === category
                      ? 'bg-indigo-600 text-white shadow-indigo-500/25 border border-indigo-500'
                      : 'bg-slate-900 text-slate-400 border border-slate-800 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  {getGameName(category)}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Articles Grid */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {filteredArticles.length === 0 ? (
            <div className="col-span-full py-20 text-center bg-slate-900/30 rounded-2xl border border-slate-800 border-dashed">
              <BookOpenIcon className="w-12 h-12 text-slate-600 mx-auto mb-4" />
              <h3 className="text-xl font-bold text-white mb-2">No articles found</h3>
              <p className="text-slate-400 max-w-md mx-auto">
                {searchQuery 
                  ? `We couldn't find any guides matching "${searchQuery}". Try using different keywords or checking another category.` 
                  : "We are currently writing new guides for this section. Check back soon!"}
              </p>
              {searchQuery && (
                <button 
                  onClick={() => { setSearchQuery(''); setSelectedCategory('all'); }}
                  className="mt-6 text-indigo-400 hover:text-indigo-300 font-medium"
                >
                  Clear all filters
                </button>
              )}
            </div>
          ) : (
            filteredArticles.map((article) => (
              <Link key={article.id} href={`/knowledge-base/${article.slug}`}>
                <div className="group relative flex flex-col justify-between bg-slate-900/80 border border-slate-800 rounded-2xl p-6 hover:bg-slate-800 hover:border-indigo-500/50 hover:shadow-[0_8px_30px_rgb(0,0,0,0.12)] hover:shadow-indigo-500/10 transition-all cursor-pointer h-full backdrop-blur-sm">
                  
                  <div>
                    <div className="flex items-start justify-between mb-4">
                      <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 uppercase tracking-wider">
                        {getGameName(article.game)}
                      </span>
                    </div>
                    <h3 className="text-xl font-bold text-white mb-3 group-hover:text-indigo-300 transition-colors line-clamp-2">
                      {article.title}
                    </h3>
                  </div>
                  
                  <div className="mt-auto pt-6">
                    {/* Tags */}
                    {article.tags && article.tags.length > 0 && (
                      <div className="flex flex-wrap gap-2 mb-4">
                        {article.tags.slice(0, 3).map(tag => (
                          <span key={tag} className="text-xs font-medium text-slate-400 bg-slate-950 px-2.5 py-1 rounded-md border border-slate-800">
                            #{tag}
                          </span>
                        ))}
                        {article.tags.length > 3 && (
                          <span className="text-xs font-medium text-slate-500 bg-slate-950 px-2.5 py-1 rounded-md border border-slate-800">
                            +{article.tags.length - 3}
                          </span>
                        )}
                      </div>
                    )}
                    
                    <div className="flex items-center justify-between text-xs font-medium text-slate-500 border-t border-slate-800 pt-4 mt-2">
                      <span>{new Date(article.updated_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}</span>
                      <span className="group-hover:text-indigo-400 transition-colors flex items-center gap-1">
                        Read Guide <span className="group-hover:translate-x-1 transition-transform">&rarr;</span>
                      </span>
                    </div>
                  </div>

                </div>
              </Link>
            ))
          )}
        </div>
      </main>

      <ServersFooter />
      
    </div>
  );
}

export async function getServerSideProps({ locale }) {
  const currentLocale = locale ?? 'en'; // Defaults to English if none is specified

  const { data: articles, error } = await supabase
    .from('kb_articles')
    .select('id, title, slug, game, tags, updated_at')
    .eq('is_published', true) 
    .eq('language', currentLocale) // <-- STRICTLY FILTERS BY LANGUAGE
    .order('updated_at', { ascending: false });

  return {
    props: {
      articles: articles || [],
      ...(await serverSideTranslations(currentLocale, ['common'])),
    },
  };
}