import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useRouter } from 'next/router';
import ServersHeader from '../../components/ServersHeader';
import ServersFooter from '../../components/ServersFooter';
import { useTranslation } from 'next-i18next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline'; // Imported Icon

export default function CreateTicket() {
  const router = useRouter();
  const { t } = useTranslation('support');
  const [user, setUser] = useState(null);
  const [servers, setServers] = useState([]);
  const [loading, setLoading] = useState(false);
  
  const [formData, setFormData] = useState({
    subject: '',
    category: 'General',
    priority: 'Medium',
    serverId: '',
    message: ''
  });

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return router.push('/login');
      setUser(session.user);
      
      const { data: servers } = await supabase.from('servers').select('id, name').eq('user_id', session.user.id);
      if (servers) setServers(servers);
    };
    init();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch('/api/support/create', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`
      },
      body: JSON.stringify(formData)
    });

    if (res.ok) {
      const { ticketId } = await res.json();
      router.push(`/support/${ticketId}`);
    } else {
      alert(t('create.error', { defaultValue: 'Failed to create ticket' }));
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900">
      <ServersHeader user={user} credits={0} />
      <main className="max-w-3xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold mb-6 text-gray-900 dark:text-white">{t('create.title', { defaultValue: 'Create Support Ticket' })}</h1>
        
        {/* --- LANGUAGE DISCLAIMER --- */}
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4 mb-6 flex items-start gap-3">
          <ExclamationTriangleIcon className="w-5 h-5 text-amber-600 dark:text-amber-500 mt-0.5 flex-shrink-0" />
          <div>
            <h3 className="text-sm font-semibold text-amber-800 dark:text-amber-400">Language Policy</h3>
            <p className="text-sm text-amber-700 dark:text-amber-500/90 mt-1">
              Support is strictly provided in <strong>English</strong> or <strong>Portuguese</strong>. Tickets submitted in other languages may be closed without a response.
            </p>
          </div>
        </div>
        
        <form onSubmit={handleSubmit} className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-gray-200 dark:border-slate-700 space-y-6">
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">{t('create.category', { defaultValue: 'Category' })}</label>
              <select 
                className="w-full p-2 rounded-lg border border-gray-300 dark:border-slate-600 bg-transparent dark:text-white"
                value={formData.category}
                onChange={(e) => setFormData({...formData, category: e.target.value})}
              >
                <option value="General">{t('categories.general', { defaultValue: 'General Inquiry' })}</option>
                <option value="Technical">{t('categories.technical', { defaultValue: 'Technical Issue' })}</option>
                <option value="Billing">{t('categories.billing', { defaultValue: 'Billing' })}</option>
                <option value="Feature Request">{t('categories.feature_request', { defaultValue: 'Feature Request' })}</option>
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">{t('create.related_server', { defaultValue: 'Related Server (Optional)' })}</label>
              <select 
                className="w-full p-2 rounded-lg border border-gray-300 dark:border-slate-600 bg-transparent dark:text-white"
                value={formData.serverId}
                onChange={(e) => setFormData({...formData, serverId: e.target.value})}
              >
                <option value="">{t('create.none', { defaultValue: 'None' })}</option>
                {servers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">{t('create.subject', { defaultValue: 'Subject' })}</label>
            <input 
              type="text" 
              required
              className="w-full p-2 rounded-lg border border-gray-300 dark:border-slate-600 bg-transparent dark:text-white"
              value={formData.subject}
              onChange={(e) => setFormData({...formData, subject: e.target.value})}
              placeholder={t('create.subject_placeholder', { defaultValue: 'Brief description of the issue' })}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">{t('create.message', { defaultValue: 'Message' })}</label>
            <textarea 
              required
              rows={6}
              className="w-full p-2 rounded-lg border border-gray-300 dark:border-slate-600 bg-transparent dark:text-white"
              value={formData.message}
              onChange={(e) => setFormData({...formData, message: e.target.value})}
              placeholder={t('create.message_placeholder', { defaultValue: 'Describe your issue in detail...' })}
            />
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <button type="button" onClick={() => router.back()} className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg">{t('actions.cancel', { defaultValue: 'Cancel' })}</button>
            <button 
              type="submit" 
              disabled={loading}
              className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium disabled:opacity-50"
            >
              {loading ? t('create.creating', { defaultValue: 'Creating...' }) : t('create.submit', { defaultValue: 'Submit Ticket' })}
            </button>
          </div>
        </form>
      </main>
      <ServersFooter />
    </div>
  );
}

export async function getStaticProps({ locale }) {
  return { props: { ...(await serverSideTranslations(locale, ['common', 'support'])) } };
}