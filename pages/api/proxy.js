// pages/api/proxy.js
export default async function handler(req, res) {
  const { url } = req.query;
  
  if (!url) {
    return res.status(400).json({ error: 'Missing url parameter' });
  }

  try {
    const response = await fetch(decodeURIComponent(url));
    
    if (!response.ok) {
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