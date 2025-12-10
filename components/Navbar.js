// components/Navbar.js
import Link from "next/link";
import Image from "next/image";

export default function Navbar() {
  return (
    <nav className="bg-white/80 backdrop-blur-md sticky top-0 z-50 border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          
          {/* Logo Section */}
          <Link href="/" className="flex items-center gap-2 group">
            <div className="relative h-8 w-8">
              {/* REPLACE '/logo.png' WITH YOUR ACTUAL FILE NAME */}
              <Image 
                src="/logo.png" 
                alt="Spawnly Logo" 
                fill
                className="object-contain"
              />
            </div>
            <span className="text-xl font-bold text-slate-900 tracking-tight group-hover:text-indigo-600 transition-colors">
              Spawnly
            </span>
          </Link>

          {/* Navigation Links */}
          <div className="flex items-center gap-6">
            <Link 
              href="/pricing" 
              className="text-sm font-medium text-slate-600 hover:text-indigo-600 transition-colors"
            >
              Pricing
            </Link>

            <Link 
              href="/login" 
              className="text-sm font-medium text-slate-600 hover:text-indigo-600 transition-colors"
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