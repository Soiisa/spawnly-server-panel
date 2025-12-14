// pages/api/proxy.js

// Allowlist of domains that are safe to proxy
const ALLOWED_HOSTS = ['api.curseforge.com'];

export default async function handler(req, res) {
  const { url } = req.query;
  
  if (!url) {
    return res.status(400).json({ error: 'Missing url parameter' });
  }

  try {
    const targetUrlString = decodeURIComponent(url);
    const targetUrl = new URL(targetUrlString);

    // --- SECURITY FIX: Validate Hostname ---
    if (!ALLOWED_HOSTS.includes(targetUrl.hostname)) {
      console.warn(`[Proxy] Blocked SSRF attempt to: ${targetUrl.hostname}`);
      return res.status(403).json({ error: 'Forbidden: Domain not allowed' });
    }
    // ---------------------------------------

    // Remove custom User-Agent to avoid blocking by Cloudflare/CurseForge
    const headers = {}; 

    if (targetUrlString.includes('api.curseforge.com')) {
      const apiKey = process.env.CURSEFORGE_API_KEY;

      if (!apiKey) {
         console.error('❌ CURSEFORGE_API_KEY is missing from environment variables');
         return res.status(500).json({ error: 'Server configuration error: Missing CurseForge API Key' });
      }

      // DEBUG: Log the first few characters to verify it's loaded correctly
      // (Don't log the full key in production logs)
      console.log(`🔑 Using CurseForge Key: ${apiKey.substring(0, 5)}... (Length: ${apiKey.length})`);

      headers['x-api-key'] = apiKey;
      headers['Accept'] = 'application/json';
    } else {
      // Only send User-Agent for non-CurseForge requests if needed
      headers['User-Agent'] = 'Spawnly-Panel/1.0';
    }

    const response = await fetch(targetUrlString, { headers });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Upstream error (${response.status}) for ${targetUrlString}:`, errorText);
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
}