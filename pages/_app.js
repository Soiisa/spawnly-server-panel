// pages/_app.js
import { useState, useEffect, createContext, useContext } from 'react';
import { appWithTranslation } from 'next-i18next';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabaseClient';
import '../styles/globals.css';
import CookieBanner from '../components/CookieBanner';
import SupportWidget from '../components/SupportWidget';

export const DarkModeContext = createContext();

export function useDarkMode() {
  return useContext(DarkModeContext);
}

function DarkModeProvider({ children }) {
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [mounted, setMounted] = useState(false); 

  useEffect(() => {
    setMounted(true);

    const storedTheme = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const initialDarkMode = storedTheme === 'dark' || (storedTheme === null && prefersDark);
    setIsDarkMode(initialDarkMode);
    
    if (initialDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, []);

  const toggleDarkMode = () => {
    setIsDarkMode(prev => {
      const newMode = !prev;
      if (newMode) {
        document.documentElement.classList.add('dark');
        localStorage.setItem('theme', 'dark');
      } else {
        document.documentElement.classList.remove('dark');
        localStorage.setItem('theme', 'light');
      }
      return newMode;
    });
  };

  const contextValue = { isDarkMode, toggleDarkMode };

  if (!mounted) return <div style={{ visibility: 'hidden' }}></div>;

  return (
    <DarkModeContext.Provider value={contextValue}>
      {children}
    </DarkModeContext.Provider>
  );
}

// Routes that bypass maintenance (Include /login so admins can authenticate!)
const ALLOWED_PAGES = ['/', '/terms', '/privacy', '/aup', '/imprint', '/refund-policy', '/login'];

function App({ Component, pageProps }) {
  const router = useRouter();
  const [isMaintenance, setIsMaintenance] = useState(false);
  const [loadingAuth, setLoadingAuth] = useState(true);

  useEffect(() => {
    const checkMaintenanceAndAdmin = async () => {
      // --- NEW: Check environment variable for maintenance mode ---
      const isMaintenanceEnabled = process.env.NEXT_PUBLIC_MAINTENANCE_MODE === 'true';

      if (!isMaintenanceEnabled) {
        setIsMaintenance(false);
        setLoadingAuth(false);
        return;
      }
      // ------------------------------------------------------------

      // Allow public pages to bypass maintenance
      if (ALLOWED_PAGES.includes(router.pathname)) {
        setIsMaintenance(false);
        setLoadingAuth(false);
        return;
      }

      // If it's a restricted page, check authentication
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData?.session?.user;

      if (user) {
        // Fetch profile to verify if user is an admin
        const { data: profile } = await supabase
          .from('profiles')
          .select('is_admin') 
          .eq('id', user.id)
          .maybeSingle(); // Changed from single() to maybeSingle() to fix 406 Not Acceptable error

        if (profile?.is_admin) {
          setIsMaintenance(false); // Admin bypasses the maintenance block
        } else {
          setIsMaintenance(true);  // Normal users get blocked
        }
      } else {
        setIsMaintenance(true);    // Not logged in and not on public page gets blocked
      }
      setLoadingAuth(false);
    };

    checkMaintenanceAndAdmin();
  }, [router.pathname]);

  return (
    <DarkModeProvider>
      {loadingAuth ? (
        <div className="min-h-screen bg-gray-50 dark:bg-slate-900 flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-indigo-600 border-t-transparent"></div>
        </div>
      ) : isMaintenance ? (
        <div className="min-h-screen bg-gray-50 dark:bg-slate-900 flex flex-col items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 p-8 rounded-2xl shadow-xl max-w-md w-full text-center border border-gray-200 dark:border-slate-700">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">Under Maintenance</h1>
            <p className="text-gray-600 dark:text-gray-400 mb-6 leading-relaxed">
              We are currently performing scheduled maintenance to improve your experience. Our dashboard and servers are temporarily unavailable. Please check back soon!
            </p>
            <button 
              onClick={() => router.push('/')}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 px-6 rounded-lg transition-colors"
            >
              Return to Homepage
            </button>
          </div>
        </div>
      ) : (
        <>
          <Component {...pageProps} />
          <SupportWidget />
        </>
      )}
      {!isMaintenance && <CookieBanner />}
    </DarkModeProvider>
  );
}

export default appWithTranslation(App);