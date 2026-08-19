// lib/analytics.js
//
// Tiny first-party event tracker. No third-party scripts, no third-party
// cookies — events go to /api/analytics/track and land in Supabase.
//
// Identity model (deliberately conservative for GDPR):
//   - Before the visitor accepts cookies, anon_id lives in sessionStorage, so
//     it dies with the tab and is not a persistent identifier.
//   - Once `cookie_consent` is set (see components/CookieBanner.js), the id is
//     promoted to localStorage so a returning visitor stitches together.
//   - Logged-in events are attributed server-side from the Supabase access
//     token, never from a client-supplied user id.

import { supabase } from './supabaseClient';
import { EVENTS } from './analyticsEvents';

export { EVENTS };

const ENDPOINT = '/api/analytics/track';
const ANON_KEY = 'spawnly_aid';
const SESSION_KEY = 'spawnly_sid';
const FLUSH_DELAY_MS = 1500;
const MAX_BATCH = 20;

let queue = [];
let flushTimer = null;
let listenersBound = false;

const isBrowser = () => typeof window !== 'undefined';

const uuid = () => {
  try {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  } catch (e) {}
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
};

const safeGet = (store, key) => {
  try { return window[store].getItem(key); } catch (e) { return null; }
};
const safeSet = (store, key, value) => {
  try { window[store].setItem(key, value); } catch (e) {}
};

const hasConsent = () => safeGet('localStorage', 'cookie_consent') === 'true';

function getAnonId() {
  if (!isBrowser()) return null;
  const persistent = hasConsent();

  // Prefer whichever store already holds an id so the id survives the moment
  // consent is granted mid-session.
  let id = safeGet('localStorage', ANON_KEY) || safeGet('sessionStorage', ANON_KEY);
  if (!id) id = uuid();

  safeSet('sessionStorage', ANON_KEY, id);
  if (persistent) safeSet('localStorage', ANON_KEY, id);
  return id;
}

function getSessionId() {
  if (!isBrowser()) return null;
  let id = safeGet('sessionStorage', SESSION_KEY);
  if (!id) {
    id = uuid();
    safeSet('sessionStorage', SESSION_KEY, id);
  }
  return id;
}

function utmFromUrl() {
  if (!isBrowser()) return {};
  try {
    const params = new URLSearchParams(window.location.search);
    return {
      utm_source: params.get('utm_source') || undefined,
      utm_medium: params.get('utm_medium') || undefined,
      utm_campaign: params.get('utm_campaign') || undefined,
    };
  } catch (e) {
    return {};
  }
}

// Referrer is only interesting when it comes from outside Spawnly; internal
// navigation would otherwise drown out the acquisition signal.
function externalReferrer() {
  if (!isBrowser()) return undefined;
  const ref = document.referrer;
  if (!ref) return undefined;
  try {
    if (new URL(ref).host === window.location.host) return undefined;
  } catch (e) {}
  return ref.slice(0, 500);
}

async function send(events, { beacon = false } = {}) {
  const body = JSON.stringify({ events });

  // Page is unloading — sendBeacon is the only transport that survives, but it
  // can't carry an Authorization header. Those events land anonymous and get
  // stitched back to the user via anon_id at query time.
  if (beacon && navigator.sendBeacon) {
    try {
      navigator.sendBeacon(ENDPOINT, new Blob([body], { type: 'application/json' }));
      return;
    } catch (e) {}
  }

  let token = null;
  try {
    const { data } = await supabase.auth.getSession();
    token = data?.session?.access_token || null;
  } catch (e) {}

  try {
    await fetch(ENDPOINT, {
      method: 'POST',
      keepalive: true,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body,
    });
  } catch (e) {
    // Analytics must never break the app or spam the console.
  }
}

function flush({ beacon = false } = {}) {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (!queue.length) return;
  const batch = queue.splice(0, MAX_BATCH);
  send(batch, { beacon });
  if (queue.length) scheduleFlush();
}

function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(() => flush(), FLUSH_DELAY_MS);
}

function bindUnloadListeners() {
  if (listenersBound || !isBrowser()) return;
  listenersBound = true;
  // pagehide fires on mobile Safari where unload/beforeunload do not.
  window.addEventListener('pagehide', () => flush({ beacon: true }));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush({ beacon: true });
  });
}

/**
 * Record a product event. Fire-and-forget: never awaited, never throws.
 * @param {string} event one of EVENTS
 * @param {object} props small, non-PII payload (reasons, ram, billing_type…)
 */
export function track(event, props = {}) {
  if (!isBrowser() || !event) return;
  bindUnloadListeners();

  queue.push({
    event,
    props: props && typeof props === 'object' ? props : {},
    ts: new Date().toISOString(),
    anon_id: getAnonId(),
    session_id: getSessionId(),
    path: window.location.pathname,
    referrer: externalReferrer(),
    locale: document.documentElement.lang || undefined,
    ...utmFromUrl(),
  });

  if (queue.length >= MAX_BATCH) flush();
  else scheduleFlush();
}

/** Convenience wrapper used by _app.js on every route change. */
export function trackPageView(path) {

  track(EVENTS.PAGE_VIEW, path ? { to: path } : {});
}

/** Force-send anything queued (used before a full page navigation). */
export function flushAnalytics() {
  flush({ beacon: true });
}
