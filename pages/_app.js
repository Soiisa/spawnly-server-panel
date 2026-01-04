// pages/_app.js
import { useState, useEffect, createContext, useContext } from 'react';
import { appWithTranslation } from 'next-i18next';
import '../styles/globals.css';
import CookieBanner from '../components/CookieBanner';
import SupportWidget from '../components/SupportWidget'; // <--- IMPORT THIS

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

function App({ Component, pageProps }) {
  return (
    <DarkModeProvider>
      <Component {...pageProps} />
      <SupportWidget /> {/* <--- ADD THIS HERE */}
      <CookieBanner />
    </DarkModeProvider>
  );
}

export default appWithTranslation(App);