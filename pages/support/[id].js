import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useRouter } from 'next/router';
import ServersHeader from '../../components/ServersHeader';
import ServersFooter from '../../components/ServersFooter';
import { PaperAirplaneIcon, UserCircleIcon } from '@heroicons/react/24/solid';
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

  // Scroll to bottom on new message
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

    // Realtime Subscription
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

  if (!ticket) return <div className="min-h-screen bg-gray-50 dark:bg-slate-900 flex items-center justify-center">Loading...</div>;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900 flex flex-col">
      <ServersHeader user={user} credits={0} />
      
      <main className="flex-1 max-w-5xl mx-auto w-full px-4 py-6 flex flex-col h-[calc(100vh-64px)]">
        
        {/* Ticket Header */}
        <div className="bg-white dark:bg-slate-800 p-6 rounded-t-2xl border border-gray-200 dark:border-slate-700 border-b-0 shadow-sm z-10">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">{ticket.subject}</h1>
              <p className="text-sm text-gray-500 mt-1">Ticket ID: #{id.slice(0,8)} • Category: {ticket.category}</p>
            </div>
            <div className="text-right">
              <span className="px-3 py-1 rounded-full text-xs font-bold bg-indigo-100 text-indigo-800">
                {ticket.status}
              </span>
            </div>
          </div>
        </div>

        {/* Chat Area */}
        <div 
          ref={scrollRef}
          className="flex-1 bg-gray-100 dark:bg-slate-900 border-x border-gray-200 dark:border-slate-700 overflow-y-auto p-6 space-y-6"
        >
          {messages.map((msg) => {
            const isMe = msg.user_id === user?.id;
            const isStaff = msg.is_staff_reply;
            
            return (
              <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] ${isMe ? 'bg-indigo-600 text-white' : isStaff ? 'bg-amber-100 text-amber-900 border border-amber-200' : 'bg-white dark:bg-slate-800 text-gray-800 dark:text-gray-200'} rounded-2xl px-5 py-3 shadow-sm relative`}>
                  {isStaff && (
                    <span className="absolute -top-3 -left-2 bg-amber-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                      Staff Support
                    </span>
                  )}
                  <p className="whitespace-pre-wrap text-sm">{msg.message}</p>
                  <p className={`text-[10px] mt-2 text-right opacity-70`}>
                    {new Date(msg.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Input Area */}
        <div className="bg-white dark:bg-slate-800 p-4 rounded-b-2xl border border-gray-200 dark:border-slate-700 shadow-sm">
          {ticket.status === 'Closed' ? (
            <p className="text-center text-gray-500 text-sm">This ticket is closed. Please create a new ticket for further assistance.</p>
          ) : (
            <form onSubmit={sendReply} className="flex gap-4">
              <input 
                type="text" 
                className="flex-1 bg-gray-50 dark:bg-slate-900 border border-gray-300 dark:border-slate-600 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:text-white"
                placeholder="Type your reply..."
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                disabled={sending}
              />
              <button 
                type="submit" 
                disabled={sending}
                className="bg-indigo-600 hover:bg-indigo-700 text-white p-3 rounded-xl disabled:opacity-50 transition-all"
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

export async function getStaticProps({ locale }) {
  return { props: { ...(await serverSideTranslations(locale, ['common'])) } };
}
export async function getStaticPaths() { return { paths: [], fallback: 'blocking' }; }