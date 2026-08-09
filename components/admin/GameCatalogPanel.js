// components/admin/GameCatalogPanel.js
import { useState, useMemo } from 'react';
import { GAME_REGISTRY } from '../../lib/config';
import {
  MagnifyingGlassIcon,
  CubeIcon,
  CheckCircleIcon,
  NoSymbolIcon
} from "@heroicons/react/24/outline";

export default function GameCatalogPanel() {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all'); // all | available | disabled

  const games = useMemo(() => {
    return Object.values(GAME_REGISTRY)
      .filter(g => {
        if (filter === 'available' && g.disabled) return false;
        if (filter === 'disabled' && !g.disabled) return false;
        if (search && !g.name.toLowerCase().includes(search.toLowerCase()) && !g.id.toLowerCase().includes(search.toLowerCase())) return false;
        return true;
      })
      .sort((a, b) => (a.disabled === b.disabled ? a.name.localeCompare(b.name) : a.disabled ? 1 : -1));
  }, [search, filter]);

  const disabledCount = Object.values(GAME_REGISTRY).filter(g => g.disabled).length;

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden h-full flex flex-col">
      {/* Header */}
      <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row justify-between items-center gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <CubeIcon className="h-5 w-5 text-indigo-500" />
            Game Catalog
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {Object.keys(GAME_REGISTRY).length} games registered · {disabledCount} currently disabled.
            Source of truth is <code className="font-mono">lib/config.js</code> - editing availability still requires a code change + deploy.
          </p>
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-lg text-sm shrink-0">
            {['all', 'available', 'disabled'].map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1 rounded-md font-medium capitalize transition-all ${
                  filter === f ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm' : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
          <div className="relative w-full sm:w-56">
            <MagnifyingGlassIcon className="h-5 w-5 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search games..."
              className="pl-10 pr-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:ring-2 focus:ring-indigo-500 outline-none w-full"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Grid */}
      <div className="overflow-y-auto flex-grow p-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {games.map(g => (
            <div
              key={g.id}
              className={`rounded-xl border p-4 flex items-start justify-between gap-3 ${
                g.disabled
                  ? 'border-red-200 dark:border-red-900/50 bg-red-50/50 dark:bg-red-900/10'
                  : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30'
              }`}
            >
              <div className="min-w-0">
                <div className="text-sm font-bold text-slate-900 dark:text-white truncate">{g.name}</div>
                <div className="text-[10px] text-slate-500 dark:text-slate-400 font-mono mt-0.5">{g.id}</div>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  <span className="text-[10px] font-medium bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded-md">
                    {g.engine}
                  </span>
                  <span className="text-[10px] font-medium bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded-md">
                    min {g.minRam}GB
                  </span>
                </div>
              </div>
              {g.disabled ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-red-600 dark:text-red-400 shrink-0" title="Disabled in lib/config.js">
                  <NoSymbolIcon className="h-4 w-4" /> Disabled
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-green-600 dark:text-green-400 shrink-0">
                  <CheckCircleIcon className="h-4 w-4" /> Live
                </span>
              )}
            </div>
          ))}
          {games.length === 0 && (
            <div className="col-span-full text-center py-10 text-slate-500">No games match this filter.</div>
          )}
        </div>
      </div>
    </div>
  );
}
