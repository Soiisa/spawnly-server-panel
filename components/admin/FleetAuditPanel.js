// components/admin/FleetAuditPanel.js
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import {
  ExclamationTriangleIcon,
  ArrowPathIcon,
  TrashIcon,
  ServerStackIcon,
  CheckCircleIcon
} from "@heroicons/react/24/outline";

export default function FleetAuditPanel() {
  const [audit, setAudit] = useState(null);
  const [loading, setLoading] = useState(true);
  const [terminating, setTerminating] = useState(null);

  useEffect(() => {
    fetchAudit();
  }, []);

  const fetchAudit = async () => {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    try {
      const res = await fetch('/api/admin/fleet-audit', {
        headers: { Authorization: `Bearer ${session.access_token}` }
      });
      if (res.ok) {
        setAudit(await res.json());
      }
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const handleTerminate = async (hetznerId, name) => {
    if (!confirm(`WARNING: Permanently terminate Hetzner server "${name}" (ID ${hetznerId})?\n\nThis box isn't tracked in Spawnly's database - this action only affects the Hetzner VPS itself and cannot be undone.`)) return;

    setTerminating(hetznerId);
    const { data: { session } } = await supabase.auth.getSession();
    try {
      const res = await fetch('/api/admin/fleet-audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ hetznerId })
      });
      if (res.ok) {
        fetchAudit();
      } else {
        alert('Failed to terminate server.');
      }
    } catch (e) {
      alert('Network error while terminating server.');
    }
    setTerminating(null);
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden h-full flex flex-col">
      {/* Header */}
      <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row justify-between items-center gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <ServerStackIcon className="h-5 w-5 text-indigo-500" />
            Fleet Audit
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Cross-checks every Hetzner VPS against the servers database - catches manual/test boxes that are still being billed but aren't tracked anywhere.
          </p>
        </div>
        <button
          onClick={fetchAudit}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
        >
          <ArrowPathIcon className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Re-scan
        </button>
      </div>

      {/* Summary */}
      {audit && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-5 border-b border-slate-200 dark:border-slate-800">
          <SummaryStat label="Hetzner Servers" value={audit.total_hetzner_servers} />
          <SummaryStat label="Tracked in DB" value={audit.total_tracked_servers} />
          <SummaryStat
            label="Orphaned"
            value={audit.orphaned_count}
            accent={audit.orphaned_count > 0 ? 'text-red-500' : 'text-green-500'}
          />
          <SummaryStat
            label="Orphaned Cost/hr"
            value={`€${audit.orphaned_cost_per_hour.toFixed(4)}`}
            accent={audit.orphaned_cost_per_hour > 0 ? 'text-red-500' : 'text-green-500'}
          />
        </div>
      )}

      {/* List */}
      <div className="overflow-x-auto flex-grow">
        {loading ? (
          <div className="px-6 py-10 text-center text-slate-500">Scanning Hetzner fleet...</div>
        ) : !audit || audit.orphaned.length === 0 ? (
          <div className="px-6 py-10 flex flex-col items-center text-center text-slate-500 gap-2">
            <CheckCircleIcon className="h-8 w-8 text-green-500" />
            <span>No orphaned servers found - every Hetzner VPS is accounted for.</span>
          </div>
        ) : (
          <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800">
            <thead className="bg-slate-50 dark:bg-slate-950">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Server</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Type</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">IP</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Age</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Cost Accrued</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-slate-900 divide-y divide-slate-200 dark:divide-slate-800">
              {audit.orphaned.map((s) => (
                <tr key={s.hetzner_id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <ExclamationTriangleIcon className="h-4 w-4 text-amber-500 shrink-0" />
                      <div>
                        <div className="text-sm font-medium text-slate-900 dark:text-white">{s.name}</div>
                        <div className="text-[10px] text-slate-500 font-mono">HZ-ID: {s.hetzner_id}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600 dark:text-slate-400 font-mono">{s.server_type}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600 dark:text-slate-400 font-mono">{s.ipv4 || '-'}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600 dark:text-slate-400">{s.age_hours}h</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-red-500">€{s.cost_accrued.toFixed(2)}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    <button
                      onClick={() => handleTerminate(s.hetzner_id, s.name)}
                      disabled={terminating === s.hetzner_id}
                      className="inline-flex items-center gap-1.5 text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300 disabled:opacity-50"
                      title="Terminate this Hetzner server"
                    >
                      <TrashIcon className="h-4 w-4" />
                      {terminating === s.hetzner_id ? 'Terminating...' : 'Terminate'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function SummaryStat({ label, value, accent }) {
  return (
    <div>
      <div className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</div>
      <div className={`text-2xl font-semibold ${accent || 'text-slate-900 dark:text-white'}`}>{value}</div>
    </div>
  );
}
