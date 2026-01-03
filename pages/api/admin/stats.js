import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Hetzner Prices (Hourly, Excl VAT)
const HETZNER_PRICING = {
  'cx23': 0.0056, 'cx33': 0.0088, 'cx43': 0.0152, 'cx53': 0.0280,
  'cpx11': 0.0071, 'cpx21': 0.0135, 'cpx31': 0.0275, 'cpx41': 0.0534, 'cpx51': 0.1068,
  'ccx13': 0.0298, 'ccx23': 0.0595, 'ccx33': 0.1190,
};

export default async function handler(req, res) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'No token' });
  const token = authHeader.split(' ')[1];
  
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !user) return res.status(401).json({ error: 'Invalid token' });

  const { data: profile } = await supabaseAdmin
    .from('profiles').select('is_admin').eq('id', user.id).single();

  if (!profile?.is_admin) return res.status(403).json({ error: 'Forbidden' });

  try {
    const [
      { count: userCount }, 
      { count: serverCount },
      { data: runningServers }, 
      { data: creditStats },
      { data: recentServers }
    ] = await Promise.all([
      supabaseAdmin.from('profiles').select('*', { count: 'exact', head: true }),
      supabaseAdmin.from('servers').select('*', { count: 'exact', head: true }),
      supabaseAdmin.from('servers').select('ram, player_count, type, hetzner_id').eq('status', 'Running'),
      supabaseAdmin.from('profiles').select('credits'),
      supabaseAdmin.from('servers').select('name, created_at, type, user_id').order('created_at', { ascending: false }).limit(8)
    ]);

    // Metrics
    const totalPlayers = runningServers.reduce((acc, s) => acc + (s.player_count || 0), 0);
    const totalRunningRam = runningServers.reduce((acc, s) => acc + (s.ram || 0), 0);
    const revenuePerHour = totalRunningRam * 1 * 0.01; 

    // Cost Calculation
    let hetznerCostPerHour = 0;
    try {
      const hRes = await fetch('https://api.hetzner.cloud/v1/servers', {
        headers: { 'Authorization': `Bearer ${process.env.HETZNER_API_TOKEN}` }
      });
      if (hRes.ok) {
        const hData = await hRes.json();
        hetznerCostPerHour = hData.servers.reduce((acc, s) => {
          const type = s.server_type.name.toLowerCase();
          const price = HETZNER_PRICING[type] || 0.01;
          return acc + price;
        }, 0);
      }
    } catch (e) {
      console.error('Hetzner Sync Error:', e.message);
    }

    // Distribution Logic
    const distribution = { Vanilla: 0, Modpack: 0, Proxy: 0, Hybrid: 0 };
    runningServers.forEach(s => {
      const t = s.type.toLowerCase();
      if (t.includes('modpack')) distribution.Modpack++;
      else if (['velocity', 'bungeecord', 'waterfall'].includes(t)) distribution.Proxy++;
      else if (['arclight', 'mohist', 'magma'].includes(t)) distribution.Hybrid++;
      else distribution.Vanilla++;
    });

    // Financial History (24h)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: usageData } = await supabaseAdmin
      .from('credit_transactions')
      .select('amount, created_at')
      .lt('amount', 0)
      .gte('created_at', oneDayAgo)
      .order('created_at', { ascending: true });

    res.status(200).json({
      overview: {
        users: userCount,
        servers: serverCount,
        active_nodes: runningServers.length,
        active_ram: totalRunningRam,
        active_players: totalPlayers,
        liability: creditStats.reduce((acc, c) => acc + (c.credits || 0), 0)
      },
      distribution,
      activity: recentServers.map(s => ({ ...s, time: s.created_at })),
      economics: {
        revenue_hr: revenuePerHour,
        cost_hr: hetznerCostPerHour,
        profit_hr: revenuePerHour - hetznerCostPerHour,
        chart: usageData.map(t => ({ time: t.created_at, value: Math.abs(t.amount) }))
      }
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server Error' });
  }
}