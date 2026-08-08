// components/SEO.js
import Head from 'next/head';

const SITE_URL = process.env.SITE_URL || 'https://spawnly.net';

export default function SEO({ title, description, path }) {
  const url = path ? `${SITE_URL}${path}` : SITE_URL;

  return (
    <Head>
      <title>{title}</title>
      {description && <meta name="description" content={description} />}
      {path && <link rel="canonical" href={url} />}
      <meta property="og:title" content={title} />
      {description && <meta property="og:description" content={description} />}
      <meta property="og:url" content={url} />
      <meta property="og:type" content="website" />
    </Head>
  );
}
