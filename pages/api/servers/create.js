// pages/api/servers/create.js

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Sanitize subdomain to be DNS-friendly
const sanitizeSubdomain = (name) => {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-') // Replace invalid chars with hyphens
    .replace(/-+/g, '-') // Collapse multiple hyphens
    .replace(/^-|-$/g, '') // Trim leading/trailing hyphens
    .slice(0, 63); // Ensure max length
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'Missing Supabase server env vars' });
  }

  const { name, game = 'minecraft', software = 'paper', version = null, ram = 4, costPerHour = 0, userId, subdomain } = req.body;
  if (!name || !userId) return res.status(400).json({ error: 'Missing required fields: name, userId' });

  // Use provided subdomain or derive from name
  const finalSubdomain = subdomain ? sanitizeSubdomain(subdomain) : sanitizeSubdomain(name);

  // Validate subdomain
  if (!finalSubdomain || finalSubdomain.length < 1 || finalSubdomain.length > 63) {
    return res.status(400).json({ error: 'Invalid subdomain', detail: 'Subdomain must be 1-63 chars, alphanumeric with hyphens' });
  }

  try {
    // Check for subdomain conflict
    const { data: existing, error: checkErr } = await supabaseAdmin
      .from('servers')
      .select('id')
      .eq('subdomain', finalSubdomain)
      .single();

    if (existing) {
      return res.status(400).json({ error: 'Subdomain already taken', detail: `Subdomain ${finalSubdomain} is already in use` });
    }

    const insertPayload = {
      user_id: userId,
      name,
      game,
      type: software,
      version,
      ram,
      status: 'Stopped',
      cost_per_hour: costPerHour,
      hetzner_id: null,
      ipv4: null,
      subdomain: finalSubdomain,
    };

    const { data, error } = await supabaseAdmin
      .from('servers')
      .insert([insertPayload])
      .select()
      .single();

    if (error) {
      console.error('Supabase insert error:', error);
      return res.status(500).json({ error: 'Failed to insert server into Supabase', detail: error.message });
    }

    return res.status(200).json({ server: data });
  } catch (err) {
    console.error('create handler error:', err);
    return res.status(500).json({ error: 'Internal server error', detail: err.message });
  }
}