// pages/api/cron/bill-servers.js

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CRON_SECRET = process.env.CRON_SECRET;
const HETZNER_API_TOKEN = process.env.HETZNER_API_TOKEN;

// Helper: Reuse Hetzner Action Logic locally
const hetznerShutdown = async (hetznerId) => {
    if(!hetznerId) return;
    try {
        await fetch(`https://api.hetzner.cloud/v1/servers/${hetznerId}/actions/shutdown`, {
            method: 'POST',
            headers: { 
                'Authorization': `Bearer ${HETZNER_API_TOKEN}`, 
                'Content-Type': 'application/json' 
            }
        });
    } catch(e) {
        console.error(`Failed to shutdown server ${hetznerId}:`, e.message);
    }
};

async function deductCredits(supabaseAdmin, userId, amount, description, sessionId) { 
  const { data: profile, error } = await supabaseAdmin.from('profiles').select('credits').eq('id', userId).single();
  if (error || profile.credits < amount) {
    throw new Error('Insufficient credits');
  }

  const newCredits = profile.credits - amount;
  await supabaseAdmin.from('profiles').update({ credits: newCredits }).eq('id', userId);

  await supabaseAdmin.from('credit_transactions').insert({
    user_id: userId,
    amount: -amount,
    type: 'usage',
    description,
    created_at: new Date().toISOString(),
    session_id: sessionId
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // --- SECURITY FIX: Strict Secret Check ---
  if (!CRON_SECRET || req.headers['x-cron-secret'] !== CRON_SECRET) {
      return res.status(401).json({ error: 'Unauthorized' });
  }
  // -----------------------------------------

  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Fetch all running servers
  const { data: runningServers, error } = await supabaseAdmin.from('servers').select('*, current_session_id').eq('status', 'Running');
  if (error) return res.status(500).json({ error: 'Failed to fetch running servers' });

  console.log('Cron bill-servers triggered; running servers count:', (runningServers || []).length);

  let processedCount = 0;

  for (const server of runningServers || []) {
    try {
      // Ensure last_billed_at is initialized.
      if (!server.last_billed_at) {
        const initial = server.running_since || new Date().toISOString();
        try {
          await supabaseAdmin.from('servers').update({ 
              last_billed_at: initial, 
              runtime_accumulated_seconds: server.runtime_accumulated_seconds || 0 
          }).eq('id', server.id);
        } catch (e) {
          console.error('Failed to initialize last_billed_at for server', server.id, e && e.message);
        }
        continue;
      }

      const now = new Date();
      const lastBilled = new Date(server.last_billed_at);
      const elapsedSeconds = Math.floor((now - lastBilled) / 1000);
      const totalAccumulated = elapsedSeconds + (server.runtime_accumulated_seconds || 0);

      const intervalSeconds = 60; // 1 minute (semi-live billing)
      const billableIntervals = Math.floor(totalAccumulated / intervalSeconds);
      
      if (billableIntervals === 0) continue;

      const billableSeconds = billableIntervals * intervalSeconds;
      const remainingAccumulated = totalAccumulated - billableSeconds;
      const hours = billableSeconds / 3600;
      // Round cost to 4 decimals
      const cost = Number((hours * server.cost_per_hour).toFixed(4));

      // Check credits
      const { data: profile } = await supabaseAdmin.from('profiles').select('credits').eq('id', server.user_id).single();
      if (!profile) {
        console.error(`No profile found for user ${server.user_id}; skipping server ${server.id}`);
        continue;
      }

      if (profile.credits < cost) {
        // Auto-stop due to insufficient funds
        try {
          await hetznerShutdown(server.hetzner_id);
          await supabaseAdmin.from('servers').update({ status: 'Stopping' }).eq('id', server.id);
          console.log(`Auto-stopped server ${server.id} due to low credits`);
        } catch (autoStopErr) {
          console.error(`Failed to auto-stop server ${server.id}:`, autoStopErr.message);
        }
        continue;
      }

      // Deduct Credits
      try {
        await deductCredits(supabaseAdmin, server.user_id, cost, `Runtime charge for server ${server.id} (${billableSeconds} seconds)`, server.current_session_id);
        processedCount++;
      } catch (deductErr) {
        console.error(`Failed to deduct credits for user ${server.user_id} server ${server.id}:`, deductErr && deductErr.message);
        continue;
      }

      // Update server billing timestamps
      await supabaseAdmin.from('servers').update({
        last_billed_at: now.toISOString(),
        runtime_accumulated_seconds: remainingAccumulated
      }).eq('id', server.id);
      
    } catch(err) {
      console.error(`Unexpected error processing server ${server && server.id}:`, err && err.message);
      continue;
    }
  }

  res.status(200).json({ ok: true, processed: processedCount, total_running: (runningServers || []).length });
}