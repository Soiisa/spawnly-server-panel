// components/Header.js
import CreditBalance from "./CreditBalance";

export default function Header({ user, credits, onLogout }) {
  return (
    <header className="bg-white shadow-md flex justify-between items-center px-8 py-4">
      <div className="flex items-center">
        <h2 className="text-2xl font-bold text-indigo-900">Spawnly</h2>
        <nav className="ml-10 hidden md:flex space-x-6">
          <a href="/dashboard" className="text-gray-700 hover:text-indigo-600 font-medium">Dashboard</a>
          <a href="#" className="text-gray-500 hover:text-indigo-600">Billing</a>
          <a href="#" className="text-gray-500 hover:text-indigo-600">Support</a>
        </nav>
      </div>
      
      <div className="flex items-center space-x-4">
        <CreditBalance credits={credits} />
        <div className="flex items-center space-x-2">
          <div className="bg-indigo-100 w-8 h-8 rounded-full flex items-center justify-center">
            <span className="font-medium text-indigo-800">{user?.email?.charAt(0).toUpperCase() || 'U'}</span>
          </div>
          <span className="text-gray-700 hidden sm:block">{user?.email || ''}</span>
        </div>
        <button
          onClick={onLogout}
          className="bg-gray-100 hover:bg-gray-200 text-gray-700 py-1 px-3 rounded-lg text-sm"
        >
          Logout
        </button>
      </div>
    </header>
  );
}