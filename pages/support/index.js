import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useRouter } from 'next/router';
import Link from 'next/link';
import ServersHeader from '../../components/ServersHeader';
import ServersFooter from '../../components/ServersFooter';
import { useTranslation } from 'next-i18next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import { PlusIcon, InboxIcon, ChevronRightIcon, LanguageIcon } from '@heroicons/react/24/outline'; // Added LanguageIcon

export default function SupportDashboard() {
  const router = useRouter();
  const { t } = useTranslation('support'); 
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [credits, setCredits] = useState(0);

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return router.push('/login');
      setUser(session.user);
      
      const { data: profile } = await supabase.from('profiles').select('credits').eq('id', session.user.id).single();
      if (profile) setCredits(profile.credits);

      const { data: ticketData } = await supabase
        .from('support_tickets')
        .select('*')
        .order('updated_at', { ascending: false });
        
      if (ticketData) setTickets(ticketData);
      setLoading(false);
    };
    init();
  }, []);

    const getStatusBadge = (status) => {
        const styles = {
        'Open': 'bg-gray-100 text-gray-600 dark:bg-slate-800 dark:text-slate-400 border-gray-200 dark:border-slate-700',
        'Ongoing': 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800',
        'Customer Reply': 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 border-green-200 dark:border-green-800',
        'Closed': 'bg-gray-100 text-gray-800 dark:bg-slate-800 dark:text-gray-400 border-gray-200 dark:border-slate-700'
        };
        const translatedStatus = t(`status.${status.toLowerCase().replace(' ', '_')}`, { defaultValue: status });
        
        return (
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${styles[status] || styles['Closed']}`}>
                {translatedStatus}
            </span>
        );
    };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-950 flex flex-col">
      <ServersHeader user={user} credits={credits} />
      
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-12">
        <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight">{t('dashboard.title', { defaultValue: 'Support Center' })}</h1>
            <p className="text-gray-500 dark:text-gray-400 mt-1">{t('dashboard.subtitle', { defaultValue: 'Manage your tickets and get help from our team.' })}</p>
          </div>
          <Link 
            href="/support/create"
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl font-medium transition-all shadow-lg shadow-indigo-500/20 active:scale-95"
          >
            <PlusIcon className="w-5 h-5" />
            {t('dashboard.new_ticket', { defaultValue: 'New Ticket' })}
          </Link>
        </div>

        {/* --- LANGUAGE DISCLAIMER --- */}
        <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-slate-900 border border-gray-200 dark:border-slate-800 p-3 rounded-lg mb-8 max-w-fit">
           <LanguageIcon className="w-4 h-4" />
           <span>Please write your tickets in <strong>English</strong> or <strong>Portuguese</strong> to ensure a response.</span>
        </div>

        {loading ? (
          <div className="space-y-4">
             {[1,2,3].map(i => <div key={i} className="h-24 bg-gray-200 dark:bg-slate-800 rounded-xl animate-pulse"></div>)}
          </div>
        ) : tickets.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 bg-white dark:bg-slate-900 rounded-3xl border border-dashed border-gray-300 dark:border-slate-800 text-center">
            <div className="w-16 h-16 bg-gray-100 dark:bg-slate-800 rounded-full flex items-center justify-center mb-4">
                <InboxIcon className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white">{t('dashboard.empty_title', { defaultValue: 'No tickets yet' })}</h3>
            <p className="text-gray-500 dark:text-gray-400 mt-2 max-w-sm mx-auto">{t('dashboard.empty_desc', { defaultValue: "You haven't created any support tickets yet. If you need help with your server or account, feel free to open one." })}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {tickets.map((ticket) => (
              <Link key={ticket.id} href={`/support/${ticket.id}`}>
                <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-gray-200 dark:border-slate-800 hover:border-indigo-500 dark:hover:border-indigo-500 hover:shadow-md transition-all group flex items-center justify-between">
                  <div className="flex-1 min-w-0 pr-4">
                    <div className="flex items-center gap-3 mb-1">
                        <h3 className="text-lg font-bold text-gray-900 dark:text-white truncate group-hover:text-indigo-600 transition-colors">
                            {ticket.subject}
                        </h3>
                        {getStatusBadge(ticket.status)}
                    </div>
                    <div className="flex items-center gap-3 text-sm text-gray-500 dark:text-gray-400">
                      <span className="font-mono">#{ticket.id.slice(0, 8)}</span>
                      <span className="w-1 h-1 bg-gray-300 dark:bg-slate-700 rounded-full"></span>
                      <span>{t(`categories.${ticket.category.toLowerCase().replace(' ', '_')}`, { defaultValue: ticket.category })}</span>
                      <span className="w-1 h-1 bg-gray-300 dark:bg-slate-700 rounded-full"></span>
                      <span>{t('dashboard.last_updated', { defaultValue: 'Last updated:' })} {new Date(ticket.updated_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <ChevronRightIcon className="w-5 h-5 text-gray-300 dark:text-slate-700 group-hover:text-indigo-500 transition-colors" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
      <ServersFooter />
    </div>
  );
}

export async function getStaticProps({ locale }) {
  return { props: { ...(await serverSideTranslations(locale, ['common', 'support'])) } };
}