// components/ServersHeader.js
import Link from 'next/link';
import { useRouter } from 'next/router';
import { 
  ServerIcon, 
  CreditCardIcon, 
  LifebuoyIcon,
  ArrowRightOnRectangleIcon
} from '@heroicons/react/24/outline';
import CreditBalance from "./CreditBalance";

export default function ServersHeader({ user, credits, isLoading, onLogout }) {
  const router = useRouter();

  const isActive = (path) => router.pathname === path;

  const navLinks = [
    { name: 'Dashboard', href: '/dashboard', icon: ServerIcon },
    { name: 'Billing', href: '/credits', icon: CreditCardIcon },
    // { name: 'Support', href: '#', icon: LifebuoyIcon }, // Uncomment when ready
  ];

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          
          {/* Left Side: Logo & Nav */}
          <div className="flex items-center gap-8">
            <Link href="/dashboard" className="flex items-center gap-2">
              <div className="bg-indigo-600 w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-lg">
                S
              </div>
              <span className="text-xl font-bold text-slate-900 tracking-tight">Spawnly</span>
            </Link>

            <nav className="hidden md:flex items-center gap-1">
              {navLinks.map((link) => (
                <Link
                  key={link.name}
                  href={link.href}
                  className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    isActive(link.href)
                      ? 'bg-gray-100 text-indigo-600'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                  }`}
                >
                  <link.icon className={`w-4 h-4 ${isActive(link.href) ? 'text-indigo-600' : 'text-gray-400'}`} />
                  {link.name}
                </Link>
              ))}
            </nav>
          </div>

          {/* Right Side: Credits & User */}
          <div className="flex items-center gap-4">
            <CreditBalance credits={credits} isLoading={isLoading} />
            
            <div className="h-6 w-px bg-gray-200 hidden sm:block"></div>

            <div className="flex items-center gap-3 pl-2">
              <div className="hidden sm:flex flex-col items-end">
                <span className="text-sm font-medium text-gray-900 leading-none">
                  {user?.email?.split('@')[0]}
                </span>
                <button 
                  onClick={onLogout}
                  className="text-xs text-gray-500 hover:text-red-600 transition-colors mt-1 flex items-center gap-1"
                >
                  Log out
                </button>
              </div>
              
              <div className="h-9 w-9 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center text-white text-sm font-bold ring-2 ring-white shadow-sm">
                {user?.email?.charAt(0).toUpperCase()}
              </div>
            </div>
          </div>

        </div>
      </div>
    </header>
  );
}