// pages/api/admin/funnel.js
//
// Activation funnel: signup -> dashboard -> create -> start -> running.
//
// Two independent views, on purpose:
//   * `cohort` — reconstructed from tables that already exist (auth.users,
//                servers, credit_transactions). Works retroactively, so it
//                answers "where are people dropping off?" today, without
//                waiting for event data to accumulate.
//   * `events` — from analytics_events. Only covers users who signed up after
//                tracking shipped, but it carries the *reasons*.

import { createClient } from '@supabase/supabase-js';
import { FUNNEL_STEPS, EVENTS } from '../../../lib/analyticsEvents';

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const PERIOD_DAYS = { '7d': 7, '30d': 30, '90d': 90, all: 3650 };

// auth.admin.listUsers pages at 50 by default; a partial list would silently
// shrink the top of the funnel.
async function listAllAuthUsers() {
  const users = [];
  for (let page = 1; page <= 40; page++) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const batch = data?.users || [];
    users.push(...batch);
    if (batch.length < 1000) break;
  }
  return users;
}

const countBy = (rows, key) => {
  const out = {};
  for (const row of rows) {
    const k = row?.[key] ?? 'unknown';
    out[k] = (out[k] || 0) + 1;
  }
  return Object.entries(out)
    .map(([value, count]) => ({ value: String(value), count }))
    .sort((a, b) => b.count - a.count);
};

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'No token' });
  const { data: { user }, error: authError } =
    await supabaseAdmin.auth.getUser(authHeader.split(' ')[1]);
  if (authError || !user) return res.status(401).json({ error: 'Invalid token' });

  const { data: adminProfile } = await supabaseAdmin
    .from('profiles').select('is_admin').eq('id', user.id).single();
  if (!adminProfile?.is_admin) return res.status(403).json({ error: 'Forbidden' });

  const period = PERIOD_DAYS[req.query.period] ? req.query.period : '30d';
  const since = new Date(Date.now() - PERIOD_DAYS[period] * 24 * 60 * 60 * 1000);
  const sinceIso = since.toISOString();

  try {
    const [authUsers, serversRes, depositsRes, eventsRes, profilesRes] = await Promise.all([
      listAllAuthUsers(),
      supabaseAdmin
        .from('servers')
        .select('id, user_id, name, game, billing_type, ram, status, created_at, hetzner_id, last_billed_at, runtime_accumulated_seconds'),
      supabaseAdmin
        .from('credit_transactions')
        .select('user_id, created_at')
        .eq('type', 'deposit'),
      supabaseAdmin
        .from('analytics_events')
        .select('event, user_id, anon_id, props, utm_source, created_at, source')
        .gte('created_at', sinceIso)
        .limit(50000),
      supabaseAdmin.from('profiles').select('id, credits, username'),
    ]);

    const servers = serversRes.data || [];
    const deposits = depositsRes.data || [];
    const events = eventsRes.data || [];
    // The table may not exist yet on a project where the migration hasn't run.
    const analyticsReady = !eventsRes.error;

    // ---------------------------------------------------------------
    // 1. Cohort funnel — reconstructed from tables that already exist
    // ---------------------------------------------------------------
    const cohort = authUsers.filter((u) => new Date(u.created_at) >= since);
    const cohortIds = new Set(cohort.map((u) => u.id));

    const confirmed = cohort.filter((u) => !!u.email_confirmed_at);
    const everLoggedIn = cohort.filter((u) => !!u.last_sign_in_at);

    const cohortServers = servers.filter((s) => cohortIds.has(s.user_id));
    // "Ever started" is deliberately generous: hourly servers get hetzner_id
    // cleared on stop, so we also accept a billing timestamp or accumulated
    // runtime as proof the machine really came up at least once.
    const wasEverStarted = (s) =>
      !!s.hetzner_id || !!s.last_billed_at || Number(s.runtime_accumulated_seconds) > 0;

    const usersWithServer = new Set(cohortServers.map((s) => s.user_id));
    const usersWithStartedServer = new Set(
      cohortServers.filter(wasEverStarted).map((s) => s.user_id)
    );
    const usersWithDeposit = new Set(
      deposits.filter((d) => cohortIds.has(d.user_id)).map((d) => d.user_id)
    );

    const cohortFunnel = [
      { label: 'Signed up', count: cohort.length },
      { label: 'Confirmed email', count: confirmed.length },
      { label: 'Logged in at least once', count: everLoggedIn.length },
      { label: 'Added credits', count: usersWithDeposit.size },
      { label: 'Created a server', count: usersWithServer.size },
      { label: 'Started a server', count: usersWithStartedServer.size },
    ];

    // ---------------------------------------------------------------
    // 2. Who is stuck, and how much money is on their account
    // ---------------------------------------------------------------
    const profileById = new Map((profilesRes.data || []).map((p) => [p.id, p]));
    const emailById = new Map(authUsers.map((u) => [u.id, u.email]));

    const neverCreated = cohort
      .filter((u) => !usersWithServer.has(u.id))
      .map((u) => ({
        id: u.id,
        email: u.email,
        username: profileById.get(u.id)?.username || null,
        credits: Number(profileById.get(u.id)?.credits || 0),
        created_at: u.created_at,
        confirmed: !!u.email_confirmed_at,
        ever_logged_in: !!u.last_sign_in_at,
      }))
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    const createdNeverStarted = cohortServers
      .filter((s) => !wasEverStarted(s))
      .map((s) => ({
        server_id: s.id,
        name: s.name,
        game: s.game,
        billing_type: s.billing_type,
        ram: s.ram,
        created_at: s.created_at,
        user_id: s.user_id,
        email: emailById.get(s.user_id) || null,
        credits: Number(profileById.get(s.user_id)?.credits || 0),
      }))
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    // The headline number: of the people who built a server but never started
    // it, how many simply had no credits?
    const blockedByZeroCredits = createdNeverStarted.filter((s) => s.credits <= 0).length;

    // ---------------------------------------------------------------
    // 3. Event funnel + reasons (only meaningful once events exist)
    // ---------------------------------------------------------------
    // anon_id keeps pre-login and beacon-sent events attached to a person.
    const actorOf = (e) => e.user_id || (e.anon_id ? `anon:${e.anon_id}` : null);

    const actorsByEvent = new Map();
    for (const e of events) {
      const actor = actorOf(e);
      if (!actor) continue;
      if (!actorsByEvent.has(e.event)) actorsByEvent.set(e.event, new Set());
      actorsByEvent.get(e.event).add(actor);
    }

    const eventFunnel = FUNNEL_STEPS.map((step) => ({
      event: step.event,
      label: step.label,
      count: actorsByEvent.get(step.event)?.size || 0,
    }));

    const eventsOf = (name) => events.filter((e) => e.event === name);
    const startFailures = eventsOf(EVENTS.SERVER_START_FAILED);

    const reasons = {
      start_failed: countBy(startFailures.map((e) => ({ r: e.props?.reason })), 'r'),
      create_failed: countBy(
        eventsOf(EVENTS.CREATE_SERVER_FAILED).map((e) => ({ r: e.props?.reason })), 'r'
      ),
      signup_failed: countBy(
        eventsOf(EVENTS.SIGNUP_FAILED).map((e) => ({ r: e.props?.reason })), 'r'
      ),
      login_failed: countBy(
        eventsOf(EVENTS.LOGIN_FAILED).map((e) => ({ r: e.props?.reason })), 'r'
      ),
      provision_failed: countBy(
        eventsOf(EVENTS.SERVER_PROVISION_FAILED).map((e) => ({ r: e.props?.detail })), 'r'
      ).slice(0, 10),
      // Credit wall specifically — counted by distinct user, since one blocked
      // person clicking start five times is one problem, not five.
      credit_wall_users: new Set(
        startFailures.filter((e) => e.props?.is_credit_wall).map(actorOf).filter(Boolean)
      ).size,
    };

    const abandons = eventsOf(EVENTS.CREATE_MODAL_ABANDONED);
    const abandonment = {
      opened: actorsByEvent.get(EVENTS.CREATE_MODAL_OPENED)?.size || 0,
      abandoned: abandons.length,
      // Sub-5s closes are "opened it, looked, left" — a pricing or wrong-place
      // signal rather than form friction.
      bounced_fast: abandons.filter((e) => Number(e.props?.seconds_open) < 5).length,
      typed_name_then_left: abandons.filter((e) => e.props?.typed_name).length,
      with_name_error: abandons.filter((e) => e.props?.name_error).length,
      by_game: countBy(abandons.map((e) => ({ g: e.props?.game })), 'g'),
      by_billing: countBy(abandons.map((e) => ({ b: e.props?.billing_type })), 'b'),
    };

    const dashboardViews = eventsOf(EVENTS.DASHBOARD_VIEWED);
    const traffic = {
      by_utm_source: countBy(
        eventsOf(EVENTS.PAGE_VIEW).map((e) => ({ s: e.utm_source })), 's'
      ).slice(0, 10),
      dashboard_views_total: dashboardViews.length,
      dashboard_views_with_zero_credits: dashboardViews
        .filter((e) => e.props?.has_credits === false).length,
    };

    return res.status(200).json({
      period,
      since: sinceIso,
      analytics_ready: analyticsReady,
      event_count: events.length,
      cohort_funnel: cohortFunnel,
      event_funnel: eventFunnel,
      reasons,
      abandonment,
      traffic,
      stuck: {
        never_created_count: neverCreated.length,
        created_never_started_count: createdNeverStarted.length,
        blocked_by_zero_credits: blockedByZeroCredits,
        never_created: neverCreated.slice(0, 50),
        created_never_started: createdNeverStarted.slice(0, 50),
      },
    });
  } catch (err) {
    console.error('[admin/funnel]', err);
    return res.status(500).json({ error: 'Server Error', detail: err.message });
  }
}
