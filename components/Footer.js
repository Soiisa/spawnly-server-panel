import React from 'react';
import Link from 'next/link';
import { useTranslation } from 'next-i18next';

export default function Footer() {
  const { t } = useTranslation('common');

  return (
    <footer className="w-full bg-slate-100 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800/50 pt-20 pb-10 mt-auto transition-colors duration-300">
      <div className="w-full px-6 md:px-12 lg:px-24">
        
        {/* Top Section */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-16">
          <div className="col-span-1 md:col-span-2">
            <Link href="/" className="flex items-center gap-3 mb-6 group">
              <img 
                src="/logo.png" 
                alt="Spawnly Logo" 
                className="h-9 w-auto object-contain transition-transform group-hover:scale-105 filter dark:brightness-100 brightness-0" // Use brightness-0 in light mode if the logo is white text
                onError={(e) => { e.target.src = '/logo.png'; }}
              />
              <span className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">Spawnly</span>
            </Link>
            <p className="text-slate-600 dark:text-slate-400 text-sm leading-relaxed max-w-sm">
              {t('footer.description', 'Premium containerized game server hosting. Built for absolute control, unmatched performance, and fair hourly billing.')}
            </p>
          </div>
          
          <div>
            <h3 className="text-slate-900 dark:text-white font-semibold tracking-wide mb-6">{t('footer.platform', 'Platform')}</h3>
            <ul className="space-y-4">
              <li>
                <Link href="/pricing" className="text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                  {t('footer.pricing', 'Pricing & Credits')}
                </Link>
              </li>
              <li>
                <Link href="/dashboard" className="text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                  {t('footer.dashboard', 'Client Dashboard')}
                </Link>
              </li>
              <li>
                <Link href="/support" className="text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                  {t('footer.support', 'Help Center')}
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-slate-900 dark:text-white font-semibold tracking-wide mb-6">{t('footer.legal', 'Legal')}</h3>
            <ul className="space-y-4">
              <li>
                <Link href="/terms" className="text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                  {t('footer.terms', 'Terms of Service')}
                </Link>
              </li>
              <li>
                <Link href="/privacy" className="text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                  {t('footer.privacy', 'Privacy Policy')}
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="border-t border-slate-200 dark:border-slate-800 pt-8 flex flex-col md:flex-row items-center justify-between">
          <p className="text-sm text-slate-500 dark:text-slate-500 mb-4 md:mb-0">
            &copy; {new Date().getFullYear()} Spawnly. {t('footer.rights', 'All rights reserved.')}
          </p>
        </div>

      </div>
    </footer>
  );
}