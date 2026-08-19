// pages/admin/funnel.js
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import {
  ArrowLeftIcon,
  ExclamationTriangleIcon,
  FunnelIcon,
  UserGroupIcon,
  ServerStackIcon,
} from '@heroicons/react/24/outline';

const PERIODS = [
  { key: '7d', label: '7 days' },
  { key: '30d', label: '30 days' },
  { key: '90d', label: '90 days' },
  { key: 'all', label: 'All time' },
];

const pct = (n, total) => (total > 0 ? Math.round((n / total) * 100) : 0);

const Card = ({ title, children, icon: Icon, subtitle }) => (
  <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5">
    <div className="flex items-start gap-2 mb-4">
      {Icon && <Icon className="w-5 h-5 text-indigo-500 shrink-0 mt-0.5" />}
      <div>
        <h2 className="font-bold text-slate-900 dark:text-white">{title}</h2>
        {subtitle && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{subtitle}</p>}
      </div>
    </div>
    {children}
  </div>
);

// A funnel row: absolute count, share of the top of the funnel, and — the bit
// that actually matters — how many people were lost at this specific step.
const FunnelBar = ({ label, count, top, prev }) => {
  const share = pct(count, top);
  const dropped = prev == null ? 0 : Math.max(0, prev - count);
  return (
    <div className="mb-3 last:mb-0">
      <div className="flex justify-between items-baseline text-sm mb-1">
        <span className="font-medium text-slate-700 dark:text-slate-200">{label}</span>
        <span className="font-mono text-slate-900 dark:text-white">
          {count}
          <span className="text-slate-400 text-xs ml-2">{share}%</span>
        </span>
      </div>
      <div className="h-2.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500"
          style={{ width: `${share}%` }}
        />
      </div>
      {dropped > 0 && (
        <p className="text-[11px] text-rose-500 mt-1 font-medium">
          −{dropped} lost here ({pct(dropped, prev)}% of the previous step)
        </p>
      )}
    </div>
  );
};

const ReasonList = ({ rows, empty = 'No data yet' }) => {
  if (!rows?.length) return <p className="text-sm text-slate-400">{empty}</p>;
  const max = rows[0].count;
  return (
    <ul className="space-y-2">
      {rows.slice(0, 8).map((r) => (
        <li key={r.value}>
          <div className="flex justify-between gap-3 text-sm">
            <span className="text-slate-700 dark:text-slate-300 truncate" title={r.value}>
              {r.value}
            </span>
            <span className="font-mono text-slate-900 dark:text-white shrink-0">{r.count}</span>
          </div>
          <div className="h-1.5 mt-1 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
            <div className="h-full bg-rose-400" style={{ width: `${pct(r.count, max)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
};

const Stat = ({ label, value, tone = 'default' }) => (
  <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4">
    <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400 font-semibold">
      {label}
    </p>
    <p
      className={`text-2xl font-black mt-1 ${
        tone === 'bad' ? 'text-rose-500' : 'text-slate-900 dark:text-white'
      }`}
    >
      {value}
    </p>
  </div>
);

export default function AdminFunnel() {
  const router = useRouter();
  const [period, setPeriod] = useState('30d');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return router.push('/login');
      try {
        const res = await fetch(`/api/admin/funnel?period=${period}`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (res.status === 403) return router.push('/');
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(json.error || 'Failed to load');
        setData(json);
      } catch (e) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [period]);

  const cohort = data?.cohort_funnel || [];
  const top = cohort[0]?.count || 0;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
          <div>
            <Link
              href="/admin"
              className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-indigo-500 mb-2"
            >
              <ArrowLeftIcon className="w-4 h-4" /> Back to admin
            </Link>
            <h1 className="text-3xl font-black tracking-tight">Activation funnel</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Where people stop between signing up and running a server.
            </p>
          </div>
          <div className="flex gap-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-1">
            {PERIODS.map((p) => (
              <button
                key={p.key}
                onClick={() => setPeriod(p.key)}
                className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition ${
                  period === p.key
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {loading && !data && <p className="text-slate-500">Loading…</p>}
        {error && (
          <div className="rounded-xl border border-rose-300 bg-rose-50 dark:bg-rose-950/40 dark:border-rose-900 p-4 text-rose-700 dark:text-rose-300 text-sm">
            {error}
          </div>
        )}

        {data && (
          <>
            {!data.analytics_ready && (
              <div className="mb-6 flex gap-3 rounded-xl border border-amber-300 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/40 p-4">
                <ExclamationTriangleIcon className="w-5 h-5 text-amber-500 shrink-0" />
                <p className="text-sm text-amber-800 dark:text-amber-200">
                  The <code className="font-mono">analytics_events</code> table isn&apos;t there yet.
                  Run <code className="font-mono">sql/analytics_events.sql</code> in Supabase to turn
                  on the reason-level panels below. The cohort funnel works without it.
                </p>
              </div>
            )}

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <Stat label="Signed up" value={top} />
              <Stat
                label="Never created a server"
                value={data.stuck.never_created_count}
                tone="bad"
              />
              <Stat
                label="Created, never started"
                value={data.stuck.created_never_started_count}
                tone="bad"
              />
              <Stat
                label="…of those, on 0 credits"
                value={data.stuck.blocked_by_zero_credits}
                tone="bad"
              />
            </div>

            <div className="grid lg:grid-cols-2 gap-6 mb-6">
              <Card
                title="Cohort funnel"
                subtitle="Rebuilt from accounts, servers and payments — covers all history, no tracking needed."
                icon={FunnelIcon}
              >
                {cohort.map((step, i) => (
                  <FunnelBar
                    key={step.label}
                    label={step.label}
                    count={step.count}
                    top={top}
                    prev={i === 0 ? null : cohort[i - 1].count}
                  />
                ))}
              </Card>

              <Card
                title="Event funnel"
                subtitle={`From tracked behaviour — ${data.event_count} events in this window. Only covers activity since tracking shipped.`}
                icon={UserGroupIcon}
              >
                {(data.event_funnel || []).map((step, i) => (
                  <FunnelBar
                    key={step.event}
                    label={step.label}
                    count={step.count}
                    top={data.event_funnel[0]?.count || 0}
                    prev={i === 0 ? null : data.event_funnel[i - 1].count}
                  />
                ))}
              </Card>
            </div>

            <div className="grid lg:grid-cols-3 gap-6 mb-6">
              <Card
                title="Why starts fail"
                subtitle={`${data.reasons.credit_wall_users} distinct users hit the credit wall`}
              >
                <ReasonList rows={data.reasons.start_failed} />
              </Card>
              <Card title="Why creates fail">
                <ReasonList rows={data.reasons.create_failed} />
              </Card>
              <Card title="Why signups / logins fail">
                <p className="text-xs font-semibold text-slate-400 mb-2">Signup</p>
                <ReasonList rows={data.reasons.signup_failed} />
                <p className="text-xs font-semibold text-slate-400 mt-4 mb-2">Login</p>
                <ReasonList rows={data.reasons.login_failed} />
              </Card>
            </div>

            <div className="grid lg:grid-cols-3 gap-6 mb-6">
              <Card
                title="Create form abandonment"
                subtitle="Opened the form, closed it without creating"
              >
                <dl className="space-y-2 text-sm">
                  {[
                    ['Opened the form', data.abandonment.opened],
                    ['Abandoned it', data.abandonment.abandoned],
                    ['Closed within 5s', data.abandonment.bounced_fast],
                    ['Typed a name, then left', data.abandonment.typed_name_then_left],
                    ['Left on a name error', data.abandonment.with_name_error],
                  ].map(([label, value]) => (
                    <div key={label} className="flex justify-between">
                      <dt className="text-slate-600 dark:text-slate-300">{label}</dt>
                      <dd className="font-mono font-semibold">{value}</dd>
                    </div>
                  ))}
                </dl>
              </Card>
              <Card title="Abandoned by game">
                <ReasonList rows={data.abandonment.by_game} />
              </Card>
              <Card title="Dashboard visits">
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-slate-600 dark:text-slate-300">Total views</dt>
                    <dd className="font-mono font-semibold">{data.traffic.dashboard_views_total}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-600 dark:text-slate-300">…with 0 credits</dt>
                    <dd className="font-mono font-semibold text-rose-500">
                      {data.traffic.dashboard_views_with_zero_credits}
                    </dd>
                  </div>
                </dl>
                <p className="text-xs font-semibold text-slate-400 mt-4 mb-2">Top utm_source</p>
                <ReasonList rows={data.traffic.by_utm_source} empty="No campaign traffic tagged" />
              </Card>
            </div>

            <div className="grid lg:grid-cols-2 gap-6">
              <Card
                title="Created a server, never started it"
                subtitle="Newest first — these are the people worth emailing"
                icon={ServerStackIcon}
              >
                <div className="overflow-x-auto -mx-2">
                  <table className="w-full text-sm min-w-[420px]">
                    <thead>
                      <tr className="text-left text-xs uppercase text-slate-400">
                        <th className="px-2 py-1.5 font-semibold">User</th>
                        <th className="px-2 py-1.5 font-semibold">Server</th>
                        <th className="px-2 py-1.5 font-semibold text-right">Credits</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.stuck.created_never_started.map((s) => (
                        <tr key={s.server_id} className="border-t border-slate-100 dark:border-slate-800">
                          <td className="px-2 py-2 truncate max-w-[180px]" title={s.email}>
                            {s.email || s.user_id}
                          </td>
                          <td className="px-2 py-2 text-slate-500">
                            {s.name} · {s.game} · {s.ram}GB · {s.billing_type}
                          </td>
                          <td
                            className={`px-2 py-2 text-right font-mono ${
                              s.credits <= 0 ? 'text-rose-500 font-bold' : ''
                            }`}
                          >
                            {s.credits.toFixed(2)}
                          </td>
                        </tr>
                      ))}
                      {!data.stuck.created_never_started.length && (
                        <tr>
                          <td colSpan={3} className="px-2 py-4 text-slate-400">
                            Nobody is stuck here.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>

              <Card
                title="Signed up, never created a server"
                subtitle="Newest first"
                icon={UserGroupIcon}
              >
                <div className="overflow-x-auto -mx-2">
                  <table className="w-full text-sm min-w-[420px]">
                    <thead>
                      <tr className="text-left text-xs uppercase text-slate-400">
                        <th className="px-2 py-1.5 font-semibold">User</th>
                        <th className="px-2 py-1.5 font-semibold">Email confirmed</th>
                        <th className="px-2 py-1.5 font-semibold">Ever logged in</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.stuck.never_created.map((u) => (
                        <tr key={u.id} className="border-t border-slate-100 dark:border-slate-800">
                          <td className="px-2 py-2 truncate max-w-[200px]" title={u.email}>
                            {u.email}
                          </td>
                          <td className="px-2 py-2">
                            {u.confirmed ? (
                              <span className="text-emerald-500">yes</span>
                            ) : (
                              <span className="text-rose-500 font-semibold">no</span>
                            )}
                          </td>
                          <td className="px-2 py-2">
                            {u.ever_logged_in ? (
                              <span className="text-emerald-500">yes</span>
                            ) : (
                              <span className="text-rose-500 font-semibold">no</span>
                            )}
                          </td>
                        </tr>
                      ))}
                      {!data.stuck.never_created.length && (
                        <tr>
                          <td colSpan={3} className="px-2 py-4 text-slate-400">
                            Nobody is stuck here.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export async function getStaticProps({ locale }) {
  return {
    props: {
      ...(await serverSideTranslations(locale, ['common'])),
    },
  };
}
