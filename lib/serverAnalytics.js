// lib/serverAnalytics.js
//
// Server-side counterpart to lib/analytics.js. Used inside API routes to log
// the things the browser can't see honestly — why a provision was refused,
// which Hetzner call blew up, how long an install took.
//
// Fire-and-forget by design: analytics must never fail a user request.

import { createClient } from '@supabase/supabase-js';
import { EVENTS, ALLOWED_EVENTS } from './analyticsEvents';

export { EVENTS };

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

let client = null;
const getClient = () => {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return null;
  if (!client) client = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  return client;
};

const flatten = (props) => {
  if (!props || typeof props !== 'object') return {};
  const out = {};
  for (const [k, v] of Object.entries(props)) {
    if (v === null || v === undefined) continue;
    if (typeof v === 'string') out[k] = v.slice(0, 300);
    else if (typeof v === 'number' || typeof v === 'boolean') out[k] = v;
  }
  return out;
};

/**
 * Log a product event from an API route.
 * @param {string} event one of EVENTS
 * @param {object} opts
 * @param {string} [opts.userId]
 * @param {object} [opts.props]
 * @param {string} [opts.path]
 */
export async function logEvent(event, { userId = null, props = {}, path = null } = {}) {
  try {
    if (!ALLOWED_EVENTS.has(event)) {
      console.warn('[analytics] unknown server event ignored:', event);
      return;
    }
    const supabase = getClient();
    if (!supabase) return;

    await supabase.from('analytics_events').insert({
      event,
      user_id: userId || null,
      props: flatten(props),
      path,
      source: 'server',
    });
  } catch (e) {
    console.error('[analytics] server log failed:', e.message);
  }
}

/** Non-awaited helper for hot paths where even the insert latency matters. */
export function logEventAsync(event, opts) {
  logEvent(event, opts).catch(() => {});
}
