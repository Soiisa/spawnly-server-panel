import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  // --- 1. Security Check ---
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'No token' });
  const token = authHeader.split(' ')[1];
  
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !user) return res.status(401).json({ error: 'Invalid token' });

  // Verify Admin Status
  const { data: adminProfile } = await supabaseAdmin
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single();

  if (!adminProfile?.is_admin) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  // --- 2. GET: List Users ---
  if (req.method === 'GET') {
    try {
      const { search } = req.query;

      // Fetch all Auth Users (to get emails)
      const { data: { users: authUsers }, error: authListError } = await supabaseAdmin.auth.admin.listUsers();
      if (authListError) throw authListError;

      // Fetch all Profiles (to get credits/banned status)
      const { data: profiles, error: profileError } = await supabaseAdmin
        .from('profiles')
        .select('id, credits, is_admin, banned');
      if (profileError) throw profileError;

      // Merge Data
      let combined = authUsers.map(u => {
        const p = profiles.find(prof => prof.id === u.id) || {};
        return {
          id: u.id,
          email: u.email,
          last_sign_in: u.last_sign_in_at,
          created_at: u.created_at,
          credits: p.credits || 0,
          is_admin: !!p.is_admin,
          banned: !!p.banned
        };
      });

      // Filter (Search)
      if (search) {
        const lowerSearch = search.toLowerCase();
        combined = combined.filter(u => 
          u.email?.toLowerCase().includes(lowerSearch) || 
          u.id.includes(lowerSearch)
        );
      }

      // Sort (Newest first)
      combined.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

      return res.status(200).json({ users: combined });

    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'Failed to fetch users' });
    }
  }

  // --- 3. POST: Actions (Gift / Ban) ---
  if (req.method === 'POST') {
    const { action, userId, amount } = req.body;

    if (!userId) return res.status(400).json({ error: 'Missing userId' });

    try {
      if (action === 'gift') {
        // Fetch current credits
        const { data: profile } = await supabaseAdmin.from('profiles').select('credits').eq('id', userId).single();
        const current = profile?.credits || 0;
        const newAmount = current + Number(amount);

        // Update Profile
        await supabaseAdmin.from('profiles').update({ credits: newAmount }).eq('id', userId);

        // Log Transaction
        await supabaseAdmin.from('credit_transactions').insert({
          user_id: userId,
          amount: Number(amount),
          type: 'gift',
          description: `Admin Gift by ${user.email}`,
          created_at: new Date().toISOString()
        });

        return res.status(200).json({ success: true, newAmount });
      }

      if (action === 'toggle_ban') {
        // Get current status
        const { data: profile } = await supabaseAdmin.from('profiles').select('banned').eq('id', userId).single();
        const newStatus = !profile.banned;

        // Update DB
        await supabaseAdmin.from('profiles').update({ banned: newStatus }).eq('id', userId);

        // Optional: Force logout user by modifying auth user metadata (if strictly needed)
        // await supabaseAdmin.auth.admin.updateUserById(userId, { user_metadata: { banned: newStatus } });

        return res.status(200).json({ success: true, banned: newStatus });
      }

      return res.status(400).json({ error: 'Invalid action' });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'Action failed' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}