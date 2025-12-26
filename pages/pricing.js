// pages/pricing.js
import { useState } from "react";
import Link from "next/link";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import { 
  CheckIcon, 
  CurrencyDollarIcon, 
  AdjustmentsHorizontalIcon 
} from "@heroicons/react/24/outline";
import { useTranslation, Trans } from "next-i18next"; // <--- IMPORTED
import { serverSideTranslations } from 'next-i18next/serverSideTranslations'; // <--- IMPORTED

export default function Pricing() {
  const { t } = useTranslation('pricing'); // <--- INITIALIZED
  const [ram, setRam] = useState(4);

  // Pricing Logic: 1 Credit = 1 GB RAM per hour
  const creditsPerHour = ram;
  const pricePerHourEuro = (creditsPerHour * 0.01).toFixed(2);

  const features = [
    t('features.ddos'),
    t('features.slots'),
    t('features.files'),
    t('features.mods'),
    t('features.setup'),
    t('features.uptime'),
  ];

  // Dynamic recommendation text based on RAM
  const getRecommendation = (gb) => {
    if (gb <= 2) return t('recommendations.small');
    if (gb <= 4) return t('recommendations.medium');
    if (gb <= 8) return t('recommendations.standard');
    if (gb <= 12) return t('recommendations.heavy');
    if (gb <= 16) return t('recommendations.very_heavy');
    return t('recommendations.massive');
  };

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-slate-950 font-sans text-slate-900 dark:text-slate-100">
      <Navbar />

      <main className="flex-grow">
        
        {/* Header Section */}
        <section className="bg-indigo-900 text-white py-20 px-4 sm:px-6 lg:px-8 text-center relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none">
            <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
              <path d="M0 100 C 20 0 50 0 100 100 Z" fill="white" />
            </svg>
          </div>
          <div className="relative z-10 max-w-3xl mx-auto">
            <h1 className="text-4xl font-extrabold sm:text-5xl mb-6">
              {t('title')}
            </h1>
            <p className="text-xl text-indigo-100 max-w-2xl mx-auto">
              {t('subtitle')}
              <br />
              <span className="font-semibold text-white">{t('credit_explanation')}</span>
            </p>
          </div>
        </section>

        {/* Calculator Section */}
        <section className="relative -mt-16 px-4 sm:px-6 lg:px-8 pb-16">
          <div className="max-w-5xl mx-auto bg-white dark:bg-slate-800 rounded-3xl shadow-xl border border-gray-100 dark:border-slate-700 overflow-hidden">
            <div className="grid grid-cols-1 lg:grid-cols-2">
              
              {/* Left: Interactive Sliders */}
              <div className="p-8 md:p-12">
                <div className="flex items-center gap-3 mb-8">
                  <div className="p-3 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl text-indigo-600 dark:text-indigo-400">
                    <AdjustmentsHorizontalIcon className="w-8 h-8" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white">{t('calculator.title')}</h2>
                    <p className="text-gray-500 dark:text-gray-400">{t('calculator.subtitle')}</p>
                  </div>
                </div>

                <div className="mb-10">
                  <div className="flex justify-between items-end mb-4">
                    <label htmlFor="ram-slider" className="text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
                      {t('calculator.ram_label')}
                    </label>
                    <div className="text-3xl font-bold text-indigo-600 dark:text-indigo-400">
                      {ram} <span className="text-lg text-gray-500 dark:text-gray-400 font-medium">GB</span>
                    </div>
                  </div>
                  
                  <input
                    id="ram-slider"
                    type="range"
                    min="2"
                    max="32"
                    step="1"
                    value={ram}
                    onChange={(e) => setRam(Number(e.target.value))}
                    className="w-full h-3 bg-gray-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                  />
                  <div className="flex justify-between text-xs text-gray-400 dark:text-gray-500 mt-2 font-medium">
                    <span>2 GB</span>
                    <span>16 GB</span>
                    <span>32 GB</span>
                  </div>
                </div>

                <div className="bg-gray-50 dark:bg-slate-700/50 rounded-xl p-6 border border-gray-100 dark:border-slate-600 transition-all duration-300">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">{t('calculator.capabilities')}</h3>
                  <p className="text-gray-700 dark:text-gray-300 text-sm leading-relaxed font-medium">
                    {getRecommendation(ram)}
                  </p>
                </div>
              </div>

              {/* Right: Cost Breakdown */}
              <div className="bg-slate-900 p-8 md:p-12 text-white flex flex-col justify-between">
                <div>
                  <h3 className="text-lg font-medium text-slate-300 mb-6">{t('calculator.estimated_cost')}</h3>
                  
                  <div className="space-y-6">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <CurrencyDollarIcon className="w-6 h-6 text-teal-400" />
                        <span className="text-lg">{t('calculator.hourly_rate')}</span>
                      </div>
                      <div className="text-right">
                        <p className="text-3xl font-bold text-white">{creditsPerHour} <span className="text-base font-normal text-slate-400">credits</span></p>
                        <p className="text-sm text-slate-400">~ €{pricePerHourEuro}</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-10">
                  <Link 
                    href="/register"
                    className="block w-full text-center bg-teal-500 hover:bg-teal-400 text-slate-900 font-bold py-4 px-6 rounded-xl transition-all transform hover:-translate-y-1 shadow-lg shadow-teal-900/20"
                  >
                    {t('calculator.deploy_btn', { ram })}
                  </Link>
                  <p className="text-center text-xs text-slate-500 mt-4">
                    {t('calculator.no_card')}
                  </p>
                </div>
              </div>

            </div>
          </div>
        </section>

        {/* Features List */}
        <section className="py-16 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature, idx) => (
              <div key={idx} className="flex items-center gap-3 p-4 bg-white dark:bg-slate-800 rounded-lg border border-gray-100 dark:border-slate-700 shadow-sm">
                <div className="p-1 bg-green-100 dark:bg-green-900/30 rounded-full">
                  <CheckIcon className="w-4 h-4 text-green-600 dark:text-green-400" />
                </div>
                <span className="text-gray-700 dark:text-gray-300 font-medium">{feature}</span>
              </div>
            ))}
          </div>
        </section>

        {/* FAQ Section */}
        <section className="bg-gray-100 dark:bg-slate-900 py-16 px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">{t('faq.title')}</h2>
            <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
              <Trans
                i18nKey="faq.answer"
                ns="pricing"
                components={[
                  <span key="0" />,
                  <strong key="1" />,
                  <span key="2" />,
                  <strong key="3" />
                ]}
              />
            </p>
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
        'pricing'
      ])),
    },
  };
}