// pages/api/servers/install-workshop.js
import { createClient } from '@supabase/supabase-js';
import { verifyServerAccess } from '../../../lib/accessControl';

const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    
    const { serverId, workshopId, appId } = req.body;
    if (!serverId || !workshopId || !appId) return res.status(400).json({ error: 'Missing required parameters' });

    try {
        const authHeader = req.headers.authorization;
        if (!authHeader) return res.status(401).json({ error: 'No authorization header' });
        
        const token = authHeader.split(' ')[1];
        const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
        if (authErr || !user) return res.status(401).json({ error: 'Invalid token' });

        const access = await verifyServerAccess(supabaseAdmin, serverId, user.id, 'control');
        if (!access.allowed) return res.status(403).json({ error: 'Access denied' });

        const { data: server } = await supabaseAdmin.from('servers').select('ipv4, rcon_password').eq('id', serverId).single();
        if (!server || !server.ipv4) return res.status(404).json({ error: 'Server or IP not found' });

        const wrapperUrl = `http://${server.ipv4}:3005/api/install-workshop`;
        
        // Native fetch is used here, no import required.
        const wrapperRes = await fetch(wrapperUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${server.rcon_password}`
            },
            body: JSON.stringify({ workshopId, appId })
        });

        const responseData = await wrapperRes.json();
        if (!wrapperRes.ok) throw new Error(responseData.error || 'Failed to communicate with server wrapper');

        return res.status(200).json({ success: true });
    } catch (err) {
        console.error('[Install Workshop] Error:', err.message);
        return res.status(500).json({ error: err.message });
    }
}