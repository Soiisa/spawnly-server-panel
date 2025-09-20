// pages/api/servers/update-status.js

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { serverId, status } = req.body;

    console.log('Received status update:', { serverId, status });

    if (!serverId) {
      return res.status(400).json({ error: 'Missing serverId' });
    }

    // Only update the status and timestamp
    const { data, error: updateError } = await supabaseAdmin
      .from('servers')
      .update({
        status: status || 'Unknown'
      })
      .eq('id', serverId)
      .select();

    if (updateError) {
      console.error('Supabase update error:', updateError);
      return res.status(500).json({ 
        error: 'Failed to update server status',
        details: updateError.message 
      });
    }

    console.log('Successfully updated server status:', data[0]?.status);

    return res.status(200).json({ 
      success: true, 
      status: data[0]?.status 
    });

  } catch (error) {
    console.error('Status update API error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      details: error.message 
    });
  }
}