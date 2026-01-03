// pages/api/support/reply.js
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Define Admin Emails - Update this list with your actual admin email addresses
const ADMIN_EMAILS = ['admin@spawnly.net', 'support@spawnly.net', 'your-email@example.com']; 

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // 1. Authenticate User
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Missing auth token' });
  const token = authHeader.split(' ')[1];
  
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

  if (authError || !user) return res.status(401).json({ error: 'Unauthorized' });

  // 2. Parse Request
  const { ticketId, message, isAdminAction, statusOverride } = req.body;

  if (!ticketId || !message) return res.status(400).json({ error: 'Missing fields' });

  try {
    // 3. Determine if this is a Staff Reply
    // We strictly check the user's email against our admin list to prevent spoofing
    const isActuallyAdmin = ADMIN_EMAILS.includes(user.email);
    const isStaffReply = isAdminAction && isActuallyAdmin;

    // 4. Permission Check: If not staff, verify the user owns this ticket
    if (!isStaffReply) {
        const { data: ticket } = await supabaseAdmin
            .from('support_tickets')
            .select('user_id')
            .eq('id', ticketId)
            .single();
        
        if (!ticket || ticket.user_id !== user.id) {
            return res.status(403).json({ error: 'Forbidden: You do not own this ticket' });
        }
    }

    // 5. Insert the Message
    const { error: msgError } = await supabaseAdmin
      .from('support_messages')
      .insert({
        ticket_id: ticketId,
        user_id: user.id,
        message,
        is_staff_reply: isStaffReply
      });

    if (msgError) throw msgError;

    // 6. Determine the New Status
    // Default logic: Admin reply -> 'Answered', User reply -> 'Customer Reply'
    let newStatus = isStaffReply ? 'Answered' : 'Customer Reply';
    
    // Override logic: If an admin specifically requested a status change (e.g. "Closed")
    if (isStaffReply && statusOverride) {
        newStatus = statusOverride;
    }

    // 7. Update the Ticket
    await supabaseAdmin
      .from('support_tickets')
      .update({ 
        status: newStatus,
        updated_at: new Date().toISOString()
      })
      .eq('id', ticketId);

    return res.status(200).json({ success: true });

  } catch (err) {
    console.error('Reply Error:', err);
    return res.status(500).json({ error: err.message });
  }
}