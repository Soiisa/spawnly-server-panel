// pages/api/analytics/track.js
//
// Ingest endpoint for browser-emitted product events. Deliberately strict:
// unknown event names, oversized batches and oversized payloads are dropped
// rather than stored, so a stray fetch loop can't fill the table.

import { createClient } from '@supabase/supabase-js';
import { ALLOWED_EVENTS } from '../../../lib/analyticsEvents';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const MAX_EVENTS_PER_REQUEST = 20;
const MAX_PROPS_BYTES = 4000;
const MAX_STR = 500;

const str = (v, max = MAX_STR) =>
  typeof v === 'string' && v.length ? v.slice(0, max) : null;

const deviceFromUa = (ua = '') => {
  if (/iPad|Tablet/i.test(ua)) return 'tablet';
  if (/Mobi|Android|iPhone/i.test(ua)) return 'mobile';
  return 'desktop';
};

// Drop anything that looks like free-text PII and cap the payload size.
const sanitizeProps = (props) => {
  if (!props || typeof props !== 'object' || Array.isArray(props)) return {};
  const out = {};
  for (const [key, value] of Object.entries(props)) {
    if (value === null || value === undefined) continue;
    if (typeof value === 'string') out[key] = value.slice(0, 300);
    else if (typeof value === 'number' || typeof value === 'boolean') out[key] = value;
    // Objects/arrays are intentionally skipped — keeps props flat and queryable.
  }
  const encoded = JSON.stringify(out);
  return encoded.length > MAX_PROPS_BYTES ? { _truncated: true } : out;
};

// Next warns when a handler returns a value, so every exit is `end(); return;`.
const noContent = (res) => { res.status(204).end(); };

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    // Never surface a config error to the browser for analytics.
    noContent(res);
    return;
  }

  let payload = req.body;
  // sendBeacon posts a Blob; depending on the content type Next may hand it
  // over unparsed.
  if (typeof payload === 'string') {
    try { payload = JSON.parse(payload); } catch (e) { noContent(res); return; }
  }

  const events = Array.isArray(payload?.events) ? payload.events : [];
  if (!events.length) { noContent(res); return; }

  // Resolve the user from the token, never from the request body.
  let userId = null;
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    try {
      const { data } = await supabaseAdmin.auth.getUser(authHeader.split(' ')[1]);
      userId = data?.user?.id || null;
    } catch (e) {}
  }

  const ua = req.headers['user-agent'] || '';
  const country =
    req.headers['cf-ipcountry'] ||
    req.headers['x-vercel-ip-country'] ||
    null;

  const rows = events
    .slice(0, MAX_EVENTS_PER_REQUEST)
    .filter((e) => e && ALLOWED_EVENTS.has(e.event))
    .map((e) => ({
      created_at: str(e.ts, 40) || new Date().toISOString(),
      event: e.event,
      user_id: userId,
      anon_id: str(e.anon_id, 64),
      session_id: str(e.session_id, 64),
      path: str(e.path, 200),
      referrer: str(e.referrer),
      utm_source: str(e.utm_source, 100),
      utm_medium: str(e.utm_medium, 100),
      utm_campaign: str(e.utm_campaign, 100),
      props: sanitizeProps(e.props),
      source: 'client',
      device: deviceFromUa(ua),
      country: str(country, 8),
      locale: str(e.locale, 10),
    }));

  if (!rows.length) { noContent(res); return; }

  const { error } = await supabaseAdmin.from('analytics_events').insert(rows);
  if (error) console.error('[analytics] insert failed:', error.message);

  noContent(res);
}
