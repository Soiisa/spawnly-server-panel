// pages/forgot-password.js
import { useState } from "react";
import { supabase } from "../lib/supabaseClient";
import Link from "next/link";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import { EnvelopeIcon } from "@heroicons/react/24/outline";
import { useTranslation } from "next-i18next"; // <--- IMPORTED
import { serverSideTranslations } from 'next-i18next/serverSideTranslations'; // <--- IMPORTED

export default function ForgotPassword() {
  const { t } = useTranslation('auth'); // <--- INITIALIZED
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
      setMessage(t('reset.success_sent')); // <--- TRANSLATED
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-slate-950 font-sans text-slate-900 dark:text-slate-100 transition-colors duration-300">
      <Navbar />

      <main className="flex-grow flex items-center justify-center px-4 py-12 sm:px-6 lg:px-8">
        <div className="w-full max-w-md space-y-8">
          <div className="text-center">
            <h2 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
              {t('reset.title')} {/* <--- TRANSLATED */}
            </h2>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              {t('reset.desc')} {/* <--- TRANSLATED */}
            </p>
          </div>

          <div className="bg-white dark:bg-slate-800 py-8 px-6 shadow-xl rounded-2xl border border-gray-100 dark:border-slate-700 sm:px-10">
            {message ? (
              <div className="text-center">
                <div className="mb-4 text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/30 p-4 rounded-lg">
                  {message}
                </div>
                <Link href="/login" className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 font-medium">
                  {t('reset.return_login')} {/* <--- TRANSLATED */}
                </Link>
              </div>
            ) : (
              <form className="space-y-6" onSubmit={handleReset}>
                {error && (
                  <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/30 border border-red-100 dark:border-red-900/50 text-sm text-red-600 dark:text-red-300 text-center">
                    {error}
                  </div>
                )}

                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    {t('email_label')} {/* <--- TRANSLATED */}
                  </label>
                  <div className="mt-1 relative rounded-md shadow-sm">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <EnvelopeIcon className="h-5 w-5 text-gray-400 dark:text-gray-500" aria-hidden="true" />
                    </div>
                    <input
                      id="email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="block w-full pl-10 pr-3 py-3 border-gray-300 dark:border-slate-600 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 dark:bg-slate-700 dark:text-white sm:text-sm border shadow-sm"
                      placeholder={t('placeholders.email')} // <--- TRANSLATED
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-all disabled:opacity-50"
                >
                  {loading ? t('reset.btn_sending') : t('reset.btn_send')} {/* <--- TRANSLATED */}
                </button>

                <div className="text-center mt-4">
                  <Link href="/login" className="text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-500 dark:hover:text-gray-300">
                    {t('reset.back_login')} {/* <--- TRANSLATED */}
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

// --- REQUIRED FOR NEXT-I18NEXT ---
export async function getStaticProps({ locale }) {
  return {
    props: {
      ...(await serverSideTranslations(locale, [
        'common',
        'auth'
      ])),
    },
  };
}