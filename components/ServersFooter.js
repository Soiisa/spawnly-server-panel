// components/ServersFooter.js
import Link from 'next/link';

export default function Footer() {
  return (
    /* UPDATED: 
       - Added 'fixed bottom-0 left-0 right-0' to keep it at the bottom.
       - Added 'z-10' to ensure it stays above content.
       - Added 'bg-gray-50/80 dark:bg-slate-900/80 backdrop-blur-md' to match your dashboard theme.
       - Removed 'mt-16' since it is no longer in the document flow.
    */
    <footer className="fixed bottom-0 left-0 right-0 z-10 py-6 px-4 md:px-8 border-t border-gray-200 dark:border-slate-700 bg-gray-50/80 dark:bg-slate-900/80 backdrop-blur-md transition-colors duration-300">
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div>
            <h4 className="text-md font-semibold mb-2 dark:text-gray-100">Spawnly</h4>
            <p className="text-xs text-gray-600 dark:text-gray-400">
              Instant game server hosting with pay-as-you-go pricing.
            </p>
          </div>
          <div>
            <h4 className="text-sm font-semibold mb-2 dark:text-gray-100">Resources</h4>
            <ul className="space-y-1">
              <li><Link href="#" className="text-xs text-gray-600 dark:text-gray-400 hover:text-indigo-600 transition-colors">Documentation</Link></li>
              <li><Link href="#" className="text-xs text-gray-600 dark:text-gray-400 hover:text-indigo-600 transition-colors">Guides</Link></li>
              <li><Link href="#" className="text-xs text-gray-600 dark:text-gray-400 hover:text-indigo-600 transition-colors">API Reference</Link></li>
              <li><Link href="#" className="text-xs text-gray-600 dark:text-gray-400 hover:text-indigo-600 transition-colors">Status</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="text-sm font-semibold mb-2 dark:text-gray-100">Company</h4>
            <ul className="space-y-1">
              <li><Link href="#" className="text-xs text-gray-600 dark:text-gray-400 hover:text-indigo-600 transition-colors">About</Link></li>
              <li><Link href="#" className="text-xs text-gray-600 dark:text-gray-400 hover:text-indigo-600 transition-colors">Blog</Link></li>
              <li><Link href="#" className="text-xs text-gray-600 dark:text-gray-400 hover:text-indigo-600 transition-colors">Careers</Link></li>
              <li><Link href="#" className="text-xs text-gray-600 dark:text-gray-400 hover:text-indigo-600 transition-colors">Contact</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="text-sm font-semibold mb-2 dark:text-gray-100">Legal</h4>
            <ul className="space-y-1">
              {/* UPDATED: Connected to new routes */}
              <li><Link href="/privacy" className="text-xs text-gray-600 dark:text-gray-400 hover:text-indigo-600 transition-colors">Privacy Policy</Link></li>
              <li><Link href="/terms" className="text-xs text-gray-600 dark:text-gray-400 hover:text-indigo-600 transition-colors">Terms of Service</Link></li>
              <li><Link href="#" className="text-xs text-gray-600 dark:text-gray-400 hover:text-indigo-600 transition-colors">Cookie Policy</Link></li>
              <li><Link href="#" className="text-xs text-gray-600 dark:text-gray-400 hover:text-indigo-600 transition-colors">Service Level Agreement</Link></li>
            </ul>
          </div>
        </div>
        <div className="border-t border-gray-200 dark:border-slate-700 mt-4 pt-4 text-center text-[10px] text-gray-500 dark:text-gray-400">
          <p>© {new Date().getFullYear()} Spawnly. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}