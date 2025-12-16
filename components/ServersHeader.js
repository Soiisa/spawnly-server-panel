// components/ServersHeader.js
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/router';
import { 
  ServerIcon, 
  CreditCardIcon, 
  SunIcon, // ADDED: Icon for light mode
  MoonIcon, // ADDED: Icon for dark mode
} from '@heroicons/react/24/outline';
import CreditBalance from "./CreditBalance";
import { useDarkMode } from '../pages/_app'; // ADDED: Import context

export default function ServersHeader({ user, credits, isLoading, onLogout }) {
  const router = useRouter();
  const { isDarkMode, toggleDarkMode } = useDarkMode(); // ADDED: Use dark mode hook

  const isActive = (path) => router.pathname === path;

  const navLinks = [
    { name: 'Dashboard', href: '/dashboard', icon: ServerIcon },
    { name: 'Billing', href: '/credits', icon: CreditCardIcon },
  ];

  return (
    // UPDATED: Added dark mode classes for header background and border
    <header className="bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-slate-700 sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          
          {/* Left Side: Logo & Nav */}
          <div className="flex items-center gap-8">
            <Link href="/dashboard" className="flex items-center gap-2 group">
              <div className="relative h-8 w-8">
                {/* REPLACE '/logo.png' WITH YOUR ACTUAL FILE NAME */}
                <Image 
                  src="/logo.png" 
                  alt="Spawnly Logo" 
                  fill
                  className="object-contain"
                />
              </div>
              {/* UPDATED: Added dark mode class for text */}
              <span className="text-xl font-bold text-slate-900 dark:text-gray-100 tracking-tight group-hover:text-indigo-600 transition-colors">
                Spawnly
              </span>
            </Link>

            <nav className="hidden md:flex items-center gap-1">
              {navLinks.map((link) => (
                <Link
                  key={link.name}
                  href={link.href}
                  className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    isActive(link.href)
                      // UPDATED: Added dark mode classes for active and inactive links
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
            
            {/* ADDED: Dark Mode Toggle Button */}
            <button
              onClick={toggleDarkMode}
              className="p-2 rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
              title={isDarkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            >
              {isDarkMode ? <SunIcon className="w-6 h-6" /> : <MoonIcon className="w-6 h-6" />}
            </button>
            
            <CreditBalance credits={credits} isLoading={isLoading} />
            
            {/* UPDATED: Added dark mode class for separator */}
            <div className="h-6 w-px bg-gray-200 dark:bg-slate-700 hidden sm:block"></div>

            <div className="flex items-center gap-3 pl-2">
              <div className="hidden sm:flex flex-col items-end">
                {/* UPDATED: Added dark mode class for text */}
                <span className="text-sm font-medium text-gray-900 dark:text-gray-100 leading-none">
                  {user?.email?.split('@')[0]}
                </span>
                <button 
                  onClick={onLogout}
                  className="text-xs text-gray-500 hover:text-red-600 transition-colors mt-1 flex items-center gap-1"
                >
                  Log out
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