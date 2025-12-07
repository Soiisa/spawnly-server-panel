// pages/api/cron/auto-stop.js
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CRON_SECRET = process.env.CRON_SECRET;
const APP_BASE_URL = process.env.APP_BASE_URL || 'http://localhost:3000'; // Ensure this var is set in Coolify

export default async function handler(req, res) {
  // Allow GET for easy testing, POST for cron
  if (req.method !== 'POST' && req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  
  // Verify Secret
  const authHeader = req.headers.authorization;
  const cronHeader = req.headers['x-cron-secret'];
  if (cronHeader !== CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // 1. Get running servers that are empty and have a timeout set
  const { data: servers, error } = await supabaseAdmin
    .from('servers')
    .select('id, last_empty_at, auto_stop_timeout')
    .eq('status', 'Running')
    .gt('auto_stop_timeout', 0)
    .not('last_empty_at', 'is', null);

  if (error) {
    console.error('[Auto-Stop] DB Error:', error);
    return res.status(500).json({ error: 'Database error' });
  }

  const now = new Date();
  const stopPromises = [];

  console.log(`[Auto-Stop] Checking ${servers?.length || 0} potentially empty servers...`);

  for (const server of servers || []) {
    const lastEmpty = new Date(server.last_empty_at);
    // Calculate minutes empty
    const emptyMinutes = (now - lastEmpty) / 1000 / 60;

    if (emptyMinutes >= server.auto_stop_timeout) {
      console.log(`[Auto-Stop] Server ${server.id} empty for ${emptyMinutes.toFixed(1)}m (Limit: ${server.auto_stop_timeout}m). Stopping...`);
      
      // Call the main action API to handle stop + billing logic
      const stopRequest = fetch(`${APP_BASE_URL}/api/servers/action`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json' 
        },
        body: JSON.stringify({ 
          serverId: server.id, 
          action: 'stop' 
        })
      })
      .then(async (apiRes) => {
        if (!apiRes.ok) {
          const text = await apiRes.text();
          console.error(`[Auto-Stop] Failed to stop server ${server.id}: ${apiRes.status} ${text}`);
        } else {
          console.log(`[Auto-Stop] Stop signal sent successfully for ${server.id}`);
        }
      })
      .catch(err => {
        console.error(`[Auto-Stop] Network error stopping server ${server.id}:`, err);
      });

      stopPromises.push(stopRequest);
    }
  }

  // Wait for all stop requests to finish (so the cron script doesn't exit early)
  await Promise.all(stopPromises);

  res.status(200).json({ success: true, triggered: stopPromises.length });
}