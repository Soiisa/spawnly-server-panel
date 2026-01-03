// pages/admin/support.js
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations'; // <--- IMPORT THIS

export default function AdminSupport() {
  const [tickets, setTickets] = useState([]);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [messages, setMessages] = useState([]);
  const [reply, setReply] = useState('');
  const [statusFilter, setStatusFilter] = useState('Open');
  const [loading, setLoading] = useState(true);
  
  const router = useRouter();

  // 1. Fetch Tickets via API
  const fetchTickets = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return router.push('/login');

    try {
      const res = await fetch(`/api/admin/support/tickets?status=${statusFilter}`, {
        headers: { Authorization: `Bearer ${session.access_token}` }
      });
      
      if (res.ok) {
        const data = await res.json();
        setTickets(data);
      } else {
        console.error("API Error fetching tickets:", res.status);
      }
    } catch (err) {
      console.error('Failed to fetch tickets:', err);
    }
    setLoading(false);
  };

  // 2. Fetch Messages via API
  const fetchMessages = async (ticketId) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    try {
      const res = await fetch(`/api/admin/support/messages?ticketId=${ticketId}`, {
        headers: { Authorization: `Bearer ${session.access_token}` }
      });
      
      if (res.ok) {
        const data = await res.json();
        setMessages(data);
      }
    } catch (err) {
      console.error('Failed to fetch messages:', err);
    }
  };

  // Initial Load & Polling
  useEffect(() => {
    fetchTickets();
    const interval = setInterval(fetchTickets, 10000);
    return () => clearInterval(interval);
  }, [statusFilter]);

  // Load Messages when ticket selected
  useEffect(() => {
    if (selectedTicket) {
        fetchMessages(selectedTicket.id);
        const msgInterval = setInterval(() => fetchMessages(selectedTicket.id), 5000);
        return () => clearInterval(msgInterval);
    }
  }, [selectedTicket]);

  const sendAdminReply = async () => {
    if (!reply.trim()) return;
    
    const { data: { session } } = await supabase.auth.getSession();
    
    // Optimistic Update
    const newMessage = {
        id: 'temp-' + Date.now(),
        message: reply,
        is_staff_reply: true,
        created_at: new Date().toISOString()
    };
    setMessages([...messages, newMessage]);
    setReply('');

    await fetch('/api/support/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify({ ticketId: selectedTicket.id, message: newMessage.message, isAdminAction: true })
    });
    
    fetchMessages(selectedTicket.id);
    fetchTickets(); 
  };

  const closeTicket = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    
    await fetch('/api/support/reply', { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify({ ticketId: selectedTicket.id, message: "[Ticket Closed by Admin]", isAdminAction: true, statusOverride: 'Closed' })
    });
    
    setSelectedTicket(null);
    fetchTickets();
  };

  return (
    <div className="min-h-screen bg-slate-900 text-white flex font-sans">
      {/* Sidebar List */}
      <div className="w-1/3 border-r border-slate-800 flex flex-col bg-slate-950">
        <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-950">
          <Link href="/admin" className="text-slate-400 hover:text-white flex items-center gap-2 text-sm">
            <ArrowLeftIcon className="w-4 h-4"/> Back
          </Link>
          <select 
            className="bg-slate-800 text-xs rounded border border-slate-700 p-1 text-slate-300 focus:ring-indigo-500"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="Open">Active Queue</option>
            <option value="Closed">Closed History</option>
            <option value="All">All Tickets</option>
          </select>
        </div>
        
        <div className="flex-1 overflow-y-auto">
          {loading ? (
             <div className="p-4 text-center text-slate-500 text-sm">Loading tickets...</div>
          ) : tickets.length === 0 ? (
             <div className="p-4 text-center text-slate-500 text-sm">No tickets found.</div>
          ) : (
            tickets.map(t => (
                <div 
                    key={t.id} 
                    onClick={() => setSelectedTicket(t)}
                    className={`p-4 border-b border-slate-800 cursor-pointer hover:bg-slate-900 transition-all ${selectedTicket?.id === t.id ? 'bg-slate-900 border-l-4 border-indigo-500 pl-3' : 'pl-4'}`}
                >
                    <div className="flex justify-between mb-1 items-start">
                        <span className={`font-semibold text-sm truncate w-2/3 ${t.status === 'Open' ? 'text-white' : 'text-slate-400'}`}>
                            {t.subject}
                        </span>
                        <span className={`text-[10px] px-2 py-0.5 rounded uppercase tracking-wider font-bold ${
                            t.status === 'Customer Reply' ? 'bg-indigo-900 text-indigo-200' : 
                            t.status === 'Open' ? 'bg-green-900 text-green-200' : 'bg-slate-800 text-slate-500'
                        }`}>
                            {t.status}
                        </span>
                    </div>
                    <div className="flex justify-between items-end mt-2">
                        <div className="flex flex-col">
                            <span className="text-xs text-slate-300 font-medium">{t.user_email}</span>
                            <span className="text-[10px] text-slate-500">ID: {t.id.slice(0,8)}</span>
                        </div>
                        <span className="text-[10px] text-slate-500">{new Date(t.updated_at).toLocaleDateString()}</span>
                    </div>
                </div>
            ))
          )}
        </div>
      </div>

      {/* Main Chat View */}
      <div className="flex-1 flex flex-col bg-slate-900">
        {selectedTicket ? (
            <>
                <div className="p-4 border-b border-slate-800 bg-slate-950 flex justify-between items-center shadow-sm z-10">
                    <div>
                        <h2 className="font-bold text-lg text-white">{selectedTicket.subject}</h2>
                        <div className="flex gap-3 text-xs text-slate-400 mt-1">
                            <span>User: <span className="text-slate-200">{selectedTicket.user_email}</span></span>
                            <span>•</span>
                            <span>Priority: <span className={`${selectedTicket.priority === 'High' ? 'text-red-400' : 'text-slate-200'}`}>{selectedTicket.priority}</span></span>
                            <span>•</span>
                            <span>Server ID: {selectedTicket.server_id ? selectedTicket.server_id.slice(0,8) : 'N/A'}</span>
                        </div>
                    </div>
                    {selectedTicket.status !== 'Closed' && (
                        <button 
                            onClick={closeTicket} 
                            className="bg-slate-800 hover:bg-red-900/30 text-slate-400 hover:text-red-400 px-4 py-2 rounded-lg text-sm border border-slate-700 hover:border-red-800 transition-colors"
                        >
                            Close Ticket
                        </button>
                    )}
                </div>
                
                <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-900">
                    {messages.map(m => (
                        <div key={m.id} className={`flex ${m.is_staff_reply ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[75%] shadow-md ${m.is_staff_reply ? 'bg-indigo-600 rounded-l-xl rounded-tr-xl' : 'bg-slate-800 rounded-r-xl rounded-tl-xl'} p-4 text-sm relative group`}>
                                <p className="whitespace-pre-wrap leading-relaxed text-slate-100">{m.message}</p>
                                <p className={`text-[10px] mt-2 opacity-50 ${m.is_staff_reply ? 'text-indigo-200' : 'text-slate-400'}`}>
                                    {new Date(m.created_at).toLocaleString()}
                                </p>
                            </div>
                        </div>
                    ))}
                </div>

                {selectedTicket.status !== 'Closed' ? (
                    <div className="p-4 bg-slate-950 border-t border-slate-800">
                        <div className="flex gap-4">
                            <textarea 
                                className="flex-1 bg-slate-900 border border-slate-700 rounded-xl p-3 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-white transition-all resize-none"
                                rows="3"
                                placeholder="Write a reply..."
                                value={reply}
                                onChange={(e) => setReply(e.target.value)}
                                onKeyDown={(e) => {
                                    if(e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        sendAdminReply();
                                    }
                                }}
                            />
                            <button 
                                onClick={sendAdminReply} 
                                className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 rounded-xl font-medium shadow-lg shadow-indigo-500/20 transition-all flex items-center justify-center h-auto"
                            >
                                Reply
                            </button>
                        </div>
                        <div className="text-[10px] text-slate-500 mt-2 text-center">
                            Press Enter to send, Shift+Enter for new line
                        </div>
                    </div>
                ) : (
                    <div className="p-6 bg-slate-950 border-t border-slate-800 text-center">
                        <p className="text-slate-500">This ticket is closed.</p>
                    </div>
                )}
            </>
        ) : (
            <div className="flex flex-col items-center justify-center h-full text-slate-600">
                <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mb-4">
                    <ArrowLeftIcon className="w-8 h-8 opacity-50" />
                </div>
                <p>Select a ticket from the queue to view details</p>
            </div>
        )}
      </div>
    </div>
  );
}

// THIS WAS MISSING AND CAUSED THE COOKIE BANNER ERROR
export async function getStaticProps({ locale }) {
  return {
    props: {
      ...(await serverSideTranslations(locale, ['common'])),
    },
  };
}