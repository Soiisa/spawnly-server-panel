// pages/api/cron/auto-stop.js
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CRON_SECRET = process.env.CRON_SECRET;
const HETZNER_API_TOKEN = process.env.HETZNER_API_TOKEN;

// Helper: Reuse Hetzner Action Logic locally to avoid import issues
const shutdownHetznerServer = async (hetznerId) => {
  if (!hetznerId) return;
  try {
    const res = await fetch(`https://api.hetzner.cloud/v1/servers/${hetznerId}/actions/shutdown`, {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${HETZNER_API_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });
    if (!res.ok) console.error(`Hetzner shutdown failed for ${hetznerId}: ${res.status}`);
  } catch (e) {
    console.error(`Hetzner API error for ${hetznerId}:`, e.message);
  }
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  
  // --- SECURITY FIX: Strict Secret Check ---
  const authHeader = req.headers.authorization;
  const cronHeader = req.headers['x-cron-secret'];
  
  // Verify secret exists and matches. Fails safe if CRON_SECRET is not set.
  if (!CRON_SECRET || (cronHeader !== CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`)) {
    console.warn('[Auto-Stop] Unauthorized attempt or CRON_SECRET missing');
    return res.status(401).json({ error: 'Unauthorized' });
  }
  // -----------------------------------------

  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: servers, error } = await supabaseAdmin
    .from('servers')
    .select('id, last_empty_at, auto_stop_timeout, hetzner_id, status')
    .eq('status', 'Running')
    .gt('auto_stop_timeout', 0)
    .not('last_empty_at', 'is', null);

  if (error) {
    console.error('[Auto-Stop] DB Error:', error);
    return res.status(500).json({ error: 'Database error' });
  }

  const now = new Date();
  let stoppedCount = 0;

  console.log(`[Auto-Stop] Checking ${servers?.length || 0} potentially empty servers...`);

  for (const server of servers || []) {
    const lastEmpty = new Date(server.last_empty_at);
    // Calculate minutes empty
    const emptyMinutes = (now - lastEmpty) / 1000 / 60;

    if (emptyMinutes >= server.auto_stop_timeout) {
      console.log(`[Auto-Stop] Stopping server ${server.id} (Empty for ${emptyMinutes.toFixed(1)}m / Limit: ${server.auto_stop_timeout}m)`);
      
      // 1. Trigger Shutdown at Infrastructure Level
      await shutdownHetznerServer(server.hetzner_id);

      // 2. Update Database Status
      // Setting to 'Stopping' allows the billing cron to catch the final minutes and finalize the session
      const { error: updateErr } = await supabaseAdmin
        .from('servers')
        .update({ status: 'Stopping' }) 
        .eq('id', server.id);
        
      if (updateErr) {
        console.error(`[Auto-Stop] Failed to update status for ${server.id}:`, updateErr.message);
      } else {
        stoppedCount++;
      }
    }
  }

  res.status(200).json({ success: true, stopped: stoppedCount });
}