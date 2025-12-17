// components/Navbar.js
import Link from "next/link";
import Image from "next/image";
import { SunIcon, MoonIcon } from '@heroicons/react/24/outline'; // ADDED: Icon imports
import { useDarkMode } from '../pages/_app'; // ADDED: Import context

export default function Navbar() {
  const { isDarkMode, toggleDarkMode } = useDarkMode(); // ADDED: Use dark mode hook

  return (
    // UPDATED: Added dark mode classes for nav background and border
    <nav className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-md sticky top-0 z-50 border-b border-gray-200 dark:border-slate-700">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          
          {/* Logo Section */}
          <Link href="/" className="flex items-center gap-2 group">
            <div className="relative h-12 w-12">
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

          {/* Navigation Links */}
          <div className="flex items-center gap-6">
            
            {/* ADDED: Dark Mode Toggle Button */}
            <button
              onClick={toggleDarkMode}
              className="p-1 rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
              title={isDarkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            >
              {isDarkMode ? <SunIcon className="w-5 h-5" /> : <MoonIcon className="w-5 h-5" />}
            </button>
            
            <Link 
              href="/pricing" 
              // UPDATED: Added dark mode class for text
              className="text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-indigo-600 transition-colors"
            >
              Pricing
            </Link>

            <Link 
              href="/login" 
              // UPDATED: Added dark mode class for text
              className="text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-indigo-600 transition-colors"
            >
              Log in
            </Link>

            <Link
              href="/register"
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold py-2 px-4 rounded-lg shadow-sm transition-all hover:-translate-y-0.5"
            >
              Get Started
            </Link>
          </div>
        </div>
      </div>
    </nav>
  );
}