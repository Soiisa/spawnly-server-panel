// pages/api/proxy.js
export default async function handler(req, res) {
  const { url } = req.query;
  
  if (!url) {
    return res.status(400).json({ error: 'Missing url parameter' });
  }

  try {
    const targetUrl = decodeURIComponent(url);
    const headers = {
      'User-Agent': 'Spawnly-Panel/1.0'
    };

    // --- NEW: Inject CurseForge Key securely ---
    // Ensure you have CURSEFORGE_API_KEY in your .env or .env.local file
    if (targetUrl.includes('api.curseforge.com')) {
      if (!process.env.CURSEFORGE_API_KEY) {
         console.error('Missing CURSEFORGE_API_KEY in server environment variables.');
         return res.status(500).json({ error: 'Server configuration error: Missing CurseForge API Key' });
      }
      headers['x-api-key'] = process.env.CURSEFORGE_API_KEY;
      headers['Accept'] = 'application/json';
    }

    const response = await fetch(targetUrl, { headers });
    
    if (!response.ok) {
      // Log the specific error for debugging
      const errorText = await response.text();
      console.error(`Upstream error (${response.status}) for ${targetUrl}:`, errorText);
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