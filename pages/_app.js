import { useEffect, useState, createContext, useContext } from 'react';
import { appWithTranslation } from 'next-i18next';
import { useRouter } from 'next/router';
import { ThemeProvider, useTheme } from 'next-themes'; // 1. Import next-themes
import { supabase } from '../lib/supabaseClient';
import '../styles/globals.css';
import CookieBanner from '../components/CookieBanner';
import SupportWidget from '../components/SupportWidget';

// 2. Keep the existing context and hook so other components don't crash
export const DarkModeContext = createContext();
export function useDarkMode() { return useContext(DarkModeContext); }

// 3. Create a Bridge Component
function DarkModeBridge({ children }) {
  const { theme, setTheme, resolvedTheme } = useTheme();
  
  // Map next-themes values to your existing isDarkMode boolean
  const isDarkMode = resolvedTheme === 'dark';
  
  const toggleDarkMode = () => {
    setTheme(isDarkMode ? 'light' : 'dark');
  };

  return (
    <DarkModeContext.Provider value={{ isDarkMode, toggleDarkMode }}>
      {children}
    </DarkModeContext.Provider>
  );
}

const ALLOWED_PAGES = ['/', '/terms', '/privacy', '/aup', '/imprint', '/refund-policy', '/login'];

function App({ Component, pageProps }) {
  const router = useRouter();
  const [isMaintenance, setIsMaintenance] = useState(false);
  const [loadingAuth, setLoadingAuth] = useState(true);

  useEffect(() => {
    const checkMaintenanceAndAdmin = async () => {
      const isMaintenanceEnabled = process.env.NEXT_PUBLIC_MAINTENANCE_MODE === 'true';

      if (!isMaintenanceEnabled || ALLOWED_PAGES.includes(router.pathname)) {
        setIsMaintenance(false);
        setLoadingAuth(false);
        return;
      }

      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData?.session?.user;

      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('is_admin')
          .eq('id', user.id)
          .maybeSingle();

        setIsMaintenance(!profile?.is_admin);
      } else {
        setIsMaintenance(true);
      }
      setLoadingAuth(false);
    };

    checkMaintenanceAndAdmin();
  }, [router.pathname]);

  return (
    // 4. Wrap everything in ThemeProvider
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <DarkModeBridge>
        {loadingAuth ? (
          <div className="min-h-screen bg-gray-50 dark:bg-slate-900 flex items-center justify-center">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-indigo-600 border-t-transparent"></div>
          </div>
        ) : isMaintenance ? (
          <div className="min-h-screen bg-gray-50 dark:bg-slate-900 flex flex-col items-center justify-center p-4">
            <div className="bg-white dark:bg-slate-800 p-8 rounded-2xl shadow-xl max-w-md w-full text-center border border-gray-200 dark:border-slate-700">
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">Under Maintenance</h1>
              <p className="text-gray-600 dark:text-gray-400 mb-6 leading-relaxed">
                We are currently performing scheduled maintenance. Please check back soon!
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
            <CookieBanner />
          </>
        )}
      </DarkModeBridge>
    </ThemeProvider>
  );
}

export default appWithTranslation(App);