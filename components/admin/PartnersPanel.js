// components/admin/PartnersPanel.js
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import {
  TicketIcon,
  ArrowPathIcon,
  PlusIcon,
  BanknotesIcon,
  CheckCircleIcon,
  XCircleIcon,
  ChevronDownIcon,
} from "@heroicons/react/24/outline";

const eur = (cents) => '€' + (Number(cents || 0) / 100).toFixed(2);

export default function PartnersPanel() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [detail, setDetail] = useState({});
  const [showNew, setShowNew] = useState(false);
  const [error, setError] = useState(null);
  const [form, setForm] = useState({
    code: '', partner_name: '', partner_email: '',
    bonus_percent: 10, commission_percent: 10, max_commissioned_payments: 12,
  });

  useEffect(() => { fetchData(); }, []);

  const authed = async (url, opts = {}) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Not signed in');
    return fetch(url, {
      ...opts,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
        ...(opts.headers || {}),
      },
    });
  };

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authed('/api/admin/partners');
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Failed to load');
      setData(body);
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  const toggleExpand = async (codeId) => {
    if (expanded === codeId) return setExpanded(null);
    setExpanded(codeId);
    if (detail[codeId]) return;
    try {
      const res = await authed(`/api/admin/partners?codeId=${codeId}`);
      const body = await res.json();
      if (res.ok) setDetail((d) => ({ ...d, [codeId]: body.redemptions }));
    } catch (e) { /* detail is best-effort */ }
  };

  const createCode = async () => {
    setBusy('create');
    setError(null);
    try {
      const res = await authed('/api/admin/partners', {
        method: 'POST', body: JSON.stringify({ action: 'create', ...form }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Failed to create');
      setShowNew(false);
      setForm({ code: '', partner_name: '', partner_email: '', bonus_percent: 10, commission_percent: 10, max_commissioned_payments: 12 });
      await fetchData();
    } catch (e) { setError(e.message); }
    setBusy(null);
  };

  const toggleActive = async (c) => {
    setBusy(c.id);
    try {
      await authed('/api/admin/partners', {
        method: 'POST', body: JSON.stringify({ action: 'toggle', codeId: c.id, active: !c.active }),
      });
      await fetchData();
    } catch (e) { setError(e.message); }
    setBusy(null);
  };

  const markPaid = async (c) => {
    if (!confirm(`Mark ${eur(c.commission_owed_cents)} as paid out to ${c.partner_name}?\n\nThis only records the payout — it does not send any money.`)) return;
    setBusy(c.id);
    try {
      const res = await authed('/api/admin/partners', {
        method: 'POST', body: JSON.stringify({ action: 'mark_paid', codeId: c.id }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      setDetail((d) => ({ ...d, [c.id]: undefined }));
      await fetchData();
    } catch (e) { setError(e.message); }
    setBusy(null);
  };

  if (loading) {
    return <div className="p-8 text-center text-slate-500 dark:text-slate-400">Loading partner codes…</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header + totals */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <TicketIcon className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">Partner Codes</h2>
        </div>
        <div className="flex gap-6 ml-auto text-sm">
          <div>
            <p className="text-slate-500 dark:text-slate-400">Revenue driven</p>
            <p className="font-mono font-bold text-slate-900 dark:text-white">{eur(data?.totals?.revenue_cents)}</p>
          </div>
          <div>
            <p className="text-slate-500 dark:text-slate-400">Owed to partners</p>
            <p className="font-mono font-bold text-amber-600 dark:text-amber-400">{eur(data?.totals?.commission_owed_cents)}</p>
          </div>
          <button onClick={fetchData} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800" title="Refresh">
            <ArrowPathIcon className="w-5 h-5 text-slate-500" />
          </button>
          <button onClick={() => setShowNew((s) => !s)}
            className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-lg">
            <PlusIcon className="w-4 h-4" /> New code
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 text-sm border border-red-200 dark:border-red-800">
          {error}
        </div>
      )}

      {/* Create form */}
      {showNew && (
        <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[
            ['code', 'Code', 'text', 'SUMMER10'],
            ['partner_name', 'Partner name', 'text', 'Jane Doe'],
            ['partner_email', 'Partner email (optional)', 'email', 'jane@example.com'],
            ['bonus_percent', 'Buyer bonus %', 'number', ''],
            ['commission_percent', 'Partner commission %', 'number', ''],
            ['max_commissioned_payments', 'Commissioned payments (incl. first)', 'number', ''],
          ].map(([key, label, type, ph]) => (
            <div key={key}>
              <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">{label}</label>
              <input
                type={type} placeholder={ph} value={form[key]}
                onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm"
              />
            </div>
          ))}
          <div className="sm:col-span-2 lg:col-span-3 flex gap-2">
            <button onClick={createCode} disabled={busy === 'create'}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-bold rounded-lg">
              {busy === 'create' ? 'Creating…' : 'Create code'}
            </button>
            <button onClick={() => setShowNew(false)}
              className="px-4 py-2 text-sm font-bold text-slate-600 dark:text-slate-300 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Codes */}
      {(!data?.codes || data.codes.length === 0) ? (
        <div className="p-10 text-center rounded-xl border border-dashed border-slate-300 dark:border-slate-700">
          <TicketIcon className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-600 mb-3" />
          <p className="text-slate-500 dark:text-slate-400">No partner codes yet. Create one to get started.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/50 text-left">
              <tr className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Partner</th>
                <th className="px-4 py-3 text-right">Uses</th>
                <th className="px-4 py-3 text-right">Users</th>
                <th className="px-4 py-3 text-right">Revenue</th>
                <th className="px-4 py-3 text-right">Owed</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
              {data.codes.map((c) => (
                <>
                  <tr key={c.id} className="bg-white dark:bg-slate-900">
                    <td className="px-4 py-3">
                      <button onClick={() => toggleExpand(c.id)} className="flex items-center gap-1.5 font-mono font-bold text-indigo-600 dark:text-indigo-400">
                        <ChevronDownIcon className={`w-4 h-4 transition-transform ${expanded === c.id ? 'rotate-180' : ''}`} />
                        {c.code}
                      </button>
                      <span className="text-[11px] text-slate-400">
                        +{c.bonus_percent}% buyer · {c.commission_percent}% cut · {c.max_commissioned_payments}× cap
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900 dark:text-white">{c.partner_name}</p>
                      {c.partner_email && <p className="text-[11px] text-slate-400">{c.partner_email}</p>}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-slate-700 dark:text-slate-300">
                      {c.uses}
                      {c.subscriptions > 0 && <span className="text-[11px] text-slate-400 block">{c.subscriptions} sub</span>}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-slate-700 dark:text-slate-300">{c.unique_users}</td>
                    <td className="px-4 py-3 text-right font-mono text-slate-900 dark:text-white">{eur(c.revenue_cents)}</td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-amber-600 dark:text-amber-400">{eur(c.commission_owed_cents)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => toggleActive(c)} disabled={busy === c.id}
                          title={c.active ? 'Disable' : 'Enable'}
                          className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
                          {c.active
                            ? <CheckCircleIcon className="w-5 h-5 text-green-500" />
                            : <XCircleIcon className="w-5 h-5 text-slate-400" />}
                        </button>
                        <button onClick={() => markPaid(c)} disabled={busy === c.id || c.commission_owed_cents <= 0}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 disabled:opacity-40 hover:bg-slate-200 dark:hover:bg-slate-700">
                          <BanknotesIcon className="w-4 h-4" /> Mark paid
                        </button>
                      </div>
                    </td>
                  </tr>
                  {expanded === c.id && (
                    <tr key={`${c.id}-detail`}>
                      <td colSpan={7} className="px-4 py-3 bg-slate-50 dark:bg-slate-800/40">
                        {!detail[c.id] ? (
                          <p className="text-slate-400 text-xs">Loading redemptions…</p>
                        ) : detail[c.id].length === 0 ? (
                          <p className="text-slate-400 text-xs">No redemptions yet.</p>
                        ) : (
                          <table className="w-full text-xs">
                            <thead className="text-slate-400">
                              <tr>
                                <th className="text-left py-1">When</th>
                                <th className="text-left py-1">Kind</th>
                                <th className="text-right py-1">Paid</th>
                                <th className="text-right py-1">Bonus given</th>
                                <th className="text-right py-1">Commission</th>
                                <th className="text-right py-1">Settled</th>
                              </tr>
                            </thead>
                            <tbody className="text-slate-600 dark:text-slate-300">
                              {detail[c.id].map((r) => (
                                <tr key={r.id}>
                                  <td className="py-1">{new Date(r.created_at).toLocaleDateString()}</td>
                                  <td className="py-1">{r.kind.replace(/_/g, ' ')}{r.kind !== 'one_time' ? ` #${r.payment_index}` : ''}</td>
                                  <td className="py-1 text-right font-mono">{eur(r.net_paid_cents)}</td>
                                  <td className="py-1 text-right font-mono">{r.bonus_credits}</td>
                                  <td className="py-1 text-right font-mono">{eur(r.commission_cents)}</td>
                                  <td className="py-1 text-right">{r.paid_out ? 'yes' : '—'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
