// components/Footer.js
export default function Footer() {
  return (
    <footer className="mt-16 py-8 px-4 md:px-8 border-t border-gray-200">
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div>
            <h4 className="text-lg font-semibold mb-4">Spawnly</h4>
            <p className="text-gray-600">
              Instant game server hosting with pay-as-you-go pricing.
            </p>
          </div>
          <div>
            <h4 className="text-lg font-semibold mb-4">Resources</h4>
            <ul className="space-y-2">
              <li><a href="#" className="text-gray-600 hover:text-indigo-600">Documentation</a></li>
              <li><a href="#" className="text-gray-600 hover:text-indigo-600">Guides</a></li>
              <li><a href="#" className="text-gray-600 hover:text-indigo-600">API Reference</a></li>
              <li><a href="#" className="text-gray-600 hover:text-indigo-600">Status</a></li>
            </ul>
          </div>
          <div>
            <h4 className="text-lg font-semibold mb-4">Company</h4>
            <ul className="space-y-2">
              <li><a href="#" className="text-gray-600 hover:text-indigo-600">About</a></li>
              <li><a href="#" className="text-gray-600 hover:text-indigo-600">Blog</a></li>
              <li><a href="#" className="text-gray-600 hover:text-indigo-600">Careers</a></li>
              <li><a href="#" className="text-gray-600 hover:text-indigo-600">Contact</a></li>
            </ul>
          </div>
          <div>
            <h4 className="text-lg font-semibold mb-4">Legal</h4>
            <ul className="space-y-2">
              <li><a href="#" className="text-gray-600 hover:text-indigo-600">Privacy Policy</a></li>
              <li><a href="#" className="text-gray-600 hover:text-indigo-600">Terms of Service</a></li>
              <li><a href="#" className="text-gray-600 hover:text-indigo-600">Cookie Policy</a></li>
              <li><a href="#" className="text-gray-600 hover:text-indigo-600">Service Level Agreement</a></li>
            </ul>
          </div>
        </div>
        <div className="border-t border-gray-200 mt-8 pt-8 text-center text-gray-500">
          <p>© {new Date().getFullYear()} Spawnly. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}