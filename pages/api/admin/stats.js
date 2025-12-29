import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// approximate hourly cost in Euros (excl. VAT)
const HETZNER_PRICING = {
  'cx23': 0.0056,
  'cx33': 0.0088,
  'cx43': 0.0152,
  'cx53': 0.0280,
  'cpx11': 0.0071,
  'cpx21': 0.0135,
  'cpx31': 0.0275,
  'cpx41': 0.0534,
  'cpx51': 0.1068,
  'ccx13': 0.0298,
  'ccx23': 0.0595,
  'ccx33': 0.1190,
  // Add other types if you use them
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
      // UPDATED: Fetch player_count alongside ram
      { data: runningServers }, 
      { data: creditStats }
    ] = await Promise.all([
      supabaseAdmin.from('profiles').select('*', { count: 'exact', head: true }),
      supabaseAdmin.from('servers').select('*', { count: 'exact', head: true }),
      supabaseAdmin.from('servers').select('ram, player_count').eq('status', 'Running'),
      supabaseAdmin.from('profiles').select('credits')
    ]);

    // --- NEW: Calculate Total Players ---
    const totalPlayers = runningServers.reduce((acc, s) => acc + (s.player_count || 0), 0);
    // ------------------------------------

    // Calculate Revenue
    const totalRunningRam = runningServers.reduce((acc, s) => acc + (s.ram || 0), 0);
    const revenuePerHour = totalRunningRam * 1 * 0.01; 

    // Calculate Cost
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
      console.error('Hetzner API Error:', e);
    }

    const profitPerHour = revenuePerHour - hetznerCostPerHour;
    const totalLiability = creditStats.reduce((acc, curr) => acc + (curr.credits || 0), 0);
    
    // Financial History
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: usageData } = await supabaseAdmin
      .from('credit_transactions')
      .select('amount, created_at')
      .lt('amount', 0)
      .gte('created_at', oneDayAgo)
      .order('created_at', { ascending: true });
    
    const revenue24h = usageData.reduce((acc, curr) => acc + Math.abs(curr.amount), 0);

    res.status(200).json({
      users: userCount,
      servers: {
        total: serverCount,
        active: runningServers.length,
      },
      // --- NEW FIELD ---
      players: totalPlayers, 
      // ----------------
      financials: {
        liability: totalLiability,
        revenue24h: revenue24h,
      },
      profit: {
        revenuePerHour,
        costPerHour: hetznerCostPerHour,
        profitPerHour
      },
      chartData: usageData.map(t => ({
        time: t.created_at,
        amount: Math.abs(t.amount)
      }))
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch admin stats' });
  }
}