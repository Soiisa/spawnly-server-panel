// components/Navbar.js
import Link from "next/link";

export default function Navbar() {
  return (
    <nav className="bg-white shadow-md">
      <div className="container mx-auto px-6 py-4 flex justify-between items-center">
        <Link href="/" className="text-2xl font-bold text-indigo-900">
          Spawnly
        </Link>

        <div className="space-x-4">
          <Link href="/pricing" className="text-neutral-700 hover:text-indigo-900 font-medium">
            Pricing
          </Link>

          <Link href="/login" className="text-teal-500 font-semibold hover:text-teal-400">
            Login
          </Link>

          <Link
            href="/register"
            className="bg-teal-500 hover:bg-teal-400 text-white font-semibold py-2 px-4 rounded-lg transition"
          >
            Sign Up
          </Link>
        </div>
      </div>
    </nav>
  );
}
