// pages/_app.js
import { useState, useEffect, createContext, useContext } from 'react';
import '../styles/globals.css';

// 1. Create Context
export const DarkModeContext = createContext();

// 2. Create Hook for easier consumption
export function useDarkMode() {
  return useContext(DarkModeContext);
}

// 3. Create Provider Component
function DarkModeProvider({ children }) {
  const [isDarkMode, setIsDarkMode] = useState(false);

  useEffect(() => {
    // Check local storage for theme preference
    const storedTheme = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    
    // Set initial state: stored preference OR system preference
    const initialDarkMode = storedTheme === 'dark' || (storedTheme === null && prefersDark);
    setIsDarkMode(initialDarkMode);
    
    // Apply class on initial load
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

  const contextValue = {
    isDarkMode,
    toggleDarkMode,
  };

  return (
    <DarkModeContext.Provider value={contextValue}>
      {children}
    </DarkModeContext.Provider>
  );
}

export default function App({ Component, pageProps }) {
  return (
    <DarkModeProvider>
      <Component {...pageProps} />
    </DarkModeProvider>
  );
}