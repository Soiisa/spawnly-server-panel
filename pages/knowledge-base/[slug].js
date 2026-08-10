import { useState, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { supabase } from '../../lib/supabaseClient';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import { useTranslation } from 'next-i18next';
import DOMPurify from 'isomorphic-dompurify';
import Link from 'next/link';
import { ArrowLeftIcon, CalendarIcon, TagIcon } from '@heroicons/react/24/outline';

import Navbar from '../../components/Navbar';
import ServersHeader from '../../components/ServersHeader';
import ServersFooter from '../../components/ServersFooter';
import { getGamesList } from '../../lib/gamesList';
import { i18n } from '../../next-i18next.config';

const { locales } = i18n;

export default function KnowledgeBaseArticle({ article }) {
  const router = useRouter();
  const { t } = useTranslation('common');
  const gamesList = getGamesList(t);

  // Smart Navigation State
  const [navType, setNavType] = useState('loading');
  const [user, setUser] = useState(null);
  const [credits, setCredits] = useState(0);

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

  // Helper to get nice game names
  const getGameName = (gameId) => {
    if (gameId === 'general') return 'General / Panel';
    const found = gamesList.find(g => g.id === gameId);
    return found ? found.name : gameId;
  };

  // If the page is falling back / hasn't loaded yet
  if (router.isFallback || !article) {
    return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-white">Loading...</div>;
  }

  // --- SEO & Formatting Variables ---

  // Generate plain text for the meta description
  const metaDescription = article.content 
    ? article.content.replace(/<[^>]*>?/gm, '').substring(0, 160) + '...'
    : 'Read this comprehensive guide on the Spawnly Hub.';

  // Format date safely
  const formattedDate = new Date(article.updated_at).toLocaleDateString(undefined, { 
    year: 'numeric', month: 'long', day: 'numeric' 
  });

  // Configure DOMPurify to allow YouTube iframes and Tiptap styles (text alignment, resizing, callouts, tables)
  const cleanContent = DOMPurify.sanitize(article.content, {
    ADD_TAGS: ['iframe'],
    ADD_ATTR: ['allow', 'allowfullscreen', 'frameborder', 'scrolling', 'style', 'data-align', 'data-callout', 'class', 'colspan', 'rowspan', 'colwidth']
  });

  const currentLocale = router.locale || 'en';
  const urlPrefix = currentLocale === 'en' ? '' : `/${currentLocale}`;
  const canonicalUrl = `https://spawnly.net${urlPrefix}/knowledge-base/${article.slug}`;

  return (
    <div className="flex flex-col min-h-screen bg-slate-950 selection:bg-indigo-500/30">

      {/* Dynamic SEO Meta Tags */}
      <Head>
        <title>{article.title} | Spawnly Knowledge Base</title>
        <meta name="description" content={metaDescription} />
        <meta name="keywords" content={article.tags?.join(', ') || 'spawnly, game server, guide, tutorial'} />
        <link rel="canonical" href={canonicalUrl} />

        {/* Hreflang alternates — same slug across every locale, differentiated by
            the `language` column, matches the alternateRefs logic in server-sitemap.xml.js */}
        {locales.map((loc) => (
          <link
            key={loc}
            rel="alternate"
            hrefLang={loc}
            href={`https://spawnly.net${loc === 'en' ? '' : `/${loc}`}/knowledge-base/${article.slug}`}
          />
        ))}
        <link rel="alternate" hrefLang="x-default" href={`https://spawnly.net/knowledge-base/${article.slug}`} />

        {/* Open Graph (For Discord/Twitter/Facebook sharing) */}
        <meta property="og:title" content={`${article.title} | Spawnly`} />
        <meta property="og:description" content={metaDescription} />
        <meta property="og:type" content="article" />
        <meta property="og:url" content={canonicalUrl} />
      </Head>

      {/* Navigation */}
      {navType === 'loading' ? (
        <div className="h-16 md:h-20 w-full bg-slate-950 animate-pulse border-b border-slate-800"></div>
      ) : navType === 'dashboard' && user ? (
        <ServersHeader user={user} credits={credits} isLoading={false} onLogout={handleLogout} />
      ) : (
        <Navbar />
      )}

      <main className="flex-grow w-full max-w-4xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
        
        {/* Back Button */}
        <div className="mb-8">
          <Link href="/knowledge-base" className="inline-flex items-center text-sm font-medium text-slate-400 hover:text-indigo-400 transition-colors">
            <ArrowLeftIcon className="w-4 h-4 mr-2" />
            Back to Hub
          </Link>
        </div>

        {/* Article Header */}
        <header className="mb-12 pb-8 border-b border-slate-800/60">
          <div className="flex items-center gap-3 mb-6">
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 uppercase tracking-wider">
              {getGameName(article.game)}
            </span>
          </div>
          
          <h1 className="text-4xl md:text-5xl font-extrabold text-white tracking-tight mb-6">
            {article.title}
          </h1>
          
          <div className="flex flex-wrap items-center gap-6 text-sm text-slate-400">
            <div className="flex items-center gap-2">
              <CalendarIcon className="w-5 h-5 text-slate-500" />
              <span>Last updated on {formattedDate}</span>
            </div>
            
            {article.tags && article.tags.length > 0 && (
              <div className="flex items-center gap-2">
                <TagIcon className="w-5 h-5 text-slate-500" />
                <div className="flex gap-2">
                  {article.tags.map(tag => (
                    <span key={tag} className="bg-slate-900 border border-slate-800 px-2 py-0.5 rounded text-slate-300">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </header>

        {/* Article Content */}
        {/* We use prose prose-invert (Tailwind Typography) to automatically style the Tiptap HTML */}
        <article
          className="tiptap-content prose prose-invert prose-indigo max-w-none
            prose-img:rounded-xl prose-img:shadow-lg
            prose-a:text-indigo-400 hover:prose-a:text-indigo-300
            prose-headings:text-slate-100 prose-headings:font-bold
            prose-h2:mt-12 prose-h2:mb-4 prose-h2:pb-3 prose-h2:border-b prose-h2:border-slate-800/60 prose-h2:text-2xl
            prose-h3:mt-8 prose-h3:mb-3 prose-h3:text-xl
            prose-p:text-slate-300 prose-p:leading-relaxed
            prose-strong:text-white
            prose-li:text-slate-300 prose-li:marker:text-indigo-400
            prose-blockquote:not-italic prose-blockquote:border-l-4 prose-blockquote:border-indigo-500 prose-blockquote:bg-slate-900/50 prose-blockquote:text-slate-300 prose-blockquote:rounded-r-lg prose-blockquote:py-1
            prose-code:text-indigo-300 prose-code:bg-slate-900 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:before:content-none prose-code:after:content-none
            prose-pre:bg-slate-950 prose-pre:border prose-pre:border-slate-800 prose-pre:rounded-xl prose-pre:shadow-inner
            prose-hr:border-slate-800"
          dangerouslySetInnerHTML={{ __html: cleanContent }}
        />

        {/* Bottom Help block */}
        <div className="mt-16 pt-8 border-t border-slate-800/60 flex flex-col md:flex-row items-center justify-between gap-4 bg-slate-900/50 p-6 rounded-2xl">
          <div>
            <h4 className="text-lg font-bold text-white mb-1">Still need help?</h4>
            <p className="text-sm text-slate-400">Our support team is available in our Discord community.</p>
          </div>
          <a href="https://discord.gg/your-discord-link" target="_blank" rel="noopener noreferrer" className="px-6 py-3 bg-[#5865F2] hover:bg-[#4752C4] text-white font-medium rounded-lg transition-colors shadow-lg shadow-[#5865F2]/20 whitespace-nowrap">
            Join Discord Support
          </a>
        </div>

      </main>

      <ServersFooter />
    </div>
  );
}

export async function getServerSideProps({ params, locale }) {
  const currentLocale = locale ?? 'en';
  const { slug } = params;

  // Fetch the article that matches the slug, the current locale, AND is published.
  // Every language shares the same slug (differentiated only by the `language`
  // column) — see next-sitemap's server-sitemap.xml.js, which already assumed
  // this and generates hreflang alternates on that basis.
  const { data: article, error } = await supabase
    .from('kb_articles')
    .select('*')
    .eq('slug', slug)
    .eq('language', currentLocale)
    .eq('is_published', true)
    .single();

  // If no article is found (or it's a draft), return a 404 page
  if (error || !article) {
    return {
      notFound: true,
    };
  }

  return {
    props: {
      article,
      ...(await serverSideTranslations(currentLocale, ['common'])),
    },
  };
}