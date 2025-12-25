// components/MetricsViewer.js

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useTranslation } from 'next-i18next'; // <--- IMPORTED

export default function MetricsViewer({ server }) {
  const { t } = useTranslation('server'); // <--- INITIALIZED
  const [metrics, setMetrics] = useState({ cpu: 0, ram: 0 });

  useEffect(() => {
    if (!server || !server.id) return;

    const channel = supabase
      .channel(`server-metrics-${server.id}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'servers',
        filter: `id=eq.${server.id}`
      }, (payload) => {
        try {
          const newRow = payload.new;
          if (!newRow) return;
          setMetrics({ cpu: newRow.cpu || 0, ram: newRow.memory || 0 });
        } catch (e) {
          console.error('Error handling metrics payload', e);
        }
      })
      .subscribe();

    return () => {
      try { supabase.removeChannel(channel); } catch (e) {}
    };
  }, [server]);

  return (
    <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-4">

      <div className="grid grid-cols-2 gap-4">
        <div>
          <div className="font-bold dark:text-gray-100">{t('metrics.cpu')}</div> {/* <--- TRANSLATED */}
          <div className="text-2xl dark:text-gray-100">{Math.round(metrics.cpu)}%</div>
          <div className="text-sm text-gray-500 dark:text-gray-400">{t('metrics.usage')}</div> {/* <--- TRANSLATED */}
          <div className="bg-gray-200 dark:bg-slate-700 h-4 rounded">
            <div className="bg-blue-500 h-4 rounded" style={{ width: `${Math.min(Math.round(metrics.cpu), 100)}%` }} />
          </div>
        </div>
        <div>
          <div className="font-bold dark:text-gray-100">{t('metrics.ram')}</div> {/* <--- TRANSLATED */}
          <div className="text-2xl dark:text-gray-100">{Math.round(metrics.ram)}%</div>
          <div className="text-sm text-gray-500 dark:text-gray-400">{t('metrics.usage')}</div> {/* <--- TRANSLATED */}
          <div className="bg-gray-200 dark:bg-slate-700 h-4 rounded">
            <div className="bg-green-500 h-4 rounded" style={{ width: `${Math.min(Math.round(metrics.ram), 100)}%` }} />
          </div>
        </div>
      </div>
    </div>
  );
}