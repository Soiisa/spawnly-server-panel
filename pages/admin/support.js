// pages/admin/support.js
import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { 
  ArrowLeftIcon, 
  MagnifyingGlassIcon, 
  PaperAirplaneIcon, 
  CheckCircleIcon,
  UserCircleIcon,
  PaperClipIcon,
  XMarkIcon,
  DocumentIcon
} from '@heroicons/react/24/outline';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';

export default function AdminSupport() {
  const [tickets, setTickets] = useState([]);
  const [filteredTickets, setFilteredTickets] = useState([]);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [messages, setMessages] = useState([]);
  const [reply, setReply] = useState('');
  const [statusFilter, setStatusFilter] = useState('Open');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);

  // Attachment State
  const [uploading, setUploading] = useState(false);
  const [attachments, setAttachments] = useState([]);
  const fileInputRef = useRef(null);
  
  const router = useRouter();

  const fetchTickets = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return router.push('/login');

    try {
      const res = await fetch(`/api/admin/support/tickets?status=${statusFilter === 'All' ? '' : statusFilter}`, {
        headers: { Authorization: `Bearer ${session.access_token}` }
      });
      
      if (res.ok) {
        const data = await res.json();
        setTickets(data);
      }
    } catch (err) {
      console.error('Failed to fetch tickets:', err);
    }
    setLoading(false);
  };

  const fetchMessages = async (ticketId) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    try {
      const res = await fetch(`/api/admin/support/messages?ticketId=${ticketId}`, {
        headers: { Authorization: `Bearer ${session.access_token}` }
      });
      if (res.ok) setMessages(await res.json());
    } catch (err) { console.error(err); }
  };

  useEffect(() => {
    setLoading(true);
    fetchTickets();
    const interval = setInterval(fetchTickets, 15000);
    return () => clearInterval(interval);
  }, [statusFilter]);

  useEffect(() => {
    if (!searchQuery) {
      setFilteredTickets(tickets);
    } else {
      const lowerQ = searchQuery.toLowerCase();
      setFilteredTickets(tickets.filter(t => 
        t.subject.toLowerCase().includes(lowerQ) || 
        t.user_email.toLowerCase().includes(lowerQ) ||
        t.id.includes(lowerQ)
      ));
    }
  }, [tickets, searchQuery]);

  useEffect(() => {
    if (selectedTicket) {
      fetchMessages(selectedTicket.id);
      const interval = setInterval(() => fetchMessages(selectedTicket.id), 5000);
      return () => clearInterval(interval);
    }
  }, [selectedTicket]);

  // File Upload Logic
  const handleFileSelect = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    setUploading(true);
    const newAttachments = [];

    for (const file of files) {
        const fileExt = file.name.split('.').pop();
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;
        const filePath = `${selectedTicket.id}/${fileName}`;

        const { error: uploadError } = await supabase.storage
            .from('support-attachments')
            .upload(filePath, file);

        if (uploadError) {
            console.error('Upload failed:', uploadError);
            alert(`Failed to upload ${file.name}`);
            continue;
        }

        const { data: { publicUrl } } = supabase.storage
            .from('support-attachments')
            .getPublicUrl(filePath);

        newAttachments.push({
            name: file.name,
            type: file.type,
            url: publicUrl
        });
    }

    setAttachments([...attachments, ...newAttachments]);
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeAttachment = (index) => {
    setAttachments(attachments.filter((_, i) => i !== index));
  };

  const sendAdminReply = async (e) => {
    e?.preventDefault();
    if (!reply.trim() && attachments.length === 0) return;
    
    const { data: { session } } = await supabase.auth.getSession();
    
    const tempMsg = {
        id: 'temp-' + Date.now(),
        message: reply,
        attachments: attachments,
        is_staff_reply: true,
        created_at: new Date().toISOString()
    };
    setMessages([...messages, tempMsg]);
    setReply('');
    setAttachments([]);

    await fetch('/api/support/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify({ 
            ticketId: selectedTicket.id, 
            message: tempMsg.message, 
            attachments: tempMsg.attachments,
            isAdminAction: true 
        })
    });
    
    fetchMessages(selectedTicket.id);
    fetchTickets(); 
  };

  const closeTicket = async () => {
    if (!confirm('Are you sure you want to close this ticket?')) return;
    const { data: { session } } = await supabase.auth.getSession();
    await fetch('/api/support/reply', { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify({ ticketId: selectedTicket.id, message: "Ticket closed by staff.", isAdminAction: true, statusOverride: 'Closed' })
    });
    fetchTickets();
    if (statusFilter !== 'Closed' && statusFilter !== 'All') setSelectedTicket(null);
  };

  const getInitials = (email) => email ? email.substring(0, 2).toUpperCase() : '??';

  const renderMessageAttachments = (fileList) => {
    if (!fileList || !Array.isArray(fileList) || fileList.length === 0) return null;
    return (
        <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-white/20 dark:border-slate-700/50">
            {fileList.map((file, idx) => (
                <a 
                    key={idx} 
                    href={file.url} 
                    target="_blank" 
                    rel="noreferrer"
                    className="block group relative overflow-hidden rounded-lg border border-white/30 dark:border-slate-600 bg-black/10 dark:bg-black/30 hover:bg-black/20 transition-colors"
                >
                    {file.type?.startsWith('image/') ? (
                        <img src={file.url} alt={file.name} className="h-16 w-16 object-cover" />
                    ) : (
                        <div className="h-16 w-16 flex flex-col items-center justify-center p-1 text-center">
                            <DocumentIcon className="w-6 h-6 opacity-70" />
                            <span className="text-[8px] truncate w-full mt-1 opacity-80">{file.name}</span>
                        </div>
                    )}
                </a>
            ))}
        </div>
    );
  };

  return (
    <div className="flex h-screen bg-slate-900 text-slate-100 font-sans overflow-hidden">
      
      {/* Sidebar */}
      <div className="w-96 flex flex-col border-r border-slate-800 bg-slate-950">
        <div className="p-5 border-b border-slate-800">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-xl font-bold tracking-tight text-white">Support Inbox</h1>
            <Link href="/admin" className="text-xs font-medium text-slate-400 hover:text-white flex items-center gap-1 transition-colors">
              <ArrowLeftIcon className="w-3 h-3"/> Exit
            </Link>
          </div>
          
          <div className="flex bg-slate-900 p-1 rounded-lg mb-4">
            {['Open', 'Ongoing', 'Closed', 'All'].map(tab => (
              <button
                key={tab}
                onClick={() => setStatusFilter(tab)}
                className={`flex-1 py-1.5 text-[10px] sm:text-xs font-medium rounded-md transition-all ${
                  statusFilter === tab 
                    ? 'bg-slate-800 text-white shadow-sm' 
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          <div className="relative">
            <MagnifyingGlassIcon className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
            <input 
              type="text" 
              placeholder="Search tickets..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-9 pr-4 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 transition-all placeholder:text-slate-600"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {loading ? (
             <div className="p-8 text-center text-slate-500 text-sm animate-pulse">Loading inbox...</div>
          ) : filteredTickets.length === 0 ? (
             <div className="p-8 text-center flex flex-col items-center">
                <div className="w-12 h-12 bg-slate-900 rounded-full flex items-center justify-center mb-3">
                    <CheckCircleIcon className="w-6 h-6 text-slate-600" />
                </div>
                <p className="text-slate-500 text-sm">No tickets found</p>
             </div>
          ) : (
            filteredTickets.map(t => (
                <div 
                    key={t.id} 
                    onClick={() => setSelectedTicket(t)}
                    className={`group px-5 py-4 border-b border-slate-800/50 cursor-pointer transition-all hover:bg-slate-900 ${
                      selectedTicket?.id === t.id ? 'bg-slate-900 border-l-2 border-l-indigo-500' : 'border-l-2 border-l-transparent'
                    }`}
                >
                    <div className="flex justify-between items-start mb-1">
                        <div className="flex items-center gap-2 overflow-hidden">
                           <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                               t.status === 'Open' ? 'bg-orange-500 animate-pulse' : 
                               t.status === 'Ongoing' ? 'bg-indigo-500' :
                               'bg-slate-600'
                           }`}></div>
                           <span className={`font-semibold text-sm truncate ${t.status === 'Closed' ? 'text-slate-400' : 'text-white'}`}>
                                {t.subject}
                           </span>
                        </div>
                        <span className="text-[10px] text-slate-500 whitespace-nowrap ml-2">
                           {new Date(t.updated_at).toLocaleDateString(undefined, {month:'short', day:'numeric'})}
                        </span>
                    </div>
                    
                    <p className="text-xs text-slate-400 truncate pl-4 mb-2">{t.user_email}</p>
                    
                    <div className="flex items-center gap-2 pl-4">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded border ${
                            t.priority === 'High' ? 'border-red-900/50 text-red-400 bg-red-900/10' : 
                            'border-slate-800 text-slate-500 bg-slate-900'
                        }`}>
                            {t.priority}
                        </span>
                        <span className="text-[10px] text-slate-600 uppercase tracking-wider font-medium">{t.category}</span>
                    </div>
                </div>
            ))
          )}
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 flex flex-col bg-slate-900">
        {selectedTicket ? (
            <>
                <header className="h-16 px-6 border-b border-slate-800 flex items-center justify-between bg-slate-900/50 backdrop-blur-sm z-10">
                    <div className="flex items-center gap-4">
                        <div className="h-10 w-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm shadow-lg shadow-indigo-900/20">
                            {getInitials(selectedTicket.user_email)}
                        </div>
                        <div>
                            <h2 className="font-bold text-slate-100 leading-tight">{selectedTicket.subject}</h2>
                            <div className="flex items-center gap-2 text-xs text-slate-400">
                                <span>{selectedTicket.user_email}</span>
                                <span className="w-1 h-1 bg-slate-600 rounded-full"></span>
                                <span className="font-mono text-slate-500">#{selectedTicket.id.slice(0,8)}</span>
                            </div>
                        </div>
                    </div>
                    
                    <div className="flex items-center gap-3">
                        {selectedTicket.status !== 'Closed' ? (
                            <button 
                                onClick={closeTicket} 
                                className="px-4 py-2 text-xs font-medium text-red-400 hover:text-red-300 hover:bg-red-900/20 rounded-lg transition-colors border border-red-900/30"
                            >
                                Close Ticket
                            </button>
                        ) : (
                            <span className="px-3 py-1 bg-slate-800 text-slate-400 text-xs rounded-full border border-slate-700">Closed</span>
                        )}
                    </div>
                </header>
                
                <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-900 scroll-smooth">
                    <div className="flex justify-center">
                        <span className="text-[10px] font-medium text-slate-600 bg-slate-800/50 px-3 py-1 rounded-full uppercase tracking-widest">
                            Start of conversation
                        </span>
                    </div>

                    {messages.map((m, i) => {
                        const isStaff = m.is_staff_reply;
                        const showAvatar = i === 0 || messages[i-1].is_staff_reply !== isStaff;
                        
                        return (
                            <div key={m.id} className={`flex gap-3 ${isStaff ? 'flex-row-reverse' : 'flex-row'}`}>
                                <div className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-bold ${showAvatar ? 'opacity-100' : 'opacity-0'} ${isStaff ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20' : 'bg-slate-700 text-slate-300'}`}>
                                    {isStaff ? 'SP' : getInitials(selectedTicket.user_email)}
                                </div>
                                
                                <div className={`flex flex-col max-w-[65%] ${isStaff ? 'items-end' : 'items-start'}`}>
                                    {showAvatar && (
                                        <span className="text-[10px] text-slate-500 mb-1 px-1">
                                            {isStaff ? 'Support Agent' : 'Customer'}
                                        </span>
                                    )}
                                    
                                    <div className={`px-4 py-3 text-sm shadow-sm leading-relaxed whitespace-pre-wrap break-words ${
                                        isStaff 
                                          ? 'bg-indigo-600 text-white rounded-2xl rounded-tr-sm' 
                                          : 'bg-slate-800 text-slate-200 border border-slate-700 rounded-2xl rounded-tl-sm'
                                    }`}>
                                        {m.message}
                                        {renderMessageAttachments(m.attachments)}
                                    </div>
                                    
                                    <span className={`text-[10px] text-slate-600 mt-1 px-1 ${isStaff ? 'text-right' : 'text-left'}`}>
                                        {new Date(m.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                    </span>
                                </div>
                            </div>
                        )
                    })}
                </div>

                {selectedTicket.status !== 'Closed' ? (
                    <div className="p-4 bg-slate-950 border-t border-slate-800">
                        {attachments.length > 0 && (
                            <div className="flex gap-2 mb-3 pb-3 border-b border-slate-800 overflow-x-auto">
                                {attachments.map((file, idx) => (
                                    <div key={idx} className="relative group bg-slate-800 rounded-lg p-2 border border-slate-700 flex items-center gap-2 min-w-[120px] max-w-[200px]">
                                        {file.type.startsWith('image/') ? (
                                            <img src={file.url} className="w-8 h-8 rounded object-cover" />
                                        ) : (
                                            <DocumentIcon className="w-8 h-8 text-slate-400" />
                                        )}
                                        <span className="text-xs truncate flex-1 text-slate-300">{file.name}</span>
                                        <button onClick={() => removeAttachment(idx)} className="text-slate-400 hover:text-red-500"><XMarkIcon className="w-4 h-4" /></button>
                                    </div>
                                ))}
                            </div>
                        )}

                        <form onSubmit={sendAdminReply} className="relative flex gap-2 items-end">
                            <input type="file" multiple ref={fileInputRef} className="hidden" onChange={handleFileSelect} />
                            <button 
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                disabled={uploading}
                                className="p-3 text-slate-400 hover:bg-slate-800 rounded-xl transition-colors disabled:opacity-50"
                            >
                                {uploading ? <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div> : <PaperClipIcon className="w-5 h-5" />}
                            </button>

                            <textarea 
                                className="flex-1 bg-slate-900 border border-slate-700 text-slate-200 text-sm rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none resize-none shadow-inner"
                                rows="1"
                                placeholder="Type your reply..."
                                value={reply}
                                onChange={(e) => setReply(e.target.value)}
                                onKeyDown={(e) => {
                                    if(e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        sendAdminReply();
                                    }
                                }}
                                style={{ minHeight: '50px' }}
                            />
                            <button 
                                type="submit"
                                disabled={(!reply.trim() && attachments.length === 0)}
                                className="p-3 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-600 text-white rounded-lg transition-all shadow-lg shadow-indigo-900/20"
                            >
                                <PaperAirplaneIcon className="w-5 h-5" />
                            </button>
                        </form>
                    </div>
                ) : (
                    <div className="p-6 bg-slate-950 border-t border-slate-800 text-center flex flex-col items-center justify-center gap-2">
                        <CheckCircleIcon className="w-8 h-8 text-slate-700" />
                        <p className="text-slate-500 text-sm font-medium">This ticket is closed</p>
                    </div>
                )}
            </>
        ) : (
            <div className="flex flex-col items-center justify-center h-full text-slate-500 bg-slate-900/50">
                <div className="w-20 h-20 bg-slate-800/50 rounded-full flex items-center justify-center mb-6 animate-pulse">
                    <UserCircleIcon className="w-10 h-10 opacity-50" />
                </div>
                <h3 className="text-lg font-medium text-slate-300">No Ticket Selected</h3>
                <p className="text-sm text-slate-500 mt-2 max-w-xs text-center">Select a ticket from the inbox on the left to view the conversation history and reply.</p>
            </div>
        )}
      </div>
    </div>
  );
}

export async function getStaticProps({ locale }) {
  return { props: { ...(await serverSideTranslations(locale, ['common'])) } };
}