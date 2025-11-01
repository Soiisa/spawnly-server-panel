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
  const { serverId, status, timestamp, cpu, memory, disk } = req.body;

    console.log('Received status update:', { serverId, status, timestamp });

    if (!serverId) return res.status(400).json({ error: 'Missing serverId' });

    const now = timestamp ? new Date(timestamp) : new Date();

    // Fetch current server row
    const { data: server, error: fetchErr } = await supabaseAdmin
      .from('servers')
      .select('*')
      .eq('id', serverId)
      .single();

    if (fetchErr || !server) {
      console.error('Failed to fetch server for status update:', fetchErr);
      return res.status(404).json({ error: 'Server not found' });
    }

    const updates = {
      status: status || 'Unknown',
      last_heartbeat_at: now.toISOString()
    };

    // Accept optional metric fields and store them for realtime clients
    if (cpu !== undefined) updates.cpu = cpu;
    if (memory !== undefined) updates.memory = memory;
    if (disk !== undefined) updates.disk = disk;

    // When server becomes Running, set running_since if not already set and ensure last_billed_at is initialized
    if (status === 'Running') {
      if (!server.running_since) {
        updates.running_since = now.toISOString();
        // If there's no last_billed_at, initialize it so billing can start from this point
        if (!server.last_billed_at) updates.last_billed_at = now.toISOString();
        // Reset runtime_accumulated_seconds if absent
        if (server.runtime_accumulated_seconds == null) updates.runtime_accumulated_seconds = 0;
      }
    } else {
      // When server stops or errors, accumulate runtime and clear running_since
      if (server.running_since) {
        try {
          const runningSince = new Date(server.running_since);
          const deltaSeconds = Math.max(0, Math.floor((now - runningSince) / 1000));
          updates.runtime_accumulated_seconds = (server.runtime_accumulated_seconds || 0) + deltaSeconds;
        } catch (e) {
          // fallback: don't change accumulated seconds on parse error
          console.error('Error parsing running_since for accumulation:', e && e.message);
        }
        updates.running_since = null;
      }
    }

    const { data, error: updateError } = await supabaseAdmin
      .from('servers')
      .update(updates)
      .eq('id', serverId)
      .select();

    if (updateError) {
      console.error('Supabase update error:', updateError);
      return res.status(500).json({ error: 'Failed to update server status', details: updateError.message });
    }

    console.log('Successfully updated server status:', data[0]?.status);

    return res.status(200).json({ success: true, status: data[0]?.status });

  } catch (error) {
    console.error('Status update API error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      details: error.message 
    });
  }
}