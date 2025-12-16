// components/Footer.js
export default function Footer() {
  return (
    // UPDATED: Added dark mode class for border
    <footer className="mt-16 py-8 px-4 md:px-8 border-t border-gray-200 dark:border-slate-700">
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div>
            {/* UPDATED: Added dark mode class for title */}
            <h4 className="text-lg font-semibold mb-4 dark:text-gray-100">Spawnly</h4>
            {/* UPDATED: Added dark mode class for text */}
            <p className="text-gray-600 dark:text-gray-400">
              Instant game server hosting with pay-as-you-go pricing.
            </p>
          </div>
          <div>
            {/* UPDATED: Added dark mode class for title */}
            <h4 className="text-lg font-semibold mb-4 dark:text-gray-100">Resources</h4>
            <ul className="space-y-2">
              {/* UPDATED: Added dark mode classes for links */}
              <li><a href="#" className="text-gray-600 dark:text-gray-400 hover:text-indigo-600">Documentation</a></li>
              <li><a href="#" className="text-gray-600 dark:text-gray-400 hover:text-indigo-600">Guides</a></li>
              <li><a href="#" className="text-gray-600 dark:text-gray-400 hover:text-indigo-600">API Reference</a></li>
              <li><a href="#" className="text-gray-600 dark:text-gray-400 hover:text-indigo-600">Status</a></li>
            </ul>
          </div>
          <div>
            {/* UPDATED: Added dark mode class for title */}
            <h4 className="text-lg font-semibold mb-4 dark:text-gray-100">Company</h4>
            <ul className="space-y-2">
              {/* UPDATED: Added dark mode classes for links */}
              <li><a href="#" className="text-gray-600 dark:text-gray-400 hover:text-indigo-600">About</a></li>
              <li><a href="#" className="text-gray-600 dark:text-gray-400 hover:text-indigo-600">Blog</a></li>
              <li><a href="#" className="text-gray-600 dark:text-gray-400 hover:text-indigo-600">Careers</a></li>
              <li><a href="#" className="text-gray-600 dark:text-gray-400 hover:text-indigo-600">Contact</a></li>
            </ul>
          </div>
          <div>
            {/* UPDATED: Added dark mode class for title */}
            <h4 className="text-lg font-semibold mb-4 dark:text-gray-100">Legal</h4>
            <ul className="space-y-2">
              {/* UPDATED: Added dark mode classes for links */}
              <li><a href="#" className="text-gray-600 dark:text-gray-400 hover:text-indigo-600">Privacy Policy</a></li>
              <li><a href="#" className="text-gray-600 dark:text-gray-400 hover:text-indigo-600">Terms of Service</a></li>
              <li><a href="#" className="text-gray-600 dark:text-gray-400 hover:text-indigo-600">Cookie Policy</a></li>
              <li><a href="#" className="text-gray-600 dark:text-gray-400 hover:text-indigo-600">Service Level Agreement</a></li>
            </ul>
          </div>
        </div>
        {/* UPDATED: Added dark mode classes for bottom text and divider */}
        <div className="border-t border-gray-200 dark:border-slate-700 mt-8 pt-8 text-center text-gray-500 dark:text-gray-400">
          <p>© {new Date().getFullYear()} Spawnly. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}