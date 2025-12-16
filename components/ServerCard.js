import Link from 'next/link';
import { 
  SignalIcon, 
  CpuChipIcon, 
  ClockIcon, 
  ClipboardDocumentIcon 
} from '@heroicons/react/24/outline';
import ServerStatusIndicator from './ServerStatusIndicator';

export default function ServerCard({ server }) {
  const status = server.status || 'Unknown';
  const isRunning = status === 'Running';
  const isStopped = status === 'Stopped';

  const handleCopyIp = (e) => {
    e.preventDefault();
    if (!server?.name) return;
    const ip = `${server.name}.spawnly.net`;
    navigator.clipboard.writeText(ip);
  };
  
  return (
    // UPDATED: Added dark mode classes for main card container
    <Link 
      href={`/server/${server.id}`} 
      className="block bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-gray-200 dark:border-slate-700 hover:shadow-xl transition-all duration-300 transform hover:-translate-y-0.5"
    >
      <div className="p-6">
        {/* Header */}
        <div className="flex justify-between items-start mb-4">
          <div className="flex items-center gap-3">
            {/* UPDATED: Added dark mode class for text */}
            <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 truncate max-w-[200px]">{server.name}</h3>
            <ServerStatusIndicator server={server} />
          </div>
          <button 
            onClick={handleCopyIp}
            className="p-1 text-gray-400 hover:text-indigo-600 transition-colors"
            title="Copy IP"
          >
            <ClipboardDocumentIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Status Indicators */}
        <div className="grid grid-cols-2 gap-4">
          
          {/* Status */}
          <div 
            // UPDATED: Added dark mode classes for status badge
            className={`p-3 rounded-xl flex flex-col items-start ${
              isRunning ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-50 text-gray-600 dark:bg-slate-700 dark:text-gray-300'
            }`}
          >
            <div className="flex items-center gap-1.5 text-xs font-medium uppercase mb-1">
              <SignalIcon className="w-4 h-4" />
              Connection
            </div>
            <span className="font-bold text-sm capitalize">{status}</span>
          </div>

          {/* Player Count */}
          <div 
            // UPDATED: Added dark mode classes for player badge
            className={`p-3 rounded-xl flex flex-col items-start ${
              isRunning ? 'bg-indigo-50 text-indigo-700' : 'bg-gray-50 text-gray-600 dark:bg-slate-700 dark:text-gray-300'
            }`}
          >
            <div className="flex items-center gap-1.5 text-xs font-medium uppercase mb-1">
              <CpuChipIcon className="w-4 h-4" />
              Players
            </div>
            <span className="font-bold text-sm">
              {isRunning ? `${server.player_count || 0} / ${server.max_players || 20}` : '0 / —'}
            </span>
          </div>
        </div>

        {/* Footer Info */}
        <div className="mt-4 pt-4 border-t border-gray-100 dark:border-slate-700 flex justify-between items-center text-sm text-gray-500 dark:text-gray-400">
          <div className="flex items-center gap-1.5">
            <ClockIcon className="w-4 h-4" />
            <span className="font-medium">RAM: {server.ram}GB</span>
          </div>
          <span className="bg-gray-100 dark:bg-slate-700 px-2 py-0.5 rounded text-gray-700 dark:text-gray-300 font-medium capitalize">
            {server.type}
          </span>
        </div>
      </div>
    </Link>
  );
}