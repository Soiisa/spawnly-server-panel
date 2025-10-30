import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CRON_SECRET = process.env.CRON_SECRET; // Set this in env for security

async function deductCredits(supabaseAdmin, userId, amount, description) {
  const { data: profile, error } = await supabaseAdmin.from('profiles').select('credits').eq('id', userId).single();
  if (error || profile.credits < amount) {
    throw new Error('Insufficient credits');
  }

  const newCredits = profile.credits - amount;
  await supabaseAdmin.from('profiles').update({ credits: newCredits }).eq('id', userId);

  await supabaseAdmin.from('credit_transactions').insert({
    user_id: userId,
    amount: -amount,
    type: 'deduction',
    description,
    created_at: new Date().toISOString()
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Secure with secret
  if (req.headers['x-cron-secret'] !== CRON_SECRET) return res.status(401).json({ error: 'Unauthorized' });

  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Fetch all running servers
  const { data: runningServers, error } = await supabaseAdmin.from('servers').select('*').eq('status', 'Running');
  if (error) return res.status(500).json({ error: 'Failed to fetch running servers' });

  for (const server of runningServers || []) {
    // Ensure last_billed_at is initialized. If it's missing, initialize it to when the server started running
    // (running_since if available) or now. This prevents the cron from skipping newly-started servers.
    if (!server.last_billed_at) {
      const initial = server.running_since || new Date().toISOString();
      try {
        await supabaseAdmin.from('servers').update({ last_billed_at: initial, runtime_accumulated_seconds: server.runtime_accumulated_seconds || 0 }).eq('id', server.id);
      } catch (e) {
        console.error('Failed to initialize last_billed_at for server', server.id, e && e.message);
      }
      // skip billing this run; billing starts from the next iteration
      continue;
    }

    const now = new Date();
    const lastBilled = new Date(server.last_billed_at);
    const elapsedSeconds = Math.floor((now - lastBilled) / 1000);
    const totalAccumulated = elapsedSeconds + (server.runtime_accumulated_seconds || 0);

    const intervalSeconds = 300; // 5 minutes
    const billableIntervals = Math.floor(totalAccumulated / intervalSeconds);
    if (billableIntervals === 0) continue;

    const billableSeconds = billableIntervals * intervalSeconds;
    const remainingAccumulated = totalAccumulated - billableSeconds;
    const hours = billableSeconds / 3600;
    const cost = hours * server.cost_per_hour;

    // Check credits
    const { data: profile } = await supabaseAdmin.from('profiles').select('credits').eq('id', server.user_id).single();
    if (profile.credits < cost) {
      // Auto-stop
      try {
        await hetznerDoAction(server.hetzner_id, 'shutdown'); // Reuse from action.js
        await supabaseAdmin.from('servers').update({ status: 'Stopping' }).eq('id', server.id);
        console.log(`Auto-stopped server ${server.id} due to low credits`);
      } catch (autoStopErr) {
        console.error(`Failed to auto-stop server ${server.id}:`, autoStopErr.message);
      }
      continue;
    }

    // Deduct
    await deductCredits(supabaseAdmin, server.user_id, cost, `Runtime charge for server ${server.id} (${billableSeconds} seconds)`);

    // Update server
    await supabaseAdmin.from('servers').update({
      last_billed_at: now.toISOString(),
      runtime_accumulated_seconds: remainingAccumulated
    }).eq('id', server.id);
  }

  res.status(200).json({ ok: true, processed: runningServers.length });
}