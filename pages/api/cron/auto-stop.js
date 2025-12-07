// pages/api/cron/auto-stop.js
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CRON_SECRET = process.env.CRON_SECRET;
const HETZNER_API_BASE = 'https://api.hetzner.cloud/v1';
const HETZNER_TOKEN = process.env.HETZNER_API_TOKEN;

const hetznerDoAction = async (hetznerId, action) => {
  if (!hetznerId || !HETZNER_TOKEN) return;
  try {
    await fetch(`${HETZNER_API_BASE}/servers/${hetznerId}/actions/${action}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${HETZNER_TOKEN}`, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error(`[Auto-Stop] Hetzner Action Error: ${e.message}`);
  }
};

export default async function handler(req, res) {
  // Allow GET for easy testing in browser/curl, or POST
  if (req.method !== 'POST' && req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  
  // Verify Secret
  const authHeader = req.headers.authorization;
  const cronHeader = req.headers['x-cron-secret'];
  if (cronHeader !== CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // 1. Get running servers that are empty and have a timeout set
  const { data: servers } = await supabaseAdmin
    .from('servers')
    .select('id, hetzner_id, last_empty_at, auto_stop_timeout')
    .eq('status', 'Running')
    .gt('auto_stop_timeout', 0)
    .not('last_empty_at', 'is', null);

  const now = new Date();
  let stoppedCount = 0;

  for (const server of servers || []) {
    const lastEmpty = new Date(server.last_empty_at);
    const emptyMinutes = (now - lastEmpty) / 1000 / 60;

    if (emptyMinutes >= server.auto_stop_timeout) {
      console.log(`[Auto-Stop] Stopping server ${server.id} (Empty for ${emptyMinutes.toFixed(1)}m)`);
      
      // Stop server on Hetzner
      await hetznerDoAction(server.hetzner_id, 'shutdown');
      
      // Update DB Status
      await supabaseAdmin.from('servers').update({ status: 'Stopping' }).eq('id', server.id);
      
      stoppedCount++;
    }
  }

  res.status(200).json({ success: true, stopped: stoppedCount });
}