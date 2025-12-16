// pages/forgot-password.js
import { useState } from "react";
import { supabase } from "../lib/supabaseClient";
import Link from "next/link";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import { EnvelopeIcon } from "@heroicons/react/24/outline";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);

  const handleReset = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/update-password`,
    });

    if (error) {
      setError(error.message);
    } else {
      setMessage("Password reset link sent! Check your email.");
    }
    setLoading(false);
  };

  return (
    // UPDATED: Added dark mode classes for page container
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-slate-900 font-sans text-slate-900 dark:text-gray-100">
      <Navbar />

      <main className="flex-grow flex items-center justify-center px-4 py-12 sm:px-6 lg:px-8">
        <div className="w-full max-w-md space-y-8">
          <div className="text-center">
            {/* UPDATED: Added dark mode class for text */}
            <h2 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
              Reset Password
            </h2>
            {/* UPDATED: Added dark mode class for text */}
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              Enter your email to receive a reset link
            </p>
          </div>

          {/* UPDATED: Added dark mode classes for card */}
          <div className="bg-white dark:bg-slate-800 py-8 px-6 shadow-xl rounded-2xl border border-gray-100 dark:border-slate-700 sm:px-10">
            {message ? (
              <div className="text-center">
                <div className="mb-4 text-green-600 bg-green-50 p-4 rounded-lg">
                  {message}
                </div>
                <Link href="/login" className="text-indigo-600 hover:text-indigo-500 font-medium">
                  Return to Login
                </Link>
              </div>
            ) : (
              <form className="space-y-6" onSubmit={handleReset}>
                {error && (
                  <div className="p-3 rounded-lg bg-red-50 border border-red-100 text-sm text-red-600 text-center">
                    {error}
                  </div>
                )}

                <div>
                  {/* UPDATED: Added dark mode class for label */}
                  <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Email address
                  </label>
                  <div className="mt-1 relative rounded-md shadow-sm">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <EnvelopeIcon className="h-5 w-5 text-gray-400" aria-hidden="true" />
                    </div>
                    <input
                      id="email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      // UPDATED: Added dark mode classes for input
                      className="block w-full pl-10 pr-3 py-3 border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm border shadow-sm"
                      placeholder="you@example.com"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-all disabled:opacity-50"
                >
                  {loading ? "Sending..." : "Send Reset Link"}
                </button>

                <div className="text-center mt-4">
                  {/* UPDATED: Added dark mode class for link */}
                  <Link href="/login" className="text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-500 dark:hover:text-gray-300">
                    Back to Login
                  </Link>
                </div>
              </form>
            )}
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}