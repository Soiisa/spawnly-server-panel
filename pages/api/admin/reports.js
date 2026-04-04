// pages/api/admin/reports.js
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  // 1. Authenticate Admin Request
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const token = authHeader.substring(7);
  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !user) return res.status(401).json({ error: 'Unauthorized' });

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single();

  if (!profile?.is_admin) return res.status(403).json({ error: 'Forbidden' });

  // 2. Define Time Range
  const { period = 'daily' } = req.query;
  const now = new Date();
  let startDate = new Date();
  
  if (period === 'daily') startDate.setDate(now.getDate() - 1);
  else if (period === 'weekly') startDate.setDate(now.getDate() - 7);
  else if (period === 'monthly') startDate.setMonth(now.getMonth() - 1);
  else startDate.setDate(now.getDate() - 1);

  const startDateIso = startDate.toISOString();

  try {
    // 3. Aggregate New Users
    const { count: newUsersCount } = await supabaseAdmin
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', startDateIso);

    // 4. Aggregate New Servers
    const { count: newServersCount } = await supabaseAdmin
      .from('servers')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', startDateIso);

    // 5. Aggregate Revenue (Deposits are positive amounts)
    const { data: deposits } = await supabaseAdmin
      .from('credit_transactions')
      .select('amount')
      .gte('created_at', startDateIso)
      .gt('amount', 0); 

    const totalRevenueCredits = deposits?.reduce((sum, tx) => sum + tx.amount, 0) || 0;

    // 6. Aggregate Total Runtime (Parse seconds from usage transaction descriptions)
    const { data: usages } = await supabaseAdmin
      .from('credit_transactions')
      .select('description')
      .gte('created_at', startDateIso)
      .eq('type', 'usage');

    const { data: poolUsages } = await supabaseAdmin
      .from('pool_transactions')
      .select('description')
      .gte('created_at', startDateIso)
      .eq('type', 'usage');

    let totalSeconds = 0;
    const parseSeconds = (desc) => {
      if (!desc) return 0;
      const match = desc.match(/\((\d+)\s*seconds\)/);
      return match ? parseInt(match[1], 10) : 0;
    };

    usages?.forEach(tx => { totalSeconds += parseSeconds(tx.description); });
    poolUsages?.forEach(tx => { totalSeconds += parseSeconds(tx.description); });

    // Return the response payload
    res.status(200).json({
      period,
      newUsers: newUsersCount || 0,
      newServers: newServersCount || 0,
      revenueCredits: totalRevenueCredits,
      totalRuntimeSeconds: totalSeconds,
    });
    
  } catch (err) {
    console.error('Reports generation error:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}