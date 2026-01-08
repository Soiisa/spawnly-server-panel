// components/ServersHeader.js
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import { 
  ServerIcon, 
  CreditCardIcon, 
  SunIcon,
  MoonIcon,
  Cog6ToothIcon,
  ChatBubbleLeftRightIcon,
  BanknotesIcon 
} from '@heroicons/react/24/outline';
import CreditBalance from "./CreditBalance";
import { useDarkMode } from '../pages/_app';

export default function ServersHeader({ user, credits, isLoading, onLogout }) {
  const router = useRouter();
  const { isDarkMode, toggleDarkMode } = useDarkMode();
  const { t } = useTranslation('common');

  const isActive = (path) => router.pathname.startsWith(path);

  const navLinks = [
    { name: t('nav.dashboard'), href: '/dashboard', icon: ServerIcon },
    { name: t('nav.pools', 'Pools'), href: '/pools', icon: BanknotesIcon },
    { name: t('nav.billing'), href: '/credits', icon: CreditCardIcon },
    { name: 'Support', href: '/support', icon: ChatBubbleLeftRightIcon },
    { name: t('nav.settings', 'Settings'), href: '/settings', icon: Cog6ToothIcon },
  ];

  return (
    // --- ADDED CLASS: tour-main-header ---
    <header className="bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-slate-700 sticky top-0 z-30 tour-main-header">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          
          {/* Left Side: Logo & Nav */}
          <div className="flex items-center gap-8">
            <Link href="/dashboard" className="flex items-center gap-2 group">
              <div className="relative h-8 w-8">
                <Image 
                  src="/logo.png" 
                  alt="Spawnly Logo" 
                  fill
                  className="object-contain"
                />
              </div>
              <span className="text-xl font-bold text-slate-900 dark:text-gray-100 tracking-tight group-hover:text-indigo-600 transition-colors">
                {t('brand')}
              </span>
            </Link>

            <nav className="hidden md:flex items-center gap-1">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    isActive(link.href)
                      ? 'bg-gray-100 dark:bg-slate-800 text-indigo-600'
                      : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-50 dark:hover:bg-slate-800/50'
                  }`}
                >
                  <link.icon className={`w-4 h-4 ${isActive(link.href) ? 'text-indigo-600' : 'text-gray-400'}`} />
                  {link.name}
                </Link>
              ))}
            </nav>
          </div>

          {/* Right Side: Toggle, Credits & User */}
          <div className="flex items-center gap-4">
            <button
              onClick={toggleDarkMode}
              className="p-2 rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
              title={isDarkMode ? t('theme.switch_light') : t('theme.switch_dark')}
            >
              {isDarkMode ? <SunIcon className="w-6 h-6" /> : <MoonIcon className="w-6 h-6" />}
            </button>
            <CreditBalance credits={credits} isLoading={isLoading} />
            <div className="h-6 w-px bg-gray-200 dark:bg-slate-700 hidden sm:block"></div>
            <div className="flex items-center gap-3 pl-2">
              <div className="hidden sm:flex flex-col items-end">
                <span className="text-sm font-medium text-gray-900 dark:text-gray-100 leading-none">
                  {user?.email?.split('@')[0]}
                </span>
                <button 
                  onClick={onLogout}
                  className="text-xs text-gray-500 hover:text-red-600 transition-colors mt-1 flex items-center gap-1"
                >
                  {t('nav.logout')}
                </button>
              </div>
              <div className="h-9 w-9 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center text-white text-sm font-bold ring-2 ring-white dark:ring-slate-800 shadow-sm">
                {user?.email?.charAt(0).toUpperCase()}
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}