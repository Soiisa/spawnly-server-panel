/** @type {import('next-sitemap').IConfig} */
module.exports = {
  siteUrl: process.env.SITE_URL || 'https://spawnly.net',
  generateRobotsTxt: true, // Automatically generates robots.txt
  exclude: ['/server/*', '/admin/*','/dashboard'], // Don't let Google index private user panels
}