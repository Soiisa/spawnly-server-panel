import { getServerSideSitemapLegacy } from 'next-sitemap';
import { supabase } from '../lib/supabaseClient';

export async function getServerSideProps(ctx) {
  // 1. Fetch all published articles
  const { data: articles } = await supabase
    .from('kb_articles')
    .select('slug, updated_at')
    .eq('is_published', true);

  // 2. Define your locales (Match these to your next.config.js)
  const locales = ['en', 'es', 'pt', 'de']; // Update with your actual languages
  const defaultLocale = 'en';

  const fields = [];

  (articles || []).forEach((article) => {
    const lastmod = new Date(article.updated_at).toISOString();

    // Create the hreflang alternate references for SEO
    const alternateRefs = locales.map((locale) => ({
      href: `https://spawnly.net${locale === defaultLocale ? '' : `/${locale}`}/knowledge-base/${article.slug}`,
      hreflang: locale,
    }));

    // Create a unique sitemap entry for every language variant
    locales.forEach((locale) => {
      const urlPrefix = locale === defaultLocale ? '' : `/${locale}`;
      
      fields.push({
        loc: `https://spawnly.net${urlPrefix}/knowledge-base/${article.slug}`,
        lastmod: lastmod,
        changefreq: 'weekly',
        priority: 0.8,
        alternateRefs: alternateRefs,
      });
    });
  });

  // 3. Return the dynamic XML
  return getServerSideSitemapLegacy(ctx, fields);
}

// Default export to prevent Next.js errors
export default function Sitemap() {}