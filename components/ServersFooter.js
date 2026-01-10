// components/ServersFooter.js
import Link from 'next/link';
import { useTranslation } from 'next-i18next'; // <--- IMPORTED

export default function Footer() {
  const { t } = useTranslation('common'); // <--- INITIALIZED

  return (
    <footer className="fixed bottom-0 left-0 w-full z-50 border-t border-gray-200 dark:border-slate-700 bg-white/95 dark:bg-slate-800/95 backdrop-blur-sm py-4 transition-colors duration-300 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
      {/* CHANGED: max-w-7xl -> w-full */}
      <div className="w-full mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row justify-between items-center gap-4">
        
        {/* Copyright */}
        <p className="text-sm text-gray-500 dark:text-gray-400">
          &copy; {new Date().getFullYear()} {t('brand')}. {t('footer.rights')}
        </p>

        {/* Legal Navigation */}
        <div className="flex flex-wrap justify-center gap-x-6 gap-y-2">
          <Link href="/imprint" className="text-sm text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">
            {t('footer.imprint')}
          </Link>
          <Link href="/terms" className="text-sm text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">
            {t('footer.terms')}
          </Link>
          <Link href="/privacy" className="text-sm text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">
            {t('footer.privacy')}
          </Link>
          <Link href="/aup" className="text-sm text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">
            {t('footer.aup')}
          </Link>
          <Link href="/refund-policy" className="text-sm text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">
            {t('footer.refunds')}
          </Link>
          <Link href="/pricing" className="text-sm text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">
            {t('public_nav.pricing')}
          </Link>
        </div>
        
      </div>
    </footer>
  );
}