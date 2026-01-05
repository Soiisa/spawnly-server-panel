import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useRouter } from 'next/router';
import ServersHeader from '../../components/ServersHeader';
import { 
    PaperAirplaneIcon, 
    LockClosedIcon, 
    CheckCircleIcon, 
    PaperClipIcon, 
    XMarkIcon,
    DocumentIcon 
} from '@heroicons/react/24/solid';
import { useTranslation } from 'next-i18next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';

export default function TicketDetail() {
  const router = useRouter();
  const { t } = useTranslation('support');
  const { id } = router.query;
  const [user, setUser] = useState(null);
  const [credits, setCredits] = useState(0);
  const [ticket, setTicket] = useState(null);
  const [messages, setMessages] = useState([]);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  
  // File Upload State
  const [uploading, setUploading] = useState(false);
  const [attachments, setAttachments] = useState([]); 
  const fileInputRef = useRef(null);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, attachments]);

  useEffect(() => {
    if (!id) return;
    const fetchTicket = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return router.push('/login');
      setUser(session.user);

      const { data: profile } = await supabase.from('profiles').select('credits').eq('id', session.user.id).single();
      if (profile) setCredits(profile.credits);

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

  const handleFileSelect = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    setUploading(true);
    const newAttachments = [];

    for (const file of files) {
        const fileExt = file.name.split('.').pop();
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;
        const filePath = `${id}/${fileName}`;

        const { error: uploadError } = await supabase.storage
            .from('support-attachments')
            .upload(filePath, file);

        if (uploadError) {
            console.error('Upload failed:', uploadError);
            alert(t('detail.upload_failed', { name: file.name, defaultValue: `Failed to upload ${file.name}` }));
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

  const sendReply = async (e) => {
    e.preventDefault();
    if (!reply.trim() && attachments.length === 0) return;
    setSending(true);

    const { data: { session } } = await supabase.auth.getSession();
    await fetch('/api/support/reply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
      body: JSON.stringify({ 
          ticketId: id, 
          message: reply,
          attachments: attachments 
      })
    });

    setReply('');
    setAttachments([]);
    setSending(false);
  };

  const markResolved = async () => {
    if(!confirm(t('detail.confirm_close', { defaultValue: "Are you sure you want to close this ticket?" }))) return;
    setSending(true);
    const { data: { session } } = await supabase.auth.getSession();
    await fetch('/api/support/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify({ ticketId: id, message: "Ticket marked as resolved by customer.", statusOverride: 'Closed' })
    });
    setSending(false);
  };

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
                        <img src={file.url} alt={file.name} className="h-20 w-20 object-cover" />
                    ) : (
                        <div className="h-20 w-20 flex flex-col items-center justify-center p-2 text-center">
                            <DocumentIcon className="w-8 h-8 opacity-70" />
                            <span className="text-[10px] truncate w-full mt-1 opacity-80">{file.name}</span>
                        </div>
                    )}
                </a>
            ))}
        </div>
    );
  };

  if (!ticket) return <div className="min-h-screen bg-gray-50 dark:bg-slate-950 flex items-center justify-center text-gray-500">{t('detail.loading', { defaultValue: 'Loading conversation...' })}</div>;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-950 flex flex-col font-sans">
      <ServersHeader user={user} credits={credits} />
      
      <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-8 flex flex-col h-[calc(100vh-64px)]">
        <div className="bg-white dark:bg-slate-900 p-6 rounded-t-2xl border border-gray-200 dark:border-slate-800 shadow-sm z-10 flex flex-col sm:flex-row justify-between items-start gap-4">
            <div className="flex-1">
                <h1 className="text-xl font-bold text-gray-900 dark:text-white leading-tight">{ticket.subject}</h1>
                <div className="flex items-center gap-3 mt-2 text-xs text-gray-500 dark:text-gray-400">
                    <span className="bg-gray-100 dark:bg-slate-800 px-2 py-0.5 rounded text-gray-600 dark:text-gray-300 font-medium">#{id.slice(0,8)}</span>
                    <span>•</span>
                    <span>{t(`categories.${ticket.category.toLowerCase().replace(' ', '_')}`, { defaultValue: ticket.category })}</span>
                </div>
            </div>
            <div className="flex items-center gap-3">
                {ticket.status !== 'Closed' && (
                    <button onClick={markResolved} disabled={sending} className="flex items-center gap-2 px-4 py-2 bg-green-50 dark:bg-green-900/10 text-green-600 dark:text-green-400 border border-green-200 dark:border-green-800/30 rounded-lg text-sm font-medium hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors">
                        <CheckCircleIcon className="w-4 h-4" />
                        {t('detail.mark_resolved', { defaultValue: 'Mark as Resolved' })}
                    </button>
                )}
                <div className={`px-4 py-1.5 rounded-full text-xs font-bold border flex items-center gap-2 shadow-sm ${
                    ticket.status === 'Open' ? 'bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-400 border-orange-200 dark:border-orange-800' :
                    ticket.status === 'Closed' ? 'bg-gray-100 dark:bg-slate-800 text-gray-400 dark:text-gray-500 border-gray-200 dark:border-slate-700' :
                    'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800'
                }`}>
                    <span className={`w-2 h-2 rounded-full ${ticket.status === 'Open' ? 'bg-orange-500 animate-pulse' : ticket.status === 'Closed' ? 'bg-gray-400' : 'bg-indigo-500'}`}></span>
                    {ticket.status === 'Open' ? t('detail.waiting_staff', { defaultValue: 'Waiting for Staff' }) : t(`status.${ticket.status.toLowerCase().replace(' ', '_')}`, { defaultValue: ticket.status })}
                </div>
            </div>
        </div>

        <div ref={scrollRef} className="flex-1 bg-gray-100 dark:bg-slate-950 border-x border-gray-200 dark:border-slate-800 overflow-y-auto p-6 space-y-6 relative">   
           <div className="absolute inset-0 opacity-[0.03] dark:opacity-[0.05] pointer-events-none" style={{ backgroundImage: 'radial-gradient(#6366f1 1px, transparent 1px)', backgroundSize: '24px 24px' }}></div>
           
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
                  {!isMe && showAvatar && <span className="text-[10px] ml-1 mb-1 block text-gray-500 dark:text-gray-400 font-medium">{isStaff ? t('detail.support_team', { defaultValue: 'Support Team' }) : t('detail.user', { defaultValue: 'User' })}</span>}
                  <div className={`px-5 py-3 shadow-sm text-sm whitespace-pre-wrap leading-relaxed ${
                      isMe ? 'bg-indigo-600 text-white rounded-2xl rounded-tr-sm' : 
                      isStaff ? 'bg-white dark:bg-slate-900 text-gray-800 dark:text-gray-100 border border-gray-200 dark:border-slate-700 rounded-2xl rounded-tl-sm' : 
                      'bg-white dark:bg-slate-900 text-gray-800 dark:text-gray-100 border border-gray-200 dark:border-slate-700 rounded-2xl'
                    }`}>
                    {msg.message}
                    {renderMessageAttachments(msg.attachments)}
                  </div>
                  <div className={`text-[10px] text-gray-400 mt-1 px-1 ${isMe ? 'text-right' : 'text-left'}`}>{new Date(msg.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-b-2xl border border-gray-200 dark:border-slate-800 shadow-sm z-10 relative">
          
          {attachments.length > 0 && (
            <div className="flex gap-2 mb-3 pb-3 border-b border-gray-100 dark:border-slate-800 overflow-x-auto">
                {attachments.map((file, idx) => (
                    <div key={idx} className="relative group bg-gray-50 dark:bg-slate-800 rounded-lg p-2 border border-gray-200 dark:border-slate-700 flex items-center gap-2 min-w-[120px] max-w-[200px]">
                        {file.type.startsWith('image/') ? (
                            <img src={file.url} className="w-8 h-8 rounded object-cover" />
                        ) : (
                            <DocumentIcon className="w-8 h-8 text-gray-400" />
                        )}
                        <span className="text-xs truncate flex-1 dark:text-gray-300">{file.name}</span>
                        <button onClick={() => removeAttachment(idx)} className="text-gray-400 hover:text-red-500"><XMarkIcon className="w-4 h-4" /></button>
                    </div>
                ))}
            </div>
          )}

          {ticket.status === 'Closed' ? (
            <div className="flex flex-col items-center justify-center py-4 text-gray-500 dark:text-gray-400">
                <LockClosedIcon className="w-6 h-6 mb-2 opacity-50" />
                <p className="text-sm">{t('detail.closed_msg', { defaultValue: 'This conversation has been closed.' })}</p>
            </div>
          ) : (
            <form onSubmit={sendReply} className="flex gap-3 items-end">
              <input type="file" multiple ref={fileInputRef} className="hidden" onChange={handleFileSelect} />
              <button 
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="p-3 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-xl transition-colors disabled:opacity-50"
              >
                {uploading ? <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div> : <PaperClipIcon className="w-5 h-5" />}
              </button>
              
              <textarea 
                className="flex-1 bg-gray-50 dark:bg-slate-950 border border-gray-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:text-white transition-all shadow-inner resize-none max-h-32"
                placeholder={t('detail.type_placeholder', { defaultValue: 'Type your message here...' })}
                rows="1"
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                disabled={sending}
                style={{ minHeight: '46px' }}
              />
              <button 
                type="submit" 
                disabled={sending || (reply.trim().length === 0 && attachments.length === 0)}
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

export async function getStaticPaths() { return { paths: [], fallback: 'blocking' }; }
export async function getStaticProps({ locale }) { return { props: { ...(await serverSideTranslations(locale, ['common', 'support'])) } }; }