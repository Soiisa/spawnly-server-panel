// pages/api/support/reply.js
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

  // 2. Parse Request
  const { ticketId, message, isAdminAction, statusOverride, attachments } = req.body;

  // Validate: Must have ticketId AND (message OR status change OR attachments)
  if (!ticketId || (!message && statusOverride !== 'Closed' && (!attachments || attachments.length === 0))) {
      return res.status(400).json({ error: 'Missing fields' });
  }

  try {
    // 3. Admin Check
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single();
    
    const isActuallyAdmin = profile && profile.is_admin === true;
    const isStaffReply = isAdminAction && isActuallyAdmin;

    // 4. Permission Check
    if (!isStaffReply) {
        const { data: ticket } = await supabaseAdmin
            .from('support_tickets')
            .select('user_id')
            .eq('id', ticketId)
            .single();
        
        if (!ticket || ticket.user_id !== user.id) {
            return res.status(403).json({ error: 'Forbidden' });
        }
    }

    // 5. Insert Message
    // Only insert if there is actual content (text or files)
    if (message || (attachments && attachments.length > 0)) {
        const { error: msgError } = await supabaseAdmin
        .from('support_messages')
        .insert({
            ticket_id: ticketId,
            user_id: user.id,
            message: message || '', // Allow empty text if sending file
            attachments: attachments || [], 
            is_staff_reply: isStaffReply
        });
        if (msgError) throw msgError;
    }

    // 6. Update Ticket Status
    let newStatus = isStaffReply ? 'Ongoing' : 'Open';
    
    if (statusOverride) {
        if (isStaffReply) {
            newStatus = statusOverride;
        } else if (statusOverride === 'Closed') {
            newStatus = 'Closed';
        }
    } else if (!isStaffReply) {
        newStatus = 'Open';
    }

    const updatePayload = { updated_at: new Date().toISOString() };
    
    // Only update status if explicitly changed or valid default logic applies
    if (statusOverride || isStaffReply || (!isStaffReply && !statusOverride)) {
        updatePayload.status = newStatus;
    }

    await supabaseAdmin
      .from('support_tickets')
      .update(updatePayload)
      .eq('id', ticketId);

    return res.status(200).json({ success: true });

  } catch (err) {
    console.error('Reply Error:', err);
    return res.status(500).json({ error: err.message });
  }
}