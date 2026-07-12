// pages/api/steam/workshop.js
export default async function handler(req, res) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
    
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'Workshop ID is required' });

    try {
        const formData = new URLSearchParams();
        formData.append('itemcount', '1');
        formData.append('publishedfileids[0]', id);

        const steamRes = await fetch('https://api.steampowered.com/ISteamRemoteStorage/GetPublishedFileDetails/v1/', {
            method: 'POST',
            body: formData
        });

        if (!steamRes.ok) throw new Error('Steam Web API returned an error');

        const data = await steamRes.json();
        res.status(200).json(data);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
}