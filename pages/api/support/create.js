import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // 1. Authenticate User
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Missing auth token' });
  const token = authHeader.split(' ')[1];
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

  if (authError || !user) return res.status(401).json({ error: 'Unauthorized' });

  const { subject, category, message, serverId, priority = 'Medium' } = req.body;

  if (!subject || !message || !category) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    // 2. Create Ticket
    const { data: ticket, error: ticketError } = await supabaseAdmin
      .from('support_tickets')
      .insert({
        user_id: user.id,
        server_id: serverId || null,
        subject,
        category,
        priority,
        status: 'Open'
      })
      .select()
      .single();

    if (ticketError) throw ticketError;

    // 3. Create Initial Message
    const { error: msgError } = await supabaseAdmin
      .from('support_messages')
      .insert({
        ticket_id: ticket.id,
        user_id: user.id,
        message,
        is_staff_reply: false
      });

    if (msgError) throw msgError;

    return res.status(200).json({ success: true, ticketId: ticket.id });
  } catch (err) {
    console.error('Create Ticket Error:', err);
    return res.status(500).json({ error: err.message });
  }
}