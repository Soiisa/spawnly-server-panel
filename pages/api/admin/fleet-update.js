// pages/api/admin/fleet-update.js
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    // 1. Auth & Admin Check
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'No token' });
    const token = authHeader.split(' ')[1];
    
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) return res.status(401).json({ error: 'Invalid token' });

    const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('is_admin')
        .eq('id', user.id)
        .single();

    if (!profile?.is_admin) return res.status(403).json({ error: 'Forbidden' });

    // Ensure this matches where you upload the new files in Hetzner S3
    const DAEMON_S3_PREFIX = process.env.DAEMON_S3_PREFIX || 's3://spawnly/scripts';

    try {
        // 2. Fetch all Currently Running servers
        const { data: servers, error } = await supabaseAdmin
            .from('servers')
            .select('id, ipv4, rcon_password, name')
            .eq('status', 'Running');

        if (error) throw error;

        let results = { total: servers.length, success: [], failed: [] };

        // 3. Broadcast the update to all servers concurrently
        const updatePromises = servers.map(async (server) => {
            if (!server.ipv4 || !server.rcon_password) {
                results.failed.push({ id: server.id, name: server.name, reason: 'Missing IPv4 or RCON' });
                return;
            }

            try {
                // Port 3005 is file-api.js
                const response = await fetch(`http://${server.ipv4}:3005/api/system/update-daemon`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${server.rcon_password}`
                    },
                    body: JSON.stringify({
                        s3Prefix: DAEMON_S3_PREFIX,
                        filesToUpdate: ['file-api.js', 'steam-wrapper.js', 'server-wrapper.js'] 
                    })
                });

                if (response.ok) {
                    results.success.push({ id: server.id, name: server.name });
                } else {
                    results.failed.push({ id: server.id, name: server.name, reason: `HTTP ${response.status}` });
                }
            } catch (err) {
                results.failed.push({ id: server.id, name: server.name, reason: 'Connection Timeout / Offline' });
            }
        });

        // Wait for all servers to acknowledge
        await Promise.all(updatePromises);

        res.status(200).json({ message: 'Fleet update broadcast complete', results });

    } catch (err) {
        console.error('Fleet update failed:', err);
        res.status(500).json({ error: err.message });
    }
}