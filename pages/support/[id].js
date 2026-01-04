// pages/support/[id].js
import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useRouter } from 'next/router';
import ServersHeader from '../../components/ServersHeader';
import ServersFooter from '../../components/ServersFooter';
import { PaperAirplaneIcon, LockClosedIcon, CheckCircleIcon } from '@heroicons/react/24/solid';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';

export default function TicketDetail() {
  const router = useRouter();
  const { id } = router.query;
  const [user, setUser] = useState(null);
  const [ticket, setTicket] = useState(null);
  const [messages, setMessages] = useState([]);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  useEffect(() => {
    if (!id) return;
    const fetchTicket = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return router.push('/login');
      setUser(session.user);

      const { data: tData } = await supabase.from('support_tickets').select('*').eq('id', id).single();
      if (tData) setTicket(tData);

      const { data: mData } = await supabase.from('support_messages').select('*').eq('ticket_id', id).order('created_at', { ascending: true });
      if (mData) setMessages(mData);
    };

    fetchTicket();

    const channel = supabase
      .channel(`ticket-${id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'support_messages', filter: `ticket_id=eq.${id}` }, (payload) => {
        setMessages((prev) => [...prev, payload.new]);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'support_tickets', filter: `id=eq.${id}` }, (payload) => {
        setTicket(payload.new);
      })
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [id, router]);

  const sendReply = async (e) => {
    e.preventDefault();
    if (!reply.trim()) return;
    setSending(true);

    const { data: { session } } = await supabase.auth.getSession();
    await fetch('/api/support/reply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
      body: JSON.stringify({ ticketId: id, message: reply })
    });

    setReply('');
    setSending(false);
  };

  const markResolved = async () => {
    if(!confirm("Are you sure you want to close this ticket?")) return;
    setSending(true);
    const { data: { session } } = await supabase.auth.getSession();
    
    await fetch('/api/support/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify({ 
            ticketId: id, 
            message: "Ticket marked as resolved by customer.", 
            statusOverride: 'Closed'
        })
    });
    setSending(false);
  };

  if (!ticket) return <div className="min-h-screen bg-gray-50 dark:bg-slate-950 flex items-center justify-center text-gray-500">Loading conversation...</div>;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-950 flex flex-col font-sans">
      <ServersHeader user={user} credits={0} />
      
      <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-8 flex flex-col h-[calc(100vh-64px)]">
        
        {/* Ticket Header */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-t-2xl border border-gray-200 dark:border-slate-800 shadow-sm z-10 flex flex-col sm:flex-row justify-between items-start gap-4">
            <div className="flex-1">
                <h1 className="text-xl font-bold text-gray-900 dark:text-white leading-tight">{ticket.subject}</h1>
                <div className="flex items-center gap-3 mt-2 text-xs text-gray-500 dark:text-gray-400">
                    <span className="bg-gray-100 dark:bg-slate-800 px-2 py-0.5 rounded text-gray-600 dark:text-gray-300 font-medium">#{id.slice(0,8)}</span>
                    <span>•</span>
                    <span>{ticket.category}</span>
                </div>
            </div>
            
            <div className="flex items-center gap-3">
                {ticket.status !== 'Closed' && (
                    <button 
                        onClick={markResolved}
                        disabled={sending}
                        className="flex items-center gap-2 px-4 py-2 bg-green-50 dark:bg-green-900/10 text-green-600 dark:text-green-400 border border-green-200 dark:border-green-800/30 rounded-lg text-sm font-medium hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors"
                    >
                        <CheckCircleIcon className="w-4 h-4" />
                        Mark as Resolved
                    </button>
                )}
                
                <div className={`px-4 py-1.5 rounded-full text-xs font-bold border flex items-center gap-2 shadow-sm ${
                    ticket.status === 'Open' ? 'bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-400 border-orange-200 dark:border-orange-800' :
                    ticket.status === 'Closed' ? 'bg-gray-100 dark:bg-slate-800 text-gray-400 dark:text-gray-500 border-gray-200 dark:border-slate-700' :
                    'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800'
                }`}>
                    <span className={`w-2 h-2 rounded-full ${
                        ticket.status === 'Open' ? 'bg-orange-500 animate-pulse' : 
                        ticket.status === 'Closed' ? 'bg-gray-400' : 
                        'bg-indigo-500'
                    }`}></span>
                    {ticket.status === 'Open' ? 'Waiting for Staff' : ticket.status}
                </div>
            </div>
        </div>

        {/* Chat Area */}
        <div 
          ref={scrollRef}
          className="flex-1 bg-gray-100 dark:bg-slate-950 border-x border-gray-200 dark:border-slate-800 overflow-y-auto p-6 space-y-6 relative"
        >   
           <div className="absolute inset-0 opacity-[0.03] dark:opacity-[0.05] pointer-events-none" 
                style={{ backgroundImage: 'radial-gradient(#6366f1 1px, transparent 1px)', backgroundSize: '24px 24px' }}>
           </div>

           {messages.length === 0 && (
               <div className="text-center mt-10 text-sm text-gray-500 dark:text-gray-400 bg-white dark:bg-slate-900 inline-block px-4 py-2 rounded-full mx-auto shadow-sm border border-gray-200 dark:border-slate-800">
                   Ticket created. A support agent will respond shortly.
               </div>
           )}

           {messages.map((msg, i) => {
            const isMe = msg.user_id === user?.id;
            const isStaff = msg.is_staff_reply;
            const showAvatar = i === 0 || messages[i-1].user_id !== msg.user_id;
            
            return (
              <div key={msg.id} className={`flex gap-3 relative z-10 ${isMe ? 'justify-end' : 'justify-start'}`}>
                {!isMe && (
                   <div className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-bold shadow-md ${showAvatar ? 'opacity-100' : 'opacity-0'} ${isStaff ? 'bg-indigo-600 text-white' : 'bg-gray-300 text-gray-600'}`}>
                      {isStaff ? 'SP' : 'U'}
                   </div>
                )}

                <div className={`max-w-[85%] sm:max-w-[75%]`}>
                  {!isMe && showAvatar && (
                      <span className="text-[10px] ml-1 mb-1 block text-gray-500 dark:text-gray-400 font-medium">
                          {isStaff ? 'Support Team' : 'User'}
                      </span>
                  )}
                  <div className={`px-5 py-3 shadow-sm text-sm whitespace-pre-wrap leading-relaxed ${
                      isMe 
                      ? 'bg-indigo-600 text-white rounded-2xl rounded-tr-sm' 
                      : isStaff
                        ? 'bg-white dark:bg-slate-900 text-gray-800 dark:text-gray-100 border border-gray-200 dark:border-slate-700 rounded-2xl rounded-tl-sm'
                        : 'bg-white dark:bg-slate-900 text-gray-800 dark:text-gray-100 border border-gray-200 dark:border-slate-700 rounded-2xl'
                    }`}>
                    {msg.message}
                  </div>
                  <div className={`text-[10px] text-gray-400 mt-1 px-1 ${isMe ? 'text-right' : 'text-left'}`}>
                    {new Date(msg.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Input Area */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-b-2xl border border-gray-200 dark:border-slate-800 shadow-sm z-10">
          {ticket.status === 'Closed' ? (
            <div className="flex flex-col items-center justify-center py-4 text-gray-500 dark:text-gray-400">
                <LockClosedIcon className="w-6 h-6 mb-2 opacity-50" />
                <p className="text-sm">This conversation has been closed.</p>
            </div>
          ) : (
            <form onSubmit={sendReply} className="flex gap-3">
              <input 
                type="text" 
                className="flex-1 bg-gray-50 dark:bg-slate-950 border border-gray-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:text-white transition-all shadow-inner"
                placeholder="Type your message here..."
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                disabled={sending}
              />
              <button 
                type="submit" 
                disabled={sending || !reply.trim()}
                className="bg-indigo-600 hover:bg-indigo-700 text-white p-3 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md shadow-indigo-500/20"
              >
                <PaperAirplaneIcon className="w-5 h-5" />
              </button>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}

// --- FIX IS HERE: ADDED getStaticPaths ---
export async function getStaticPaths() {
  return {
    paths: [],
    fallback: 'blocking', // Allows pages to be generated on demand
  };
}

export async function getStaticProps({ locale }) {
  return { props: { ...(await serverSideTranslations(locale, ['common'])) } };
}