// pages/api/servers/[serverId]/metrics.js
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req, res) {
  const { serverId } = req.query; // This is the Supabase UUID
  if (!serverId) {
    return res.status(400).json({ error: "Missing serverId" });
  }

  const token = process.env.HETZNER_API_TOKEN;
  if (!token) {
    return res.status(500).json({ error: "Hetzner API token not set" });
  }

  // --- SECURITY FIX: Auth & Ownership Check ---
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const userToken = authHeader.split(' ')[1];
  const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(userToken);
  
  if (authErr || !user) {
      return res.status(401).json({ error: 'Unauthorized' });
  }

  // Fetch the REAL Hetzner ID from DB to prevent Proxy Injection
  const { data: server, error: dbErr } = await supabaseAdmin
    .from('servers')
    .select('hetzner_id, user_id')
    .eq('id', serverId)
    .single();

  if (dbErr || !server) {
      return res.status(404).json({ error: 'Server not found' });
  }
  
  if (server.user_id !== user.id) {
      return res.status(403).json({ error: 'Forbidden: You do not own this server' });
  }

  if (!server.hetzner_id) {
      return res.status(400).json({ error: 'Server not provisioned' });
  }

  // Use the trusted hetzner_id from the database
  const hetznerId = server.hetzner_id;
  // ---------------------------------------------

  try {
    // Time window: last 5 minutes
    const end = new Date();
    const start = new Date(end.getTime() - 5 * 60 * 1000);

    const params = new URLSearchParams({
      type: "cpu,memory", // request both
      start: start.toISOString(),
      end: end.toISOString(),
      step: "60",
    });

    // Safe URL construction using verified ID
    const url = `https://api.hetzner.cloud/v1/servers/${hetznerId}/metrics?${params}`;
    
    const r = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!r.ok) {
      const txt = await r.text();
      // Don't leak upstream errors blindly
      console.error('Hetzner API Error:', r.status, txt);
      return res.status(502).json({ error: "Upstream API error" });
    }

    const data = await r.json();

    // Extract the most recent values
    const cpuSeries = data.metrics.time_series.cpu || [];
    const memSeries = data.metrics.time_series.memory || [];

    const latestCpu = cpuSeries.length ? cpuSeries[cpuSeries.length - 1] : null;
    const latestMem = memSeries.length ? memSeries[memSeries.length - 1] : null;

    res.status(200).json({
      serverId,
      cpu: latestCpu ? { percent: Number(latestCpu.value) } : null,
      mem: latestMem
        ? { usedPct: Number(latestMem.value) }
        : null,
      raw: data.metrics.time_series, // keep full series for charts
    });
  } catch (err) {
    console.error("Hetzner metrics error:", err);
    res.status(500).json({ error: "Failed to fetch metrics" });
  }
}