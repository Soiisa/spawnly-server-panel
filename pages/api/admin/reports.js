// pages/api/admin/reports.js
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'No token provided' });
  const token = authHeader.split(' ')[1];
  
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !user) return res.status(401).json({ error: 'Invalid token' });

  const { data: profile } = await supabaseAdmin
    .from('profiles').select('is_admin').eq('id', user.id).single();

  if (!profile?.is_admin) return res.status(403).json({ error: 'Forbidden' });

  const { period = 'daily' } = req.query;
  
  // Calculate Date Threshold
  const now = new Date();
  let threshold = new Date();
  if (period === 'daily') threshold.setDate(now.getDate() - 1);
  else if (period === 'weekly') threshold.setDate(now.getDate() - 7);
  else if (period === 'monthly') threshold.setMonth(now.getMonth() - 1);
  
  const thresholdIso = threshold.toISOString();

  try {
    // 1. New Users
    const { count: newUsers } = await supabaseAdmin
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', thresholdIso);

    // 2. New Servers
    const { count: newServers } = await supabaseAdmin
        .from('servers')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', thresholdIso);

    // 3. Revenue (Parse exact Euros from the description to ignore bonuses)
    const { data: deposits } = await supabaseAdmin
        .from('credit_transactions')
        .select('description')
        .eq('type', 'deposit')
        .gte('created_at', thresholdIso);

    let totalRevenueEuros = 0;
    if (deposits) {
        deposits.forEach(tx => {
            // Extracts the number after the € symbol. 
            // Example match: "Stripe Deposit: €50.00 (+1000 Bonus)" -> "50.00"
            const match = tx.description?.match(/€([\d.]+)/);
            if (match && match[1]) {
                totalRevenueEuros += parseFloat(match[1]);
            }
        });
    }

    // 4. Total Runtime (Extracted from usage transaction descriptions)
    const { data: personalUsage } = await supabaseAdmin
        .from('credit_transactions')
        .select('description')
        .eq('type', 'usage')
        .gte('created_at', thresholdIso);

    const { data: poolUsage } = await supabaseAdmin
        .from('pool_transactions')
        .select('description')
        .eq('type', 'usage')
        .gte('created_at', thresholdIso);

    let totalSeconds = 0;
    const parseSeconds = (desc) => {
        if (!desc) return 0;
        const match = desc.match(/\((\d+)\s*seconds\)/);
        return match ? parseInt(match[1], 10) : 0;
    };

    personalUsage?.forEach(tx => totalSeconds += parseSeconds(tx.description));
    poolUsage?.forEach(tx => totalSeconds += parseSeconds(tx.description));

    res.status(200).json({
      newUsers: newUsers || 0,
      newServers: newServers || 0,
      revenue: totalRevenueEuros,
      totalRuntimeSeconds: totalSeconds,
      period
    });

  } catch (err) {
    console.error("Report Generation Error:", err);
    res.status(500).json({ error: 'Failed to generate report' });
  }
}