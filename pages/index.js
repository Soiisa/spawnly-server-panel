// pages/index.js
import Link from "next/link";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import { useTranslation } from "next-i18next"; // <--- IMPORTED
import { serverSideTranslations } from 'next-i18next/serverSideTranslations'; // <--- IMPORTED
import { 
  RocketLaunchIcon, 
  CpuChipIcon, 
  CircleStackIcon, 
  CreditCardIcon
} from "@heroicons/react/24/outline";

export default function Home() {
  const { t } = useTranslation('landing'); // <--- INITIALIZED

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-slate-950 font-sans text-slate-900 dark:text-slate-100">
      <Navbar />

      <main className="flex-grow">
        {/* Hero Section */}
        <section className="relative overflow-hidden pt-16 pb-20 lg:pt-24 lg:pb-28">
          <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center">
            <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white sm:text-5xl md:text-6xl">
              <span className="block xl:inline">{t('hero.title_prefix')}</span>{" "}
              <span className="text-indigo-600 dark:text-indigo-500">{t('hero.title_highlight')}</span>
            </h1>
            <p className="mx-auto mt-3 max-w-md text-base text-gray-500 dark:text-gray-400 sm:text-lg md:mt-5 md:max-w-3xl md:text-xl">
              {t('hero.subtitle')}
            </p>
            <div className="mx-auto mt-10 max-w-sm sm:flex sm:max-w-none sm:justify-center gap-4">
              <Link
                href="/register"
                className="flex items-center justify-center rounded-xl border border-transparent bg-indigo-600 px-8 py-3 text-base font-medium text-white hover:bg-indigo-700 md:py-4 md:px-10 md:text-lg shadow-lg shadow-indigo-200 dark:shadow-none transition-all hover:-translate-y-0.5"
              >
                {t('hero.get_started')}
              </Link>
              <Link
                href="/pricing"
                className="mt-3 flex items-center justify-center rounded-xl border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-8 py-3 text-base font-medium text-indigo-700 dark:text-indigo-400 hover:bg-gray-50 dark:hover:bg-slate-700 md:mt-0 md:py-4 md:px-10 md:text-lg shadow-sm transition-all hover:-translate-y-0.5"
              >
                {t('hero.view_pricing')}
              </Link>
            </div>
          </div>
        </section>

        {/* Features Grid */}
        <section className="bg-white dark:bg-slate-900 py-16 lg:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16">
              <h2 className="text-base font-semibold uppercase tracking-wide text-indigo-600 dark:text-indigo-400">{t('features.label')}</h2>
              <p className="mt-2 text-3xl font-extrabold leading-8 text-gray-900 dark:text-white sm:text-4xl">
                {t('features.heading')}
              </p>
            </div>

            <div className="grid grid-cols-1 gap-12 sm:grid-cols-2 lg:grid-cols-3">
              {/* Feature 1 */}
              <div className="relative group">
                <div className="absolute -inset-1 rounded-lg bg-gradient-to-r from-teal-400 to-indigo-500 opacity-25 blur transition duration-200 group-hover:opacity-50"></div>
                <div className="relative h-full bg-white dark:bg-slate-800 p-8 rounded-xl border border-gray-100 dark:border-slate-700 shadow-sm flex flex-col">
                  <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400">
                    <RocketLaunchIcon className="h-6 w-6" />
                  </div>
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white">{t('features.instant.title')}</h3>
                  <p className="mt-2 text-gray-500 dark:text-gray-400 flex-grow">
                    {t('features.instant.description')}
                  </p>
                </div>
              </div>

              {/* Feature 2 */}
              <div className="relative group">
                <div className="absolute -inset-1 rounded-lg bg-gradient-to-r from-purple-400 to-pink-500 opacity-25 blur transition duration-200 group-hover:opacity-50"></div>
                <div className="relative h-full bg-white dark:bg-slate-800 p-8 rounded-xl border border-gray-100 dark:border-slate-700 shadow-sm flex flex-col">
                  <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400">
                    <CreditCardIcon className="h-6 w-6" />
                  </div>
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white">{t('features.billing.title')}</h3>
                  <p className="mt-2 text-gray-500 dark:text-gray-400 flex-grow">
                    {t('features.billing.description')}
                  </p>
                </div>
              </div>

              {/* Feature 3 */}
              <div className="relative group">
                <div className="absolute -inset-1 rounded-lg bg-gradient-to-r from-orange-400 to-amber-500 opacity-25 blur transition duration-200 group-hover:opacity-50"></div>
                <div className="relative h-full bg-white dark:bg-slate-800 p-8 rounded-xl border border-gray-100 dark:border-slate-700 shadow-sm flex flex-col">
                  <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400">
                    <CircleStackIcon className="h-6 w-6" />
                  </div>
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white">{t('features.storage.title')}</h3>
                  <p className="mt-2 text-gray-500 dark:text-gray-400 flex-grow">
                    {t('features.storage.description')}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Stats / Trust Section */}
        <section className="bg-indigo-900 py-12">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 gap-8 sm:grid-cols-3 text-center">
              <div>
                <p className="text-4xl font-bold text-white">99.9%</p>
                <p className="mt-1 text-indigo-200">{t('stats.uptime')}</p>
              </div>
              <div>
                <p className="text-4xl font-bold text-white">NVMe</p>
                <p className="mt-1 text-indigo-200">{t('stats.storage')}</p>
              </div>
              <div>
                <p className="text-4xl font-bold text-white">DDoS</p>
                <p className="mt-1 text-indigo-200">{t('stats.protection')}</p>
              </div>
            </div>
          </div>
        </section>
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
        'landing'
      ])),
    },
  };
}