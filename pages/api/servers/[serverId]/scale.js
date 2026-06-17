// pages/api/servers/[serverId]/scale.js

import { createClient } from '@supabase/supabase-js';
import axios from 'axios';
import { verifyServerAccess } from '../../../../lib/accessControl';
import { getMonthlyCreditCost, getHetznerType, getHourlyCreditCost } from '../../../../lib/config';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const HETZNER_API_BASE = 'https://api.hetzner.cloud/v1';
const HETZNER_TOKEN = process.env.HETZNER_API_TOKEN;

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const waitForAction = async (actionId, maxTries = 60, intervalMs = 2000) => {
  if (!actionId) return null;
  const url = `${HETZNER_API_BASE}/actions/${actionId}`;
  for (let i = 0; i < maxTries; i++) {
    try {
      const res = await axios.get(url, { headers: { Authorization: `Bearer ${HETZNER_TOKEN}` } });
      if (res.data.action && (res.data.action.status === 'success' || res.data.action.status === 'error')) {
        if (res.data.action.status === 'error') throw new Error(res.data.action.error.message);
        return res.data.action;
      }
      await new Promise((r) => setTimeout(r, intervalMs));
    } catch (err) {
      if (err.message && err.message !== 'Request failed with status code 404') throw err;
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  }
  throw new Error("Hetzner action timed out");
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { serverId } = req.query;
  const { newRam } = req.body;

  if (!serverId || !newRam) return res.status(400).json({ error: 'Missing parameters' });

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  const token = authHeader.split(' ')[1];
  
  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  if (!user || !(await verifyServerAccess(supabaseAdmin, serverId, user.id, 'admin')).allowed) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const { data: server, error: serverErr } = await supabaseAdmin.from('servers').select('*').eq('id', serverId).single();
  if (serverErr || !server) return res.status(404).json({ error: 'Server not found' });
  
  if (server.billing_type !== 'monthly') {
      return res.status(400).json({ error: 'Scaling via this endpoint is only for monthly servers.' });
  }
  if (!server.hetzner_id) return res.status(400).json({ error: 'Server is not provisioned on Hetzner' });
  if (server.ram === newRam) return res.status(400).json({ error: 'Server is already at this RAM level' });

  // Centralized Math via Config
  const now = new Date();
  const lastBilled = new Date(server.last_billed_at || server.created_at);
  const elapsedDays = Math.max(0, (now - lastBilled) / (1000 * 60 * 60 * 24));
  const remainingDays = Math.min(30, Math.max(0, 30 - elapsedDays));

  const oldMonthlyCost = getMonthlyCreditCost(server.ram);
  const newMonthlyCost = getMonthlyCreditCost(newRam);

  const oldDaily = oldMonthlyCost / 30;
  const newDaily = newMonthlyCost / 30;

  const netCharge = Number(((newDaily - oldDaily) * remainingDays).toFixed(2));

  const targetId = server.pool_id || server.user_id;
  const table = server.pool_id ? 'credit_pools' : 'profiles';
  const balanceCol = server.pool_id ? 'balance' : 'credits';

  const { data: wallet } = await supabaseAdmin.from(table).select(balanceCol).eq('id', targetId).single();
  const currentBalance = wallet[balanceCol];

  if (netCharge > 0 && currentBalance < netCharge) {
      return res.status(402).json({ error: `Insufficient credits. This upgrade requires ${netCharge} credits to cover the rest of the month.` });
  }

  try {
    const hetznerRes = await axios.get(`${HETZNER_API_BASE}/servers/${server.hetzner_id}`, {
        headers: { Authorization: `Bearer ${HETZNER_TOKEN}` }
    });
    const isRunning = hetznerRes.data.server.status !== 'off';

    if (isRunning) {
        await supabaseAdmin.from('servers').update({ status: 'Stopping' }).eq('id', server.id);
        const powerOffRes = await axios.post(`${HETZNER_API_BASE}/servers/${server.hetzner_id}/actions/poweroff`, {}, {
            headers: { Authorization: `Bearer ${HETZNER_TOKEN}` }
        });
        await waitForAction(powerOffRes.data.action.id);
    }

    // Dynamic Hardware Map via config
    const newInstanceType = getHetznerType(newRam, false); 
    
    console.log(`[Scale] Upgrading ${server.id} to ${newInstanceType} with upgrade_disk: false`);
    const changeRes = await axios.post(`${HETZNER_API_BASE}/servers/${server.hetzner_id}/actions/change_type`, {
        server_type: newInstanceType,
        upgrade_disk: false 
    }, {
        headers: { Authorization: `Bearer ${HETZNER_TOKEN}`, 'Content-Type': 'application/json' }
    });

    await waitForAction(changeRes.data.action.id);

    const newBalance = currentBalance - netCharge;
    await supabaseAdmin.from(table).update({ [balanceCol]: newBalance }).eq('id', targetId);

    const transactionTable = server.pool_id ? 'pool_transactions' : 'credit_transactions';
    const txPayload = {
        amount: -netCharge, 
        type: netCharge > 0 ? 'usage' : 'refund',
        description: `Prorated Server Scaling: ${server.ram}GB -> ${newRam}GB (${remainingDays.toFixed(1)} days left in cycle)`,
        session_id: server.current_session_id
    };
    if (server.pool_id) { txPayload.pool_id = server.pool_id; txPayload.server_id = server.id; }
    else { txPayload.user_id = server.user_id; }
    
    await supabaseAdmin.from(transactionTable).insert([txPayload]);

    const hourlyCost = getHourlyCreditCost(newRam);
    await supabaseAdmin.from('servers').update({
        ram: newRam,
        instance_type: newInstanceType,
        cost_per_hour: hourlyCost, 
        status: isRunning ? 'Starting' : 'Stopped'
    }).eq('id', server.id);

    if (isRunning) {
        await axios.post(`${HETZNER_API_BASE}/servers/${server.hetzner_id}/actions/poweron`, {}, {
            headers: { Authorization: `Bearer ${HETZNER_TOKEN}` }
        });
    }

    return res.status(200).json({ 
        success: true, message: 'Server scaled successfully', netCharge: netCharge, newRam: newRam
    });

  } catch (error) {
    const errorMsg = error.response?.data?.error?.message || error.message;
    console.error('[Scale API Error]', errorMsg);
    await supabaseAdmin.from('servers').update({ status: 'Stopped' }).eq('id', server.id);
    return res.status(500).json({ error: 'Scaling failed at infrastructure level', detail: errorMsg });
  }
}