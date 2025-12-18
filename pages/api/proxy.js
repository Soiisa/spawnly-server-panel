// pages/api/proxy.js

// Allowlist of domains that are safe to proxy
const ALLOWED_HOSTS = [
  'api.curseforge.com',
  'launchermeta.mojang.com',
  'piston-meta.mojang.com',
  'api.papermc.io',
  'api.purpurmc.org',
  'meta.fabricmc.net',
  'files.minecraftforge.net',
  'maven.neoforged.net',
  'mohistmc.com',
  'api.magmafoundation.org',
  'api.modrinth.com',
  'api.feed-the-beast.com'
];

export default async function handler(req, res) {
  const { url } = req.query;
  
  if (!url) {
    return res.status(400).json({ error: 'Missing url parameter' });
  }

  try {
    // 1. Parse and Validate the URL
    // We decode first to get the raw intent, then re-construct via URL object to ensure valid encoding
    const decodedUrlString = decodeURIComponent(url);
    const targetUrl = new URL(decodedUrlString);

    if (!ALLOWED_HOSTS.includes(targetUrl.hostname)) {
      console.warn(`[Proxy] Blocked SSRF attempt to: ${targetUrl.hostname}`);
      return res.status(403).json({ error: 'Forbidden: Domain not allowed' });
    }

    const headers = {}; 

    // 2. CurseForge Specific Handling
    if (decodedUrlString.includes('api.curseforge.com')) {
      const apiKey = process.env.CURSEFORGE_API_KEY;

      if (!apiKey) {
         console.error('❌ CURSEFORGE_API_KEY is missing from environment variables');
         return res.status(500).json({ error: 'Server configuration error: Missing CurseForge API Key' });
      }

      // Add Key
      headers['x-api-key'] = apiKey;
      headers['Accept'] = 'application/json';
      
      // Some WAFs require a User-Agent, even for APIs
      headers['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    } else {
      headers['User-Agent'] = 'Spawnly-Panel/1.0';
    }

    // 3. Fetch using targetUrl.toString() to ensure spaces/params are percent-encoded
    const response = await fetch(targetUrl.toString(), { headers });
    
    // FTB empty search handling
    if (!response.ok && response.status === 404 && decodedUrlString.includes('feed-the-beast')) {
       return res.status(200).json([]);
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Upstream error (${response.status}) for ${targetUrl.toString()}:`, errorText);
      
      // If 403, it's likely the API key or WAF
      if (response.status === 403) {
          return res.status(403).json({ error: "Access Denied by Provider. Check API Key or WAF." });
      }
      
      return res.status(response.status).json({ error: `Upstream error: ${response.statusText}` });
    }

    const contentType = response.headers.get('content-type');
    if (contentType) {
      res.setHeader('Content-Type', contentType);
    }

    const data = await response.text();
    res.status(200).send(data);
  } catch (error) {
    console.error('Proxy error:', error);
    res.status(500).json({ error: error.message });
  }
}a