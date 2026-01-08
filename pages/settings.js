// pages/settings.js
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabaseClient';
import { useTranslation } from 'next-i18next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import Link from 'next/link';
import ServersHeader from '../components/ServersHeader';
import ServersFooter from '../components/ServersFooter';
import { useDarkMode } from './_app';
import { 
  GlobeAltIcon, 
  MoonIcon, 
  SunIcon, 
  ShieldCheckIcon,
  UserCircleIcon // <--- ADDED
} from '@heroicons/react/24/outline';

export default function Settings() {
  const router = useRouter();
  const { t } = useTranslation('common');
  const { isDarkMode, toggleDarkMode } = useDarkMode();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [credits, setCredits] = useState(0);
  
  // --- NEW STATES ---
  const [username, setUsername] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [msg, setMsg] = useState('');

  // 1. Auth & Data Fetching
  useEffect(() => {
    const fetchSession = async () => {
      const { data, error } = await supabase.auth.getSession();
      if (!data.session) {
        router.push("/login");
      } else {
        setUser(data.session.user);
        
        // --- CHANGED: Select username AND credits ---
        const { data: profile } = await supabase
          .from('profiles')
          .select('credits, username')
          .eq('id', data.session.user.id)
          .single();
          
        if (profile) {
            setCredits(profile.credits);
            setUsername(profile.username || '');
            setNewUsername(profile.username || '');
        }
      }
      setLoading(false);
    };
    fetchSession();
  }, [router]);

  // --- NEW: Update Username Handler ---
  const handleUpdateUsername = async () => {
    if(!newUsername || newUsername.length < 3) return setMsg(t('settings.username_error'));
    setMsg(t('settings.updating'));
    
    try {
      // 1. Update Profile in DB
      const { error } = await supabase
        .from('profiles')
        .update({ username: newUsername })
        .eq('id', user.id);

      if(error) throw error;

      // 2. Update Auth Metadata (so header updates without relogin)
      const { error: authError } = await supabase.auth.updateUser({
        data: { username: newUsername }
      });
      
      if(authError) throw authError;

      setUsername(newUsername);
      setMsg(t('settings.success'));
      
      // Refresh page to propagate changes if needed
      router.reload();

    } catch (e) {
      setMsg(t('settings.error_generic') + ': ' + e.message);
    }
  };

  const handleLanguageChange = (e) => {
    const newLocale = e.target.value;
    const { pathname, asPath, query } = router;
    router.push({ pathname, query }, asPath, { locale: newLocale });
  };

  if (loading) return null;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900 font-sans text-slate-900 dark:text-gray-100 pb-20">
       <ServersHeader user={user} credits={credits} isLoading={false} onLogout={() => supabase.auth.signOut()} />
       
       <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <h1 className="text-3xl font-bold mb-8">{t('settings.title', 'User Settings')}</h1>
          
          <div className="grid gap-6">

            {/* --- NEW: Profile Settings --- */}
            <div className="bg-white dark:bg-slate-800 shadow-sm rounded-2xl p-6 border border-gray-200 dark:border-slate-700">
                <div className="flex items-center gap-4 mb-6">
                    <div className="p-3 bg-blue-50 dark:bg-blue-900/20 text-blue-600 rounded-xl">
                        <UserCircleIcon className="w-6 h-6" />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold">{t('settings.profile', 'Profile')}</h2>
                        <p className="text-gray-500 dark:text-gray-400 text-sm">{t('settings.profile_desc', 'Manage your public profile')}</p>
                    </div>
                </div>

                <div className="max-w-xs">
                    <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">
                        {t('settings.username', 'Username')}
                    </label>
                    <div className="flex gap-2">
                        <input 
                            type="text" 
                            value={newUsername}
                            onChange={(e) => setNewUsername(e.target.value)}
                            className="block w-full rounded-lg border-gray-300 dark:border-slate-600 bg-gray-50 dark:bg-slate-700 text-gray-900 dark:text-white shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2.5"
                        />
                        <button 
                            onClick={handleUpdateUsername}
                            className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
                        >
                            {t('settings.save', 'Save')}
                        </button>
                    </div>
                    {msg && <p className={`text-xs mt-2 ${msg.includes('Success') ? 'text-green-500' : 'text-indigo-500'}`}>{msg}</p>}
                </div>
            </div>
            
            {/* Language Settings */}
            <div className="bg-white dark:bg-slate-800 shadow-sm rounded-2xl p-6 border border-gray-200 dark:border-slate-700">
                <div className="flex items-center gap-4 mb-6">
                    <div className="p-3 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 rounded-xl">
                        <GlobeAltIcon className="w-6 h-6" />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold">{t('settings.language', 'Language')}</h2>
                        <p className="text-gray-500 dark:text-gray-400 text-sm">{t('settings.language_desc', 'Select your preferred language')}</p>
                    </div>
                </div>

                <select 
                    value={router.locale} 
                    onChange={handleLanguageChange}
                    className="w-full max-w-xs block rounded-lg border-gray-300 dark:border-slate-600 bg-gray-50 dark:bg-slate-700 text-gray-900 dark:text-white shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2.5"
                >
                    {router.locales.map((locale) => (
                        <option key={locale} value={locale}>
                            {locale.toUpperCase()}
                        </option>
                    ))}
                </select>
            </div>

            {/* Appearance */}
             <div className="bg-white dark:bg-slate-800 shadow-sm rounded-2xl p-6 border border-gray-200 dark:border-slate-700 flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-purple-50 dark:bg-purple-900/20 text-purple-600 rounded-xl">
                        {isDarkMode ? <MoonIcon className="w-6 h-6" /> : <SunIcon className="w-6 h-6" />}
                    </div>
                    <div>
                        <h2 className="text-xl font-bold">{t('settings.appearance', 'Appearance')}</h2>
                        <p className="text-gray-500 dark:text-gray-400 text-sm">{t('settings.appearance_desc', 'Toggle dark mode')}</p>
                    </div>
                </div>
                
                <button
                    onClick={toggleDarkMode}
                    className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${isDarkMode ? 'bg-indigo-600' : 'bg-gray-200'}`}
                >
                    <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${isDarkMode ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
            </div>

            {/* Security */}
             <div className="bg-white dark:bg-slate-800 shadow-sm rounded-2xl p-6 border border-gray-200 dark:border-slate-700">
                <div className="flex items-center gap-4 mb-6">
                    <div className="p-3 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 rounded-xl">
                        <ShieldCheckIcon className="w-6 h-6" />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold">{t('settings.security', 'Security')}</h2>
                        <p className="text-gray-500 dark:text-gray-400 text-sm">{t('settings.security_desc', 'Manage your password and account security')}</p>
                    </div>
                </div>

                <Link href="/update-password">
                    <button className="bg-white dark:bg-slate-700 text-gray-700 dark:text-gray-200 border border-gray-300 dark:border-slate-600 font-semibold py-2 px-4 rounded-lg shadow-sm hover:bg-gray-50 dark:hover:bg-slate-600 transition-all">
                        {t('settings.change_password', 'Change Password')}
                    </button>
                </Link>
            </div>

          </div>
       </main>

       <ServersFooter />
    </div>
  )
}

// Ensure translations are loaded
export async function getStaticProps({ locale }) {
  return {
    props: {
      ...(await serverSideTranslations(locale, ['common'])),
    },
  };
}