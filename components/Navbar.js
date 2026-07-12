// components/Navbar.js

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useTranslation } from 'next-i18next';
import { useTheme } from 'next-themes';

export default function Navbar() {
  const { t } = useTranslation('common');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Ensure hydration matches server rendering for the theme toggle
  useEffect(() => setMounted(true), []);

  return (
    <nav className="w-full bg-white/80 dark:bg-slate-950/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800/50 sticky top-0 z-50 transition-colors duration-300">
      <div className="w-full px-6 md:px-12 lg:px-24 h-20 flex items-center justify-between">
        
        {/* Brand / Logo */}
        <Link href="/" className="flex items-center gap-3 group">
          <img 
            src="/logo.png" 
            alt="Spawnly Logo" 
            className="h-9 w-auto object-contain transition-transform group-hover:scale-105"
            onError={(e) => { e.target.src = '/logo.png'; }} // Fallback if v3 is missing
          />
          <span className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">Spawnly</span>
        </Link>

        {/* Desktop Navigation */}
        <div className="hidden md:flex items-center space-x-8">
          <Link href="/games" className="text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-white transition-colors">
            {t('nav.games', 'Games')}
          </Link>
          <Link href="/pricing" className="text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-white transition-colors">
            {t('nav.pricing', 'Pricing')}
          </Link>
          <Link href="/support" className="text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-white transition-colors">
            {t('nav.support', 'Support')}
          </Link>
        </div>

        {/* Desktop Actions & Theme Toggle */}
        <div className="hidden md:flex items-center space-x-6">
          
          {/* Dark Mode Toggle */}
          {mounted && (
            <button
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="p-2 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 focus:outline-none"
              aria-label="Toggle Dark Mode"
            >
              {theme === 'dark' ? (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg>
              )}
            </button>
          )}

          <Link href="/login" className="text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-white transition-colors">
            {t('nav.login', 'Sign In')}
          </Link>
          <Link href="/register" className="text-sm font-semibold px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors shadow-lg shadow-blue-600/20">
            {t('nav.register', 'Get Started')}
          </Link>
        </div>

        {/* Mobile Menu Toggle */}
        <button 
          className="md:hidden p-2 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white focus:outline-none"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {mobileMenuOpen ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>
      </div>

      {/* Mobile Menu Dropdown */}
      {mobileMenuOpen && (
        <div className="md:hidden w-full border-t border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-950 px-6 py-6 space-y-4 shadow-xl">
          <Link href="/games" className="block text-base font-medium text-slate-600 dark:text-slate-300 hover:text-blue-600 transition-colors">
            {t('nav.games', 'Games')}
          </Link>
          <Link href="/pricing" className="block text-base font-medium text-slate-600 dark:text-slate-300 hover:text-blue-600 transition-colors">
            {t('nav.pricing', 'Pricing')}
          </Link>
          <Link href="/support" className="block text-base font-medium text-slate-600 dark:text-slate-300 hover:text-blue-600 transition-colors">
            {t('nav.support', 'Support')}
          </Link>
          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex justify-between items-center">
            <Link href="/login" className="block text-base font-medium text-slate-600 dark:text-slate-300 hover:text-blue-600 transition-colors">
              {t('nav.login', 'Sign In')}
            </Link>
            
            {/* Mobile Theme Toggle */}
            {mounted && (
              <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} className="p-2 text-slate-500 dark:text-slate-400">
                {theme === 'dark' ? '☀️ Light Mode' : '🌙 Dark Mode'}
              </button>
            )}
          </div>
          <Link href="/register" className="block w-full text-center text-base font-semibold px-5 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors">
            {t('nav.register', 'Get Started')}
          </Link>
        </div>
      )}
    </nav>
  );
}