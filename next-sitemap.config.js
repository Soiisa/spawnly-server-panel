/** @type {import('next-sitemap').IConfig} */
module.exports = {
  siteUrl: process.env.SITE_URL || 'https://spawnly.net',
  generateRobotsTxt: true,
  // This removes these paths from the sitemap.xml
  exclude: ['/server/*', '/admin/*', '/dashboard', '/server-sitemap.xml'], 
  
  robotsTxtOptions: {
    policies: [
      {
        userAgent: '*',
        allow: '/',
        // This tells Google NOT to crawl these private paths
        disallow: ['/server/', '/admin/', '/dashboard/'], 
      },
    ],
    additionalSitemaps: [
      `${process.env.SITE_URL || 'https://spawnly.net'}/server-sitemap.xml`,
    ],
  },
}