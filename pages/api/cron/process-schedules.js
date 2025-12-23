// pages/api/cron/process-schedules.js
import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const HETZNER_API_TOKEN = process.env.HETZNER_API_TOKEN;
const CRON_SECRET = process.env.CRON_SECRET; 

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const hetznerDoAction = async (hetznerId, action) => {
  try {
    const url = `https://api.hetzner.cloud/v1/servers/${hetznerId}/actions/${action}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${HETZNER_API_TOKEN}`, 'Content-Type': 'application/json' },
    });
    if (!res.ok) throw new Error(`Hetzner API ${res.status}`);
    return true;
  } catch (e) {
    console.error(`Hetzner Error: ${e.message}`);
    return false;
  }
};

const sendRconCommand = async (server, command) => {
  if (!server.subdomain || !server.rcon_password) return false;
  try {
    const wrapperUrl = `http://${server.subdomain}.spawnly.net:3006/api/command`;
    const res = await fetch(wrapperUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${server.rcon_password}` },
      body: JSON.stringify({ command })
    });
    return res.ok;
  } catch (e) { return false; }
};

export default async function handler(req, res) {
  const authHeader = req.headers.authorization;
  const cronHeader = req.headers['x-cron-secret'];
  const isValid = (cronHeader === CRON_SECRET) || (authHeader === `Bearer ${CRON_SECRET}`);
  
  if (!CRON_SECRET || !isValid) return res.status(401).json({ error: 'Unauthorized' });

  const now = new Date().toISOString();
  
  // Use the standard index we created
  const { data: tasks } = await supabaseAdmin
    .from('scheduled_tasks')
    .select(`*, server:servers ( id, hetzner_id, status, subdomain, rcon_password, user_id, current_session_id )`)
    .lte('next_run_at', now);

  if (!tasks?.length) return res.status(200).json({ processed: 0 });

  for (const task of tasks) {
    if (!task.server) {
      await supabaseAdmin.from('scheduled_tasks').delete().eq('id', task.id);
      continue;
    }

    const server = task.server;
    let success = false;
    let resultMsg = 'Success';

    try {
      if (task.action === 'command') {
        if (server.status === 'Running') success = await sendRconCommand(server, task.payload);
        else resultMsg = 'Skipped (Offline)';
      } 
      else if (task.action === 'start' && server.status === 'Stopped') {
         if (await hetznerDoAction(server.hetzner_id, 'poweron')) {
            await supabaseAdmin.from('servers').update({ status: 'Starting', current_session_id: uuidv4(), last_billed_at: new Date().toISOString() }).eq('id', server.id);
            success = true;
         } else resultMsg = 'API Error';
      }
      else if (task.action === 'stop' && server.status === 'Running') {
         if (await hetznerDoAction(server.hetzner_id, 'shutdown')) success = true;
         else resultMsg = 'API Error';
      }
      else if (task.action === 'restart' && server.status === 'Running') {
         if (await hetznerDoAction(server.hetzner_id, 'reboot')) {
            await supabaseAdmin.from('servers').update({ status: 'Restarting' }).eq('id', server.id);
            success = true;
         } else resultMsg = 'API Error';
      } else {
         resultMsg = 'Skipped (State)';
      }
    } catch (err) {
      resultMsg = 'Failed';
    }

    if (task.is_repeat && task.repeat_interval_minutes > 0) {
      const nextDate = new Date();
      nextDate.setMinutes(nextDate.getMinutes() + task.repeat_interval_minutes);
      
      await supabaseAdmin.from('scheduled_tasks').update({
        last_run_at: now,
        next_run_at: nextDate.toISOString(),
        last_result: success ? 'Success' : resultMsg
      }).eq('id', task.id);
    } else {
      await supabaseAdmin.from('scheduled_tasks').delete().eq('id', task.id);
    }
  }

  return res.status(200).json({ success: true });
}