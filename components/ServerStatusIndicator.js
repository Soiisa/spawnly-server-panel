// components/ServerStatusIndicator.js

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useTranslation } from 'next-i18next'; // <--- IMPORTED

export default function ServerStatusIndicator({ server }) {
  const { t } = useTranslation('server'); // <--- INITIALIZED
  const [status, setStatus] = useState(server.status || 'Unknown');
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!server?.id) return;

    const channel = supabase
      .channel(`server-status-${server.id}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'servers',
        filter: `id=eq.${server.id}`
      }, (payload) => {
        try {
          const newRow = payload.new;
          if (!newRow) return;
          setStatus(newRow.status || status);
          setConnected(true);
        } catch (e) {
          console.error('Error handling realtime payload', e);
        }
      })
      .subscribe();

    return () => {
      try {
        supabase.removeChannel(channel);
      } catch (e) {
        // fallback
      }
    };
  }, [server.id, status]);

  // Helper to translate status safely
  const getTranslatedStatus = (s) => {
    const key = s?.toLowerCase();
    return t(`status.${key}`, { defaultValue: s }); // Fallback to raw string if no translation
  };

  if (!server.ipv4) {
    return (
      <span className="bg-gray-100 dark:bg-slate-700 text-gray-800 dark:text-gray-400 text-xs px-2 py-1 rounded">
        {t('status.stopped')} {/* <--- TRANSLATED */}
      </span>
    );
  }

  return (
    <div className="flex items-center">
      <span className={`text-xs px-2 py-1 rounded mr-2 ${
        status === "Running" 
          ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" 
          : ["Starting", "Stopping", "Initializing", "Provisioning"].includes(status)
            ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400" 
            : "bg-gray-100 text-gray-800 dark:bg-slate-700 dark:text-gray-400"
      }`}>
        {getTranslatedStatus(status)} {/* <--- TRANSLATED DISPLAY */}
        {!connected && status !== "Stopped" && ` (${t('status.disconnected')})`}
      </span>
    </div>
  );
}