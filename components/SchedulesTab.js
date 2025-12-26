import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { format, formatDistanceToNow } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'next-i18next'; // <--- IMPORTED
import { 
  PlusIcon, TrashIcon, ArrowPathIcon, CommandLineIcon, 
  PowerIcon, ClockIcon, CalendarDaysIcon, PlayIcon, StopIcon,
  BoltIcon
} from '@heroicons/react/24/outline';

export default function SchedulesTab({ server }) {
  const { t } = useTranslation('server'); // <--- INITIALIZED
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  
  // Form State
  const [action, setAction] = useState('restart');
  const [payload, setPayload] = useState('');
  const [runTime, setRunTime] = useState('');
  const [isRepeat, setIsRepeat] = useState(false);
  const [interval, setInterval] = useState(24);
  const [unit, setUnit] = useState('hours');
  const [startImmediately, setStartImmediately] = useState(false);

  useEffect(() => {
    fetchSchedules();
  }, [server.id]);

  const fetchSchedules = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('scheduled_tasks')
      .select('*')
      .eq('server_id', server.id)
      .order('next_run_at', { ascending: true });
    setSchedules(data || []);
    setLoading(false);
  };

  const handleDelete = async (id) => {
    const { error } = await supabase.from('scheduled_tasks').delete().eq('id', id);
    if (!error) {
      setSchedules(prev => prev.filter(s => s.id !== id));
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    // Validation: Require time ONLY if not starting immediately
    if (!startImmediately && !runTime) return;

    const { data: { user } } = await supabase.auth.getUser();
    
    const multiplier = unit === 'hours' ? 60 : 1;
    const finalInterval = isRepeat ? parseInt(interval) * multiplier : 0;

    // Calculate Next Run
    let nextRunIso;
    if (startImmediately) {
        // If starting now, set it to 10 seconds in the past to ensure the cron picks it up immediately
        const now = new Date();
        now.setSeconds(now.getSeconds() - 10); 
        nextRunIso = now.toISOString();
    } else {
        nextRunIso = new Date(runTime).toISOString();
    }

    const newTask = {
      server_id: server.id,
      user_id: user.id,
      action,
      payload: action === 'command' ? payload : null,
      next_run_at: nextRunIso,
      is_repeat: isRepeat,
      repeat_interval_minutes: finalInterval
    };

    const { data, error } = await supabase.from('scheduled_tasks').insert(newTask).select().single();

    if (!error && data) {
      setSchedules([...schedules, data].sort((a,b) => new Date(a.next_run_at) - new Date(b.next_run_at)));
      setIsCreating(false);
      setPayload('');
      setRunTime('');
      setStartImmediately(false);
    }
  };

  const getActionStyle = (act) => {
    switch(act) {
      case 'start': return { icon: PlayIcon, color: 'text-emerald-600 bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-400', label: t('schedules.actions.start') };
      case 'stop': return { icon: StopIcon, color: 'text-red-600 bg-red-100 dark:bg-red-900/30 dark:text-red-400', label: t('schedules.actions.stop') };
      case 'restart': return { icon: ArrowPathIcon, color: 'text-amber-600 bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400', label: t('schedules.actions.restart') };
      case 'command': return { icon: CommandLineIcon, color: 'text-slate-600 bg-slate-100 dark:bg-slate-700 dark:text-slate-300', label: t('schedules.actions.command') };
      default: return { icon: PowerIcon, color: 'text-gray-600 bg-gray-100', label: act };
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">{t('schedules.title')}</h2> {/* <--- TRANSLATED */}
          <p className="text-sm text-gray-500 dark:text-gray-400">{t('schedules.subtitle')}</p> {/* <--- TRANSLATED */}
        </div>
        <button
          onClick={() => setIsCreating(!isCreating)}
          className={`flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all shadow-sm ${
            isCreating 
              ? 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-slate-700 dark:text-gray-200' 
              : 'bg-indigo-600 text-white hover:bg-indigo-700 hover:shadow-indigo-500/30'
          }`}
        >
          <PlusIcon className={`w-5 h-5 transition-transform ${isCreating ? 'rotate-45' : ''}`} />
          {isCreating ? t('schedules.cancel') : t('schedules.new_task')} {/* <--- TRANSLATED */}
        </button>
      </div>

      {/* Creation Form */}
      <AnimatePresence>
        {isCreating && (
          <motion.div
            initial={{ opacity: 0, height: 0, y: -10 }}
            animate={{ opacity: 1, height: 'auto', y: 0 }}
            exit={{ opacity: 0, height: 0, y: -10 }}
            className="overflow-hidden"
          >
            <form onSubmit={handleCreate} className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-indigo-100 dark:border-indigo-900/50 shadow-sm ring-1 ring-indigo-500/10">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* Action Selection */}
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">{t('schedules.form.action')}</label>
                  <div className="grid grid-cols-2 gap-2">
                    {['restart', 'start', 'stop', 'command'].map((act) => {
                      const style = getActionStyle(act);
                      const isSelected = action === act;
                      return (
                        <button
                          key={act}
                          type="button"
                          onClick={() => setAction(act)}
                          className={`flex items-center gap-2 p-3 rounded-lg border transition-all text-sm font-medium ${
                            isSelected 
                              ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300' 
                              : 'border-gray-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-700 text-gray-600 dark:text-gray-400'
                          }`}
                        >
                          <style.icon className={`w-5 h-5 ${isSelected ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-400'}`} />
                          {style.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Timing & Details */}
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">{t('schedules.form.when')}</label>
                    
                    {/* START IMMEDIATELY TOGGLE */}
                    <div className="flex items-center gap-2 mb-3">
                        <button
                            type="button"
                            onClick={() => setStartImmediately(!startImmediately)}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${startImmediately ? 'bg-indigo-600' : 'bg-gray-200 dark:bg-slate-700'}`}
                        >
                            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${startImmediately ? 'translate-x-6' : 'translate-x-1'}`} />
                        </button>
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('schedules.form.start_immediately')}</span>
                    </div>

                    {!startImmediately && (
                        <input 
                        type="datetime-local" 
                        required={!startImmediately}
                        value={runTime}
                        onChange={(e) => setRunTime(e.target.value)}
                        className="w-full px-3 py-2.5 rounded-lg border border-gray-300 dark:bg-slate-900 dark:border-slate-600 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all text-sm animate-in fade-in slide-in-from-top-1"
                        />
                    )}
                    {startImmediately && (
                        <div className="p-2.5 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg text-sm text-indigo-700 dark:text-indigo-300 flex items-center gap-2 animate-in fade-in">
                            <BoltIcon className="w-4 h-4" />
                            <span>{t('schedules.form.immediate_warning')}</span>
                        </div>
                    )}
                  </div>

                  {action === 'command' && (
                    <div className="animate-in fade-in slide-in-from-top-2">
                      <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">{t('schedules.form.command')}</label>
                      <div className="relative">
                        <span className="absolute left-3 top-2.5 text-gray-400">/</span>
                        <input 
                          type="text" 
                          placeholder={t('schedules.form.placeholder_command')}
                          value={payload}
                          onChange={(e) => setPayload(e.target.value)}
                          className="w-full pl-6 px-3 py-2.5 rounded-lg border border-gray-300 dark:bg-slate-900 dark:border-slate-600 dark:text-white focus:ring-2 focus:ring-indigo-500 text-sm font-mono"
                        />
                      </div>
                    </div>
                  )}

                  <div className="flex items-center gap-4 pt-2">
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input 
                        type="checkbox" 
                        checked={isRepeat}
                        onChange={(e) => setIsRepeat(e.target.checked)}
                        className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 bg-gray-100 dark:bg-slate-700 border-gray-300 dark:border-slate-600"
                      />
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('schedules.form.repeat_every')}</span>
                    </label>
                    
                    {isRepeat && (
                      <div className="flex items-center gap-2 animate-in fade-in slide-in-from-left-2">
                        <input 
                          type="number" 
                          min="1"
                          value={interval}
                          onChange={(e) => setInterval(e.target.value)}
                          className="w-16 px-2 py-1 rounded-md border border-gray-300 dark:bg-slate-900 dark:border-slate-600 dark:text-white text-center text-sm"
                        />
                        <select 
                          value={unit}
                          onChange={(e) => setUnit(e.target.value)}
                          className="px-2 py-1 rounded-md border border-gray-300 dark:bg-slate-900 dark:border-slate-600 dark:text-white text-sm"
                        >
                          <option value="hours">{t('schedules.form.hours')}</option>
                          <option value="minutes">{t('schedules.form.minutes')}</option>
                        </select>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-6 flex justify-end">
                <button 
                  type="submit"
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2.5 rounded-xl text-sm font-semibold shadow-lg shadow-indigo-500/20 transition-all active:scale-95"
                >
                  {t('schedules.create')}
                </button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tasks List */}
      <div className="space-y-3">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
          </div>
        ) : schedules.length === 0 ? (
          <div className="text-center py-16 bg-gray-50 dark:bg-slate-800/50 rounded-2xl border-2 border-dashed border-gray-200 dark:border-slate-700">
            <ClockIcon className="w-12 h-12 mx-auto text-gray-300 dark:text-slate-600 mb-3" />
            <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">{t('schedules.list.empty_title')}</h3> {/* <--- TRANSLATED */}
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t('schedules.list.empty_desc')}</p> {/* <--- TRANSLATED */}
          </div>
        ) : (
          <div className="grid gap-3">
            {schedules.map((task) => {
              const style = getActionStyle(task.action);
              const nextRun = new Date(task.next_run_at);
              const isPast = nextRun < new Date();

              return (
                <motion.div 
                  key={task.id}
                  layout
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-gray-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-700 transition-colors shadow-sm flex flex-col sm:flex-row sm:items-center gap-4"
                >
                  {/* Icon */}
                  <div className={`p-3 rounded-xl ${style.color} shrink-0`}>
                    <style.icon className="w-6 h-6" />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="font-semibold text-gray-900 dark:text-gray-100 truncate">
                        {style.label}
                      </h4>
                      {task.is_repeat && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300">
                          <ArrowPathIcon className="w-3 h-3" />
                          {task.repeat_interval_minutes < 60 
                            ? `${task.repeat_interval_minutes}m` 
                            : `${parseFloat((task.repeat_interval_minutes / 60).toFixed(1))}h`}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-y-1 gap-x-4 text-sm text-gray-500 dark:text-gray-400">
                      {task.payload && (
                        <span className="font-mono bg-gray-100 dark:bg-slate-700 px-1.5 py-0.5 rounded text-xs truncate max-w-[200px]">
                          /{task.payload}
                        </span>
                      )}
                      <div className="flex items-center gap-1.5">
                        <CalendarDaysIcon className="w-4 h-4" />
                        <span title={format(nextRun, 'PPP p')}>
                          {isPast ? t('schedules.list.processing') : `${t('schedules.list.runs_prefix')} ${formatDistanceToNow(nextRun, { addSuffix: true })}`} {/* <--- TRANSLATED */}
                        </span>
                      </div>
                      {task.last_result && (
                         <span className={`text-xs ${task.last_result === 'Success' ? 'text-green-600' : 'text-red-500'}`}>
                           {t('schedules.list.last_result')} {task.last_result}
                         </span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 sm:ml-auto border-t sm:border-t-0 pt-3 sm:pt-0 border-gray-100 dark:border-slate-700">
                    <button 
                      onClick={() => handleDelete(task.id)}
                      className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                      title="Delete Schedule"
                    >
                      <TrashIcon className="w-5 h-5" />
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}