// pages/index.js
import Link from "next/link";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import { useTranslation } from "next-i18next"; 
import { serverSideTranslations } from 'next-i18next/serverSideTranslations'; 
import { 
  RocketLaunchIcon, 
  CpuChipIcon, 
  CircleStackIcon, 
  CreditCardIcon,
  ShieldCheckIcon,
  CommandLineIcon,
  FolderOpenIcon,
  ClockIcon,
  ArrowRightIcon,
  BanknotesIcon,
  CalendarDaysIcon,
  BeakerIcon
} from "@heroicons/react/24/outline";

export default function Home() {
  const { t } = useTranslation('landing');

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-slate-950 font-sans text-slate-900 dark:text-slate-100 selection:bg-indigo-500 selection:text-white">
      <Navbar />

      <main className="flex-grow">
        {/* Hero Section */}
        <section className="relative overflow-hidden pt-24 pb-20 lg:pt-32 lg:pb-32 bg-white dark:bg-slate-950">
          {/* Decorative Gradient Blob */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full max-w-7xl pointer-events-none z-0">
            <div className="absolute top-20 left-10 w-72 h-72 bg-indigo-500/10 rounded-full blur-3xl mix-blend-multiply dark:mix-blend-screen animate-blob"></div>
            <div className="absolute top-20 right-10 w-72 h-72 bg-purple-500/10 rounded-full blur-3xl mix-blend-multiply dark:mix-blend-screen animate-blob animation-delay-2000"></div>
          </div>

          <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center">
            
            {/* Announcement Badge */}
            <div className="mb-8 flex justify-center">
              <div className="relative rounded-full px-3 py-1 text-sm leading-6 text-gray-600 dark:text-gray-400 ring-1 ring-gray-900/10 dark:ring-gray-100/10 hover:ring-gray-900/20 dark:hover:ring-gray-100/20 transition-all">
                {t('hero.announcement', { defaultValue: '🚀 Now supporting Modpacks & Plugins' })}{" "}
                <Link href="/register" className="font-semibold text-indigo-600 dark:text-indigo-400">
                  <span className="absolute inset-0" aria-hidden="true" />
                  {t('hero.read_more', { defaultValue: 'Get Started' })} <span aria-hidden="true">&rarr;</span>
                </Link>
              </div>
            </div>

            <h1 className="text-5xl font-extrabold tracking-tight text-slate-900 dark:text-white sm:text-6xl md:text-7xl mb-6">
              <span className="block xl:inline">{t('hero.title_prefix')}</span>{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-purple-600 dark:from-indigo-400 dark:to-purple-400">
                {t('hero.title_highlight')}
              </span>
            </h1>
            
            <p className="mx-auto mt-6 max-w-lg text-lg text-gray-600 dark:text-gray-300 sm:text-xl md:max-w-3xl leading-relaxed">
              {t('hero.subtitle')}
            </p>
            
            <div className="mx-auto mt-10 max-w-sm sm:flex sm:max-w-none sm:justify-center gap-4">
              <Link
                href="/register"
                className="flex items-center justify-center rounded-xl border border-transparent bg-indigo-600 px-8 py-4 text-lg font-bold text-white hover:bg-indigo-700 shadow-lg shadow-indigo-500/30 hover:shadow-indigo-500/50 transition-all hover:-translate-y-1"
              >
                {t('hero.get_started')}
                <ArrowRightIcon className="ml-2 -mr-1 w-5 h-5" />
              </Link>
              <Link
                href="/pricing"
                className="mt-3 flex items-center justify-center rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-8 py-4 text-lg font-bold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-700 md:mt-0 shadow-sm transition-all hover:-translate-y-1"
              >
                {t('hero.view_pricing')}
              </Link>
            </div>
          </div>
        </section>

        {/* Features Grid */}
        <section className="bg-gray-50 dark:bg-slate-900 py-20 lg:py-28">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16 max-w-3xl mx-auto">
              <h2 className="text-base font-semibold uppercase tracking-wide text-indigo-600 dark:text-indigo-400 mb-2">
                {t('features.label')}
              </h2>
              <p className="text-3xl font-extrabold leading-8 text-gray-900 dark:text-white sm:text-4xl">
                {t('features.heading')}
              </p>
              <p className="mt-4 text-lg text-gray-500 dark:text-gray-400">
                {t('features.subheading', { defaultValue: 'Everything you need to run a high-performance game server, built right into a modern panel.' })}
              </p>
            </div>

            <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
              {/* Feature 1: Instant Setup */}
              <div className="bg-white dark:bg-slate-800 p-8 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm hover:shadow-md transition-shadow">
                <div className="w-12 h-12 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-xl flex items-center justify-center mb-6">
                  <RocketLaunchIcon className="h-6 w-6" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-3">{t('features.instant.title')}</h3>
                <p className="text-gray-500 dark:text-gray-400 leading-relaxed">
                  {t('features.instant.description')}
                </p>
              </div>

              {/* Feature 2: Hourly Billing */}
              <div className="bg-white dark:bg-slate-800 p-8 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm hover:shadow-md transition-shadow">
                <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 rounded-xl flex items-center justify-center mb-6">
                  <CreditCardIcon className="h-6 w-6" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-3">{t('features.billing.title')}</h3>
                <p className="text-gray-500 dark:text-gray-400 leading-relaxed">
                  {t('features.billing.description')}
                </p>
              </div>

              {/* Feature 3: NVMe Storage */}
              <div className="bg-white dark:bg-slate-800 p-8 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm hover:shadow-md transition-shadow">
                <div className="w-12 h-12 bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 rounded-xl flex items-center justify-center mb-6">
                  <CircleStackIcon className="h-6 w-6" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-3">{t('features.storage.title')}</h3>
                <p className="text-gray-500 dark:text-gray-400 leading-relaxed">
                  {t('features.storage.description')}
                </p>
              </div>

              {/* Feature 4: Auto-Stop (New) */}
              <div className="bg-white dark:bg-slate-800 p-8 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm hover:shadow-md transition-shadow">
                <div className="w-12 h-12 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-xl flex items-center justify-center mb-6">
                  <ClockIcon className="h-6 w-6" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-3">{t('features.autostop.title', { defaultValue: 'Smart Auto-Stop' })}</h3>
                <p className="text-gray-500 dark:text-gray-400 leading-relaxed">
                  {t('features.autostop.description', { defaultValue: 'Never pay for an empty server. Our system automatically stops your server when no players are online.' })}
                </p>
              </div>

              {/* Feature 5: File Manager (New) */}
              <div className="bg-white dark:bg-slate-800 p-8 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm hover:shadow-md transition-shadow">
                <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-xl flex items-center justify-center mb-6">
                  <FolderOpenIcon className="h-6 w-6" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-3">{t('features.files.title', { defaultValue: 'Full File Access' })}</h3>
                <p className="text-gray-500 dark:text-gray-400 leading-relaxed">
                  {t('features.files.description', { defaultValue: 'Manage your server files directly from the browser with our advanced file manager and editor.' })}
                </p>
              </div>

              {/* Feature 6: Console (New) */}
              <div className="bg-white dark:bg-slate-800 p-8 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm hover:shadow-md transition-shadow">
                <div className="w-12 h-12 bg-rose-100 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 rounded-xl flex items-center justify-center mb-6">
                  <CommandLineIcon className="h-6 w-6" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-3">{t('features.console.title', { defaultValue: 'Live Console' })}</h3>
                <p className="text-gray-500 dark:text-gray-400 leading-relaxed">
                  {t('features.console.description', { defaultValue: 'Monitor your server logs in real-time and execute commands instantly from the dashboard.' })}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* How it Works Section */}
        <section className="bg-white dark:bg-slate-950 py-20 lg:py-28 overflow-hidden">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                <div className="text-center mb-16">
                    <h2 className="text-3xl font-extrabold text-gray-900 dark:text-white sm:text-4xl">
                        {t('steps.heading', { defaultValue: 'Launch in seconds' })}
                    </h2>
                    <p className="mt-4 text-lg text-gray-500 dark:text-gray-400">
                        {t('steps.subheading', { defaultValue: 'Getting started with Spawnly is easy and credit-based.' })}
                    </p>
                </div>

                <div className="relative grid grid-cols-1 md:grid-cols-3 gap-12">
                    {/* Connecting Line (Desktop) */}
                    <div className="hidden md:block absolute top-12 left-1/6 right-1/6 h-0.5 bg-gray-100 dark:bg-slate-800 -z-10"></div>

                    {/* Step 1 */}
                    <div className="relative flex flex-col items-center text-center">
                        <div className="w-24 h-24 bg-white dark:bg-slate-900 border-4 border-indigo-100 dark:border-slate-800 rounded-full flex items-center justify-center mb-6 text-xl font-bold text-indigo-600 dark:text-indigo-400 shadow-sm">
                            1
                        </div>
                        <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">{t('steps.1.title', { defaultValue: 'Create Account' })}</h3>
                        <p className="text-gray-500 dark:text-gray-400">{t('steps.1.desc', { defaultValue: 'Register a free account to access the dashboard.' })}</p>
                    </div>

                    {/* Step 2 */}
                    <div className="relative flex flex-col items-center text-center">
                        <div className="w-24 h-24 bg-white dark:bg-slate-900 border-4 border-indigo-100 dark:border-slate-800 rounded-full flex items-center justify-center mb-6 text-xl font-bold text-indigo-600 dark:text-indigo-400 shadow-sm">
                            2
                        </div>
                        <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">{t('steps.2.title', { defaultValue: 'Top Up Credits' })}</h3>
                        <p className="text-gray-500 dark:text-gray-400">{t('steps.2.desc', { defaultValue: 'Add funds securely. Credits never expire.' })}</p>
                    </div>

                    {/* Step 3 */}
                    <div className="relative flex flex-col items-center text-center">
                        <div className="w-24 h-24 bg-white dark:bg-slate-900 border-4 border-indigo-100 dark:border-slate-800 rounded-full flex items-center justify-center mb-6 text-xl font-bold text-indigo-600 dark:text-indigo-400 shadow-sm">
                            3
                        </div>
                        <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">{t('steps.3.title', { defaultValue: 'Deploy Server' })}</h3>
                        <p className="text-gray-500 dark:text-gray-400">{t('steps.3.desc', { defaultValue: 'Choose your software and RAM. Play instantly.' })}</p>
                    </div>
                </div>
            </div>
        </section>

        {/* --- NEW CREDITS EXPLANATION SECTION --- */}
        <section className="bg-gray-50 dark:bg-slate-900 py-20 lg:py-28 border-t border-gray-100 dark:border-slate-800">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                <div className="max-w-3xl mx-auto text-center mb-16">
                    <h2 className="text-3xl font-extrabold text-gray-900 dark:text-white sm:text-4xl">
                        {t('credits_system.title', { defaultValue: 'Smart Billing for Smart Players' })}
                    </h2>
                    <p className="mt-4 text-lg text-gray-500 dark:text-gray-400">
                        {t('credits_system.subtitle', { defaultValue: 'Stop paying monthly fees for servers that sit empty. Our credit system saves you money.' })}
                    </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    {/* Scenario 1: Weekend Warrior */}
                    <div className="bg-white dark:bg-slate-800 p-8 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm flex flex-col">
                        <div className="mb-6 inline-flex items-center justify-center h-14 w-14 rounded-full bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400">
                            <CalendarDaysIcon className="h-8 w-8" />
                        </div>
                        <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-3">
                            {t('credits_system.examples.weekend.title', { defaultValue: 'The Weekend Warrior' })}
                        </h3>
                        <p className="text-gray-500 dark:text-gray-400 leading-relaxed mb-6 flex-grow">
                            {t('credits_system.examples.weekend.description', { defaultValue: 'You only play on weekends? Turn your server off during the week and save over 70% compared to monthly hosting.' })}
                        </p>
                        <div className="mt-auto text-sm font-semibold text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20 py-2 px-3 rounded-lg w-fit">
                           {t('credits_system.examples.weekend.saving', { defaultValue: 'Save ~70% / mo' })}
                        </div>
                    </div>

                    {/* Scenario 2: Casual Groups */}
                    <div className="bg-white dark:bg-slate-800 p-8 rounded-2xl border border-indigo-100 dark:border-indigo-900/50 shadow-md transform md:-translate-y-4 flex flex-col relative overflow-hidden">
                        <div className="absolute top-0 right-0 bg-indigo-600 text-white text-xs font-bold px-3 py-1 rounded-bl-lg">
                             {t('credits_system.recommended', { defaultValue: 'RECOMMENDED' })}
                        </div>
                        <div className="mb-6 inline-flex items-center justify-center h-14 w-14 rounded-full bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400">
                            <BanknotesIcon className="h-8 w-8" />
                        </div>
                        <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-3">
                             {t('credits_system.examples.casual.title', { defaultValue: 'Casual Groups' })}
                        </h3>
                        <p className="text-gray-500 dark:text-gray-400 leading-relaxed mb-6 flex-grow">
                             {t('credits_system.examples.casual.description', { defaultValue: 'Hosting a game night once a week? You could run a high-performance server for pennies a month.' })}
                        </p>
                         <div className="mt-auto text-sm font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20 py-2 px-3 rounded-lg w-fit">
                           {t('credits_system.examples.casual.saving', { defaultValue: 'Save ~90% / mo' })}
                        </div>
                    </div>

                    {/* Scenario 3: Devs/Testing */}
                    <div className="bg-white dark:bg-slate-800 p-8 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm flex flex-col">
                        <div className="mb-6 inline-flex items-center justify-center h-14 w-14 rounded-full bg-teal-100 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400">
                            <BeakerIcon className="h-8 w-8" />
                        </div>
                        <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-3">
                             {t('credits_system.examples.dev.title', { defaultValue: 'Developers & Testing' })}
                        </h3>
                        <p className="text-gray-500 dark:text-gray-400 leading-relaxed mb-6 flex-grow">
                             {t('credits_system.examples.dev.description', { defaultValue: 'Need to test a modpack or plugin configuration? Spin up a powerful server for 10 minutes, then delete it. Cost: $0.005.' })}
                        </p>
                         <div className="mt-auto text-sm font-semibold text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-900/20 py-2 px-3 rounded-lg w-fit">
                           {t('credits_system.examples.dev.saving', { defaultValue: 'Pay per minute' })}
                        </div>
                    </div>
                </div>
            </div>
        </section>

        {/* Stats / Trust Section */}
        <section className="bg-indigo-900 py-16 lg:py-20 relative overflow-hidden">
          {/* Background Pattern */}
          <div className="absolute inset-0 opacity-10 pattern-grid-lg"></div>
          
          <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 gap-8 sm:grid-cols-3 text-center divide-y sm:divide-y-0 sm:divide-x divide-indigo-800">
              <div className="pt-8 sm:pt-0">
                <p className="text-5xl font-extrabold text-white tracking-tight">99.9%</p>
                <p className="mt-2 text-lg font-medium text-indigo-200">{t('stats.uptime')}</p>
              </div>
              <div className="pt-8 sm:pt-0">
                <p className="text-5xl font-extrabold text-white tracking-tight">NVMe</p>
                <p className="mt-2 text-lg font-medium text-indigo-200">{t('stats.storage')}</p>
              </div>
              <div className="pt-8 sm:pt-0">
                <ShieldCheckIcon className="h-12 w-12 text-white mx-auto mb-2 opacity-80" />
                <p className="text-2xl font-bold text-white mt-[-8px]">DDoS</p>
                <p className="mt-1 text-lg font-medium text-indigo-200">{t('stats.protection')}</p>
              </div>
            </div>
          </div>
        </section>

        {/* CTA Section - With Footer Padding Fix */}
        <section className="bg-white dark:bg-slate-950 pt-20 pb-32">
            <div className="mx-auto max-w-4xl px-4 text-center">
                <h2 className="text-3xl font-extrabold text-gray-900 dark:text-white sm:text-4xl mb-6">
                    {t('cta.title', { defaultValue: 'Ready to start your journey?' })}
                </h2>
                <p className="text-xl text-gray-500 dark:text-gray-400 mb-10">
                    {t('cta.subtitle', { defaultValue: 'Join thousands of other players hosting on Spawnly today.' })}
                </p>
                <Link
                    href="/register"
                    className="inline-flex items-center justify-center rounded-xl border border-transparent bg-indigo-600 px-8 py-4 text-lg font-bold text-white hover:bg-indigo-700 shadow-lg shadow-indigo-500/30 transition-all hover:-translate-y-1"
                >
                    {t('cta.button', { defaultValue: 'Create My Server Now' })}
                </Link>
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