import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req, res) {
  // 1. Setup & Key Check
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    console.error('ERROR: SUPABASE_SERVICE_ROLE_KEY is missing in .env.local');
    return res.status(500).json({ error: 'Server configuration error: Missing Service Key' });
  }

  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  // 2. Authenticate Admin
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    console.error('Admin API: Missing auth token');
    return res.status(401).json({ error: 'Missing auth token' });
  }
  
  const token = authHeader.split(' ')[1];
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

  if (authError || !user) {
    console.error('Admin API: Auth failed', authError);
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // 3. Fetch Tickets
    const { status } = req.query;
    console.log(`Admin API: Fetching tickets with status filter: ${status}`);

    let query = supabaseAdmin
        .from('support_tickets')
        .select('*')
        .order('updated_at', { ascending: false });

    if (status && status !== 'All') {
        if (status === 'Open') query = query.in('status', ['Open', 'Customer Reply']);
        else query = query.eq('status', status);
    }

    const { data: tickets, error: dbError } = await query;

    if (dbError) {
        console.error('Admin API: DB Error', dbError);
        throw dbError;
    }

    console.log(`Admin API: Found ${tickets?.length || 0} tickets`);

    // 4. Enrich with User Emails
    if (!tickets || tickets.length === 0) return res.status(200).json([]);

    const userIds = [...new Set(tickets.map(t => t.user_id))];
    const userMap = {};

    await Promise.all(userIds.map(async (uid) => {
        const { data: u, error: uErr } = await supabaseAdmin.auth.admin.getUserById(uid);
        if (u?.user) {
            userMap[uid] = u.user.email;
        } else {
            console.warn(`Admin API: Could not fetch user ${uid}`, uErr);
        }
    }));

    const enrichedTickets = tickets.map(t => ({
        ...t,
        user_email: userMap[t.user_id] || 'Unknown User'
    }));

    return res.status(200).json(enrichedTickets);

  } catch (err) {
    console.error('Admin API: Fatal Error', err);
    return res.status(500).json({ error: err.message });
  }
}