import { getServerSideSitemapLegacy } from 'next-sitemap/server';
import { supabase } from '../lib/supabaseClient';

export async function getServerSideProps(ctx) {
  // 1. Fetch all published articles from your Knowledge Base
  const { data: articles } = await supabase
    .from('kb_articles')
    .select('slug, updated_at')
    .eq('is_published', true);

  // 2. Format them for the sitemap
  const fields = (articles || []).map((article) => ({
    loc: `https://spawnly.net/knowledge-base/${article.slug}`,
    lastmod: new Date(article.updated_at).toISOString(),
    changefreq: 'weekly',
    priority: 0.8,
  }));

  // 3. Return the dynamic XML
  return getServerSideSitemapLegacy(ctx, fields);
}

// Default export to prevent Next.js errors
export default function Sitemap() {}