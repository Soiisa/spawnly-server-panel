// components/SEO.js
import Head from 'next/head';
import { useRouter } from 'next/router';

const SITE_URL = process.env.SITE_URL || 'https://spawnly.net';
const SITE_NAME = 'Spawnly';
const DEFAULT_IMAGE = `${SITE_URL}/logo.png`;

export default function SEO({
  title,
  description,
  path,
  image = DEFAULT_IMAGE,
  type = 'website',
  noindex = false,
  hreflang = true,
}) {
  const router = useRouter();
  const locale = router.locale || 'en';
  const defaultLocale = router.defaultLocale || 'en';
  const locales = router.locales || [defaultLocale];

  // Locale-prefixed path: default locale has no prefix (e.g. /pricing),
  // everything else does (e.g. /es/pricing) — matches next-i18next routing.
  // The home page ("/") is the one case where the prefixed form must NOT
  // carry the trailing slash through (Next serves it at "/es", not "/es/").
  const nonRootPath = path === '/' ? '' : (path || '');
  const localizedPath = (loc) => (loc === defaultLocale ? (path || '') : `/${loc}${nonRootPath}`);
  const url = path ? `${SITE_URL}${localizedPath(locale)}` : SITE_URL;

  return (
    <Head>
      <title>{title}</title>
      {description && <meta name="description" content={description} />}

      {noindex && <meta name="robots" content="noindex, nofollow" />}
      {!noindex && path && <link rel="canonical" href={url} />}

      {/* Hreflang alternates so each locale variant is treated as the
          localized version of this page, not duplicate content. */}
      {hreflang && !noindex && path && locales.map((loc) => (
        <link
          key={loc}
          rel="alternate"
          hrefLang={loc}
          href={`${SITE_URL}${localizedPath(loc)}`}
        />
      ))}
      {hreflang && !noindex && path && (
        <link rel="alternate" hrefLang="x-default" href={`${SITE_URL}${path}`} />
      )}

      {/* Open Graph */}
      <meta property="og:site_name" content={SITE_NAME} />
      <meta property="og:title" content={title} />
      {description && <meta property="og:description" content={description} />}
      <meta property="og:url" content={url} />
      <meta property="og:type" content={type} />
      <meta property="og:image" content={image} />
      <meta property="og:locale" content={locale} />

      {/* Twitter Card */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={title} />
      {description && <meta name="twitter:description" content={description} />}
      <meta name="twitter:image" content={image} />
    </Head>
  );
}
