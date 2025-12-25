import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabaseClient'; 
import { useTranslation } from 'next-i18next'; // <--- IMPORTED
import { 
  CommandLineIcon, 
  PaperAirplaneIcon, 
  TrashIcon, 
  PauseIcon, 
  PlayIcon, 
  ArrowDownCircleIcon, 
  StopCircleIcon 
} from '@heroicons/react/24/outline';

export default function ConsoleViewer({ server }) {
  const { t } = useTranslation('server'); // <--- INITIALIZED
  
  // --- State ---
  const logRef = useRef(null);
  const [lines, setLines] = useState([]);
  const [connected, setConnected] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [paused, setPaused] = useState(false);
  const [command, setCommand] = useState('');
  const [status, setStatus] = useState(t('console.status.connecting')); // <--- TRANSLATED INIT
  const [isSending, setIsSending] = useState(false);

  // --- Effects ---

  useEffect(() => {
    if (!server?.id) return;

    // Load initial console log
    const loadConsole = async () => {
      setStatus(t('console.status.fetching')); // <--- TRANSLATED
      const { data, error } = await supabase
        .from('server_console')
        .select('console_log')
        .eq('server_id', server.id)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Error loading console:', error);
        setStatus(t('console.status.error')); // <--- TRANSLATED
        return;
      }

      const logText = data?.console_log || '';
      if (logText) {
        setLines(logText.split('\n'));
      }
      setStatus(t('console.status.ready')); // <--- TRANSLATED
    };

    loadConsole();

    // Subscribe to realtime updates
    const channel = supabase
      .channel(`console:${server.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'server_console',
          filter: `server_id=eq.${server.id}`,
        },
        (payload) => {
          if (paused) return;
          
          if (payload.eventType === 'DELETE') {
            setLines([]);
            return;
          }
          
          const newLog = payload.new?.console_log || '';
          if (newLog) {
            setLines(newLog.split('\n'));
          }
        }
      )
      .subscribe((state) => {
        const isConnected = state === 'SUBSCRIBED';
        setConnected(isConnected);
        // <--- TRANSLATED STATUS
        setStatus(isConnected ? t('console.status.live') : t('console.status.connecting'));
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [server?.id, paused, t]); // Added 't'

  // Handle Auto-scroll
  useEffect(() => {
    if (autoScroll && logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [lines, autoScroll]);

  // Detect manual scroll
  const handleScroll = () => {
    if (!logRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = logRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
    
    if (!isAtBottom && autoScroll) {
      setAutoScroll(false);
    } else if (isAtBottom && !autoScroll) {
      setAutoScroll(true);
    }
  };

  // --- Actions ---

  const sendCommand = async (e) => {
    e?.preventDefault();
    if (!command.trim() || isSending) return;
    
    const cmdToSend = command.trim();
    setCommand(''); 
    setIsSending(true);
    
    setLines(prev => [...prev, `> ${cmdToSend}`]);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error(t('console.errors.no_session'));

      const resp = await fetch('/api/servers/rcon', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ 
          serverId: server.id, 
          command: cmdToSend 
        }),
      });
      
      const json = await resp.json();
      if (!resp.ok) throw new Error(json.error || t('console.errors.failed_send'));
      
      if (json.response) {
        setLines(prev => [...prev, json.response]);
      }
    } catch (err) {
      setLines(prev => [...prev, `[Error] ${err.message}`]);
    } finally {
      setIsSending(false);
      setAutoScroll(true);
    }
  };

  const clearConsole = () => {
    setLines([]);
  };

  // --- Render ---

  return (
    <div className="flex flex-col h-[600px] bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 overflow-hidden">
      
      {/* 1. Header & Toolbar */}
      <div className="bg-gray-50 dark:bg-slate-700 px-4 py-3 border-b border-gray-200 dark:border-slate-700 flex flex-col sm:flex-row justify-between items-center gap-3">
        
        {/* Title & Status */}
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className={`flex items-center justify-center w-8 h-8 rounded-lg ${connected ? 'bg-indigo-100 text-indigo-600' : 'bg-gray-200 text-gray-500 dark:bg-slate-600 dark:text-gray-300'}`}>
            <CommandLineIcon className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">{t('console.title')}</h3> {/* <--- TRANSLATED */}
            <div className="flex items-center gap-2">
              <span className={`relative flex h-2 w-2`}>
                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${connected ? 'bg-green-400' : 'bg-red-400'}`}></span>
                <span className={`relative inline-flex rounded-full h-2 w-2 ${connected ? 'bg-green-500' : 'bg-red-500'}`}></span>
              </span>
              <p className="text-xs text-gray-500 dark:text-gray-300 font-mono">{status}</p>
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          <button
            onClick={() => setAutoScroll(!autoScroll)}
            className={`p-2 rounded-md text-xs font-medium border transition-colors flex items-center gap-1.5
              ${autoScroll 
                ? 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-900/20 dark:border-indigo-600 dark:text-indigo-400' 
                : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50 dark:bg-slate-800 dark:text-gray-300 dark:border-slate-600 dark:hover:bg-slate-700'
              }`}
            title={t('console.controls.toggle_scroll')} // <--- TRANSLATED
          >
            {autoScroll ? <ArrowDownCircleIcon className="w-4 h-4" /> : <StopCircleIcon className="w-4 h-4" />}
            <span className="hidden sm:inline">{t('console.controls.auto_scroll')}</span> {/* <--- TRANSLATED */}
          </button>

          <button
            onClick={() => setPaused(!paused)}
            className={`p-2 rounded-md text-xs font-medium border transition-colors flex items-center gap-1.5
              ${paused 
                ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:border-amber-600 dark:text-amber-400' 
                : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50 dark:bg-slate-800 dark:text-gray-300 dark:border-slate-600 dark:hover:bg-slate-700'
              }`}
            title={paused ? t('console.controls.resume') : t('console.controls.pause')} // <--- TRANSLATED (tooltip logic)
          >
            {paused ? <PlayIcon className="w-4 h-4" /> : <PauseIcon className="w-4 h-4" />}
            <span className="hidden sm:inline">{paused ? t('console.controls.resume') : t('console.controls.pause')}</span> {/* <--- TRANSLATED */}
          </button>

          <button
            onClick={clearConsole}
            className="p-2 rounded-md text-xs font-medium border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-600 dark:text-gray-300 hover:text-red-600 hover:bg-red-50 hover:border-red-200 dark:hover:bg-red-900/20 dark:hover:border-red-600 transition-colors flex items-center gap-1.5"
            title={t('console.controls.clear')} // <--- TRANSLATED
          >
            <TrashIcon className="w-4 h-4" />
            <span className="hidden sm:inline">{t('console.controls.clear')}</span> {/* <--- TRANSLATED */}
          </button>
        </div>
      </div>

      {/* 2. Log Window */}
      <div 
        className="flex-1 bg-slate-950 p-4 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent"
        ref={logRef}
        onScroll={handleScroll}
      >
        <div className="font-mono text-xs sm:text-sm leading-relaxed font-normal">
          {lines.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-600 space-y-3 opacity-50">
              <CommandLineIcon className="w-12 h-12" />
              <p>{t('console.status.waiting')}</p> {/* <--- TRANSLATED */}
            </div>
          ) : (
            lines.map((line, i) => (
              <div key={i} className="break-words whitespace-pre-wrap hover:bg-slate-900/50 px-1 -mx-1 rounded">
                {line.includes('INFO') ? <span className="text-slate-300">{line}</span> :
                 line.includes('WARN') ? <span className="text-amber-400">{line}</span> :
                 line.includes('ERROR') || line.includes('Exception') ? <span className="text-red-400">{line}</span> :
                 line.startsWith('>') ? <span className="text-indigo-400 font-bold">{line}</span> :
                 <span className="text-slate-400">{line}</span>
                }
              </div>
            ))
          )}
          {autoScroll && <div className="h-1" />} 
        </div>
      </div>

      {/* 3. Input Area */}
      <div className="bg-white dark:bg-slate-800 border-t border-gray-200 dark:border-slate-700 p-3">
        <form onSubmit={sendCommand} className="relative flex items-center">
          <div className="absolute left-3 text-gray-400 dark:text-gray-500 select-none font-mono">{'>'}</div>
          <input
            type="text"
            className="w-full pl-7 pr-12 py-3 bg-gray-50 dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-lg text-sm font-mono text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent focus:bg-white dark:focus:bg-slate-700 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
            placeholder={t('console.input.placeholder')} // <--- TRANSLATED
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            disabled={!connected}
          />
          <button
            type="submit"
            disabled={!connected || !command.trim() || isSending}
            className="absolute right-2 p-1.5 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isSending ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <PaperAirplaneIcon className="w-4 h-4" />
            )}
          </button>
        </form>
        {!connected && (
          <p className="text-xs text-red-500 mt-2 ml-1">
            {t('console.input.disconnected')} {/* <--- TRANSLATED */}
          </p>
        )}
      </div>
    </div>
  );
}