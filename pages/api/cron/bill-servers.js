// pages/api/cron/bill-servers.js

import { createClient } from '@supabase/supabase-js';
import nodemailer from 'nodemailer';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CRON_SECRET = process.env.CRON_SECRET;
const HETZNER_API_TOKEN = process.env.HETZNER_API_TOKEN;

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

// --- EMAIL ALERT HELPER ---
async function sendSuspensionEmail(supabaseAdmin, userId, serverName) {
    try {
        const { data: authData } = await supabaseAdmin.auth.admin.getUserById(userId);
        const email = authData?.user?.email;
        if (!email) return;

        const transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: parseInt(process.env.SMTP_PORT || '587', 10),
            secure: parseInt(process.env.SMTP_PORT, 10) === 465, 
            auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
        });

        await transporter.sendMail({
            from: `"Spawnly Alerts" <${process.env.SMTP_FROM_EMAIL}>`,
            to: email,
            subject: `Action Required: Server Paused (${serverName})`,
            html: `<p>Your server <strong>${serverName}</strong> has been paused because your account has run out of credits.</p><p>Please log in and add credits to restart your server!</p>`,
        });
    } catch (e) { console.warn('Email failed:', e.message); }
}

async function deductCredits(supabaseAdmin, userId, amount, serverId, sessionId, billableSeconds, customDescription = null) { 
  const { data: profile, error } = await supabaseAdmin.from('profiles').select('credits').eq('id', userId).single();
  if (error || profile.credits < amount) {
    throw new Error('Insufficient credits');
  }

  const newCredits = profile.credits - amount;
  await supabaseAdmin.from('profiles').update({ credits: newCredits }).eq('id', userId);

  let existingTx = null;

  if (sessionId) {
      const { data } = await supabaseAdmin
        .from('credit_transactions')
        .select('*')
        .eq('session_id', sessionId)
        .eq('type', 'usage')
        .single();
      existingTx = data;
  }

  if (existingTx) {
      const currentAmount = existingTx.amount; 
      const newAmount = currentAmount - amount; 

      const timeMatch = existingTx.description.match(/\((\d+)\s*seconds\)/);
      let totalSeconds = billableSeconds;
      if (timeMatch && timeMatch[1]) {
          totalSeconds += parseInt(timeMatch[1], 10);
      }

      const newDescription = customDescription || `Runtime charge for server ${serverId} (${totalSeconds} seconds)`;

      await supabaseAdmin.from('credit_transactions').update({
        amount: newAmount,
        description: newDescription,
      }).eq('id', existingTx.id);

  } else {
      await supabaseAdmin.from('credit_transactions').insert({
        user_id: userId,
        amount: -amount,
        type: 'usage',
        description: customDescription || `Runtime charge for server ${serverId} (${billableSeconds} seconds)`,
        created_at: new Date().toISOString(),
        session_id: sessionId
      });
  }
}

async function deductPoolCredits(supabaseAdmin, poolId, amount, serverId, sessionId, billableSeconds, customDescription = null) {
    const { data: pool, error } = await supabaseAdmin.from('credit_pools').select('balance').eq('id', poolId).single();
    if (error || pool.balance < amount) {
        throw new Error('Insufficient pool credits');
    }

    const newBalance = pool.balance - amount;
    await supabaseAdmin.from('credit_pools').update({ balance: newBalance }).eq('id', poolId);

    let existingTx = null;

    if (sessionId) {
        const { data } = await supabaseAdmin
            .from('pool_transactions')
            .select('*')
            .eq('session_id', sessionId)
            .eq('pool_id', poolId)
            .eq('type', 'usage')
            .single();
        existingTx = data;
    }

    if (existingTx) {
         const currentAmount = existingTx.amount; 
         const newAmount = currentAmount - amount; 

         const timeMatch = existingTx.description.match(/\((\d+)\s*seconds\)/);
         let totalSeconds = billableSeconds;
         if (timeMatch && timeMatch[1]) {
             totalSeconds += parseInt(timeMatch[1], 10);
         }

         const newDescription = customDescription || `Runtime charge for server ${serverId} (${totalSeconds} seconds)`;
         
         await supabaseAdmin.from('pool_transactions').update({
             amount: newAmount,
             description: newDescription
         }).eq('id', existingTx.id);
    } else {
        await supabaseAdmin.from('pool_transactions').insert({
            pool_id: poolId,
            server_id: serverId,
            amount: -amount,
            type: 'usage',
            description: customDescription || `Runtime charge for server ${serverId} (${billableSeconds} seconds)`,
            session_id: sessionId
        });
    }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!CRON_SECRET || req.headers['x-cron-secret'] !== CRON_SECRET) {
      return res.status(401).json({ error: 'Unauthorized' });
  }

  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: runningServers, error } = await supabaseAdmin.from('servers').select('*, current_session_id').eq('status', 'Running');
  if (error) return res.status(500).json({ error: 'Failed to fetch running servers' });

  let processedCount = 0;

  for (const server of runningServers || []) {
    try {
      const now = new Date();

      // ------------------------------------------------------------------
      // 1. MONTHLY SERVER LOGIC (Macro-Billing with Grace Period)
      // ------------------------------------------------------------------
      if (server.billing_type === 'monthly') {
          const lastBilled = new Date(server.last_billed_at || server.created_at);
          const daysSinceBilled = (now - lastBilled) / (1000 * 60 * 60 * 24);

          if (daysSinceBilled >= 30) {
              const monthlyCost = Math.round(server.cost_per_hour * 720);
              const desc = `Monthly Reserved Fee: Server ${server.id}`;
              
              try {
                  if (server.pool_id) {
                      await deductPoolCredits(supabaseAdmin, server.pool_id, monthlyCost, server.id, null, 0, desc);
                  } else {
                      await deductCredits(supabaseAdmin, server.user_id, monthlyCost, server.id, null, 0, desc);
                  }
                  
                  // Update the billing anchor to today
                  await supabaseAdmin.from('servers').update({ last_billed_at: now.toISOString() }).eq('id', server.id);
                  processedCount++;
              } catch (e) {
                  // Insufficient Funds! Check if 24-hour grace period expired (31 days)
                  if (daysSinceBilled >= 31) {
                      console.log(`[Billing] Grace period expired for server ${server.id}. Shutting down.`);
                      await hetznerShutdown(server.hetzner_id);
                      await supabaseAdmin.from('servers').update({ status: 'Stopped' }).eq('id', server.id);
                      await sendSuspensionEmail(supabaseAdmin, server.user_id, server.name);
                  } else {
                      console.log(`[Billing] Server ${server.id} pending payment. Grace period active for ${(31 - daysSinceBilled).toFixed(2)} more days.`);
                  }
              }
          }
          continue; 
      }

      // ------------------------------------------------------------------
      // 2. HOURLY SERVER LOGIC (Micro-Billing with Session Rows)
      // ------------------------------------------------------------------
      if (!server.last_billed_at) {
        const initial = server.running_since || now.toISOString();
        try {
          await supabaseAdmin.from('servers').update({ 
              last_billed_at: initial, 
              runtime_accumulated_seconds: server.runtime_accumulated_seconds || 0 
          }).eq('id', server.id);
        } catch (e) {}
        continue;
      }

      const lastBilled = new Date(server.last_billed_at);
      const elapsedSeconds = Math.floor((now - lastBilled) / 1000);
      const totalAccumulated = elapsedSeconds + (server.runtime_accumulated_seconds || 0);

      const intervalSeconds = 60; 
      const billableIntervals = Math.floor(totalAccumulated / intervalSeconds);
      
      if (billableIntervals === 0) continue;

      const billableSeconds = billableIntervals * intervalSeconds;
      const remainingAccumulated = totalAccumulated - billableSeconds;
      const hours = billableSeconds / 3600;
      const cost = Number((hours * server.cost_per_hour).toFixed(4));

      let billSuccess = false;
      
      if (server.pool_id) {
          try {
              await deductPoolCredits(supabaseAdmin, server.pool_id, cost, server.id, server.current_session_id, billableSeconds);
              billSuccess = true;
          } catch (poolErr) {
              billSuccess = false; 
          }
      } else {
          try {
              await deductCredits(supabaseAdmin, server.user_id, cost, server.id, server.current_session_id, billableSeconds);
              billSuccess = true;
          } catch (deductErr) {
              billSuccess = false;
          }
      }

      if (!billSuccess) {
        try {
          await hetznerShutdown(server.hetzner_id);
          await supabaseAdmin.from('servers').update({ status: 'Stopping' }).eq('id', server.id);
          await sendSuspensionEmail(supabaseAdmin, server.user_id, server.name);
        } catch (autoStopErr) {}
        continue; 
      }

      if (billSuccess) {
          processedCount++;
          await supabaseAdmin.from('servers').update({
            last_billed_at: now.toISOString(),
            runtime_accumulated_seconds: remainingAccumulated
          }).eq('id', server.id);
      }
      
    } catch(err) { continue; }
  }

  res.status(200).json({ ok: true, processed: processedCount, total_running: (runningServers || []).length });
}