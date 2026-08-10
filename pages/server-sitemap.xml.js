import { getServerSideSitemapLegacy } from 'next-sitemap';
import { supabase } from '../lib/supabaseClient';
import { i18n } from '../next-i18next.config';

export async function getServerSideProps(ctx) {
  // 1. Fetch every published article, across every language — every language
  // shares the same `slug`, differentiated only by the `language` column (see
  // pages/knowledge-base/[slug].js), so this single query covers all of them.
  const { data: articles } = await supabase
    .from('kb_articles')
    .select('slug, language, updated_at')
    .eq('is_published', true);

  // 2. Locales come straight from next-i18next.config.js instead of a second
  // hardcoded copy — that's what let this list drift and silently drop 'fr'
  // from every knowledge-base sitemap entry and hreflang block before.
  const { defaultLocale } = i18n;

  // 3. Group rows by slug so we only emit ONE sitemap entry per (slug, language)
  // pair, with hreflang alternates limited to languages that actually have a
  // translation — submitting a hreflang alternate (or a sitemap URL) for a
  // language that has no row yet would just point Google at a 404.
  const bySlug = new Map();
  (articles || []).forEach((article) => {
    if (!bySlug.has(article.slug)) bySlug.set(article.slug, []);
    bySlug.get(article.slug).push(article);
  });

  const fields = [];

  bySlug.forEach((variants, slug) => {
    const existingLangs = variants.map((v) => v.language);
    const alternateRefs = variants.map((v) => ({
      href: `https://spawnly.net${v.language === defaultLocale ? '' : `/${v.language}`}/knowledge-base/${slug}`,
      hreflang: v.language,
    }));

    variants.forEach((article) => {
      const urlPrefix = article.language === defaultLocale ? '' : `/${article.language}`;

      fields.push({
        loc: `https://spawnly.net${urlPrefix}/knowledge-base/${slug}`,
        lastmod: new Date(article.updated_at).toISOString(),
        changefreq: 'weekly',
        priority: 0.8,
        alternateRefs,
      });
    });
  });

  // 4. Return the dynamic XML
  return getServerSideSitemapLegacy(ctx, fields);
}

// Default export to prevent Next.js errors
export default function Sitemap() {}