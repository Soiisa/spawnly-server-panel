// pages/api/steam/workshop-search.js
export default async function handler(req, res) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    // Extract appId from the frontend request, default to 107410 (Arma 3) as a fallback
    const { search = '', page = 1, appId = '107410' } = req.query;
    const limit = 15;

    const apiKey = process.env.STEAM_API_KEY;
    if (!apiKey) {
        return res.status(500).json({ error: 'STEAM_API_KEY is missing in your .env file.' });
    }

    try {
        // Steam API Query Types:
        // 9 = RankedByTotalUniqueSubscriptions (Properly sorts the entire workshop by downloads)
        // 12 = RankedByTextSearch (Used when the user actually types a name for better relevance)
        const queryType = search.trim() ? 12 : 9; 

        // Base URL WITHOUT the search_text parameter
        let url = `https://api.steampowered.com/IPublishedFileService/QueryFiles/v1/?key=${apiKey}&appid=${appId}&page=${page}&numperpage=${limit}&return_short_description=true&return_details=true&query_type=${queryType}`;

        // Only append the search_text parameter if the user actually typed something
        if (search.trim()) {
            url += `&search_text=${encodeURIComponent(search.trim())}`;
        }

        const steamRes = await fetch(url);
        if (!steamRes.ok) throw new Error(`Steam Web API Error: ${steamRes.status}`);
        
        const data = await steamRes.json();

        // Ensure strict mathematical sort for the current page just in case Steam's shards return slight variations
        if (data.response && data.response.publishedfiledetails) {
            data.response.publishedfiledetails.sort((a, b) => {
                const subsA = a.subscriptions || 0;
                const subsB = b.subscriptions || 0;
                return subsB - subsA; 
            });
        }

        res.status(200).json(data.response);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
}