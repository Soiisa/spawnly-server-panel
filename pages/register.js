// pages/register.js
import { useState } from "react";
import { supabase } from "../lib/supabaseClient";
import Link from "next/link";
import { useRouter } from "next/router";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import { EnvelopeIcon, LockClosedIcon, UserIcon } from "@heroicons/react/24/outline"; // <--- Added UserIcon
import { useTranslation, Trans } from "next-i18next"; 
import { serverSideTranslations } from 'next-i18next/serverSideTranslations'; 

export default function Register() {
  const { t } = useTranslation('auth'); 
  const [username, setUsername] = useState(""); // <--- Added State
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const router = useRouter();

  const handleRegister = async (e) => {
    e.preventDefault();
    setBusy(true);
    setMessage("");

    // <--- Updated signUp to include username metadata
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          username: username 
        }
      }
    });

    setBusy(false);

    if (error) {
      setMessage(error.message);
    } else {
      setMessage(t('success_check_email')); 
      setTimeout(() => router.push("/login"), 3000);
    }
  };

  const handleGoogleRegister = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/dashboard`,
      },
    });
    if (error) setMessage(error.message);
  };

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-slate-950 font-sans text-slate-900 dark:text-slate-100 transition-colors duration-300">
      <Navbar />

      <main className="flex-grow flex items-center justify-center px-4 py-12 sm:px-6 lg:px-8">
        <div className="w-full max-w-md space-y-8">
          <div className="text-center">
            <h2 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
              {t('create_account')} 
            </h2>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              {t('register_desc')} 
            </p>
          </div>

          <div className="bg-white dark:bg-slate-800 py-8 px-6 shadow-xl rounded-2xl border border-gray-100 dark:border-slate-700 sm:px-10">
            <form className="space-y-6" onSubmit={handleRegister}>
              {message && (
                <div className={`p-3 rounded-lg text-sm text-center border ${
                  message.includes("Success") || message === t('success_check_email')
                    ? "bg-green-50 dark:bg-green-900/30 border-green-100 dark:border-green-900/50 text-green-700 dark:text-green-300" 
                    : "bg-red-50 dark:bg-red-900/30 border-red-100 dark:border-red-900/50 text-red-600 dark:text-red-300"
                }`}>
                  {message}
                </div>
              )}

              <button
                type="button"
                onClick={handleGoogleRegister}
                className="w-full flex items-center justify-center gap-3 py-2.5 px-4 border border-gray-300 dark:border-slate-600 rounded-lg shadow-sm bg-white dark:bg-slate-700 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-600 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-teal-500 transition-all"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24">
                  <path
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    fill="#4285F4"
                  />
                  <path
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    fill="#34A853"
                  />
                  <path
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    fill="#FBBC05"
                  />
                  <path
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    fill="#EA4335"
                  />
                </svg>
                {t('google_sign_up')} 
              </button>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-200 dark:border-slate-600" />
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2 bg-white dark:bg-slate-800 text-gray-500 dark:text-gray-400">
                    {t('or_email_register')} 
                  </span>
                </div>
              </div>

              {/* --- NEW USERNAME INPUT START --- */}
              <div>
                <label htmlFor="username" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  {t('username_label')} 
                </label>
                <div className="mt-1 relative rounded-md shadow-sm">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <UserIcon className="h-5 w-5 text-gray-400 dark:text-gray-500" aria-hidden="true" />
                  </div>
                  <input
                    id="username"
                    name="username"
                    type="text"
                    autoComplete="username"
                    required
                    minLength={3}
                    maxLength={20}
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="block w-full pl-10 pr-3 py-3 border-gray-300 dark:border-slate-600 rounded-lg focus:ring-teal-500 focus:border-teal-500 dark:bg-slate-700 dark:text-white sm:text-sm border shadow-sm"
                    placeholder={t('placeholders.username')}
                  />
                </div>
              </div>
              {/* --- NEW USERNAME INPUT END --- */}

              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  {t('email_label')} 
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
                    className="block w-full pl-10 pr-3 py-3 border-gray-300 dark:border-slate-600 rounded-lg focus:ring-teal-500 focus:border-teal-500 dark:bg-slate-700 dark:text-white sm:text-sm border shadow-sm"
                    placeholder={t('placeholders.email')}
                  />
                </div>
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  {t('password_label')} 
                </label>
                <div className="mt-1 relative rounded-md shadow-sm">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <LockClosedIcon className="h-5 w-5 text-gray-400 dark:text-gray-500" aria-hidden="true" />
                  </div>
                  <input
                    id="password"
                    name="password"
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="block w-full pl-10 pr-3 py-3 border-gray-300 dark:border-slate-600 rounded-lg focus:ring-teal-500 focus:border-teal-500 dark:bg-slate-700 dark:text-white sm:text-sm border shadow-sm"
                    placeholder={t('placeholders.min_chars')}
                  />
                </div>
              </div>

              <p className="text-xs text-center text-gray-500 dark:text-gray-400 px-4">
                <Trans
                  i18nKey="terms_agreement"
                  ns="auth"
                  components={[
                    <span key="0" />,
                    <Link href="/terms" key="1" className="text-teal-600 dark:text-teal-400 hover:underline" />,
                    <span key="2" />,
                    <Link href="/privacy" key="3" className="text-teal-600 dark:text-teal-400 hover:underline" />
                  ]}
                />
              </p>

              <button
                type="submit"
                disabled={busy}
                className="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-teal-500 hover:bg-teal-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-teal-500 transition-all disabled:opacity-50"
              >
                {busy ? t('creating_account') : t('create_account_btn')} 
              </button>
            </form>

            <div className="mt-6">
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-200 dark:border-slate-600" />
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2 bg-white dark:bg-slate-800 text-gray-500 dark:text-gray-400">
                    {t('existing_user')} 
                  </span>
                </div>
              </div>

              <div className="mt-6">
                <Link
                  href="/login"
                  className="w-full flex justify-center py-3 px-4 border border-gray-300 dark:border-slate-600 rounded-lg shadow-sm text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-slate-700 hover:bg-gray-50 dark:hover:bg-slate-600 focus:outline-none transition-all"
                >
                  {t('sign_in_link')} 
                </Link>
              </div>
            </div>
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