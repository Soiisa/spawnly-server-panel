// pages/api/admin/invoices/pending.js
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // 1. Verify Admin Status
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Missing token' });

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return res.status(401).json({ error: 'Invalid token' });

  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single();
  if (!profile?.is_admin) return res.status(403).json({ error: 'Unauthorized' });

  // 2. Fetch all successful deposits that haven't been invoiced
  const { data: txs, error } = await supabase
    .from('credit_transactions')
    .select('*')
    .eq('type', 'deposit')
    .eq('invoiced', false)
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });

  // 3. Fetch emails for the unique users to display in the UI
  const uniqueUserIds = [...new Set(txs.map(tx => tx.user_id))];
  const emailMap = {};
  
  for (const uid of uniqueUserIds) {
    const { data } = await supabase.auth.admin.getUserById(uid);
    if (data?.user) emailMap[uid] = data.user.email;
  }

  // 4. Map the email back to the transaction
  const enrichedTxs = txs.map(tx => ({
    ...tx,
    user_email: emailMap[tx.user_id] || 'Unknown Email'
  }));

  res.status(200).json(enrichedTxs);
}