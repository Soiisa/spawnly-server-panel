// components/ServerStatusIndicator.js

import { useTranslation } from 'next-i18next';

export default function ServerStatusIndicator({ server }) {
  // CHANGED: Use 'dashboard' namespace because it's loaded on the dashboard page
  const { t } = useTranslation('dashboard');
  const status = server.status || 'Unknown';

  // Helper to translate status safely
  const getTranslatedStatus = (s) => {
    const key = s?.toLowerCase();
    return t(`status.${key}`, { defaultValue: s });
  };

  return (
    <div className="flex items-center">
      <span className={`text-xs px-2 py-1 rounded mr-2 ${
        status === "Running"
          ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
          : ["Starting", "Stopping", "Initializing", "Provisioning"].includes(status)
            ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400"
            : "bg-gray-100 text-gray-800 dark:bg-slate-700 dark:text-gray-400"
      }`}>
        {getTranslatedStatus(status)}
      </span>
    </div>
  );
}