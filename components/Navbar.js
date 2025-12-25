// components/Navbar.js
import Link from "next/link";
import Image from "next/image";
import { SunIcon, MoonIcon } from '@heroicons/react/24/outline';
import { useDarkMode } from '../pages/_app';
import { useTranslation } from "next-i18next"; // <--- IMPORTED

export default function Navbar() {
  const { isDarkMode, toggleDarkMode } = useDarkMode();
  const { t } = useTranslation('common'); // <--- INITIALIZED

  return (
    <nav className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-md sticky top-0 z-50 border-b border-gray-200 dark:border-slate-700">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          
          {/* Logo Section */}
          <Link href="/" className="flex items-center gap-2 group">
            <div className="relative h-12 w-12">
              <Image src="/logo.png" alt="Spawnly Logo" fill className="object-contain" />
            </div>
            <span className="text-xl font-bold text-slate-900 dark:text-gray-100 tracking-tight group-hover:text-indigo-600 transition-colors">
              {t('brand')}
            </span>
          </Link>

          {/* Navigation Links */}
          <div className="flex items-center gap-6">
            
            <button
              onClick={toggleDarkMode}
              className="p-1 rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
              title={isDarkMode ? t('theme.switch_light') : t('theme.switch_dark')}
            >
              {isDarkMode ? <SunIcon className="w-5 h-5" /> : <MoonIcon className="w-5 h-5" />}
            </button>
            
            <Link 
              href="/pricing" 
              className="text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-indigo-600 transition-colors"
            >
              {t('public_nav.pricing')} {/* <--- TRANSLATED */}
            </Link>

            <Link 
              href="/login" 
              className="text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-indigo-600 transition-colors"
            >
              {t('public_nav.login')} {/* <--- TRANSLATED */}
            </Link>

            <Link
              href="/register"
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold py-2 px-4 rounded-lg shadow-sm transition-all hover:-translate-y-0.5"
            >
              {t('public_nav.get_started')} {/* <--- TRANSLATED */}
            </Link>
          </div>
        </div>
      </div>
    </nav>
  );
}