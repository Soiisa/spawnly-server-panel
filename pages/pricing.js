// pages/pricing.js
import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import { 
  CheckCircleIcon, 
  CpuChipIcon,
  CircleStackIcon,
  BoltIcon,
  ShieldCheckIcon,
  GlobeAltIcon,
  WrenchScrewdriverIcon,
  InformationCircleIcon
} from "@heroicons/react/24/outline";
import { useTranslation, Trans } from "next-i18next"; 
import { serverSideTranslations } from 'next-i18next/serverSideTranslations'; 

// The exact pricing matrix mirroring Apex Hosting (1 Euro = 100 Credits)
const apexPricingMatrix = {
  3: 1199,  4: 1499,  5: 1875,  6: 2249,  8: 2799, 
  10: 3500, 12: 3899, 14: 4550, 16: 5199, 20: 6499, 
  24: 7799, 28: 9099, 32: 10399
};

const monthlyTiers = Object.keys(apexPricingMatrix).map(Number).sort((a,b) => a - b);

const getApexCreditCost = (r) => {
  const targetTier = monthlyTiers.find(tier => tier >= r) || 32;
  return apexPricingMatrix[targetTier];
};

export default function Pricing() {
  const { t } = useTranslation('pricing'); 
  const [game, setGame] = useState("minecraft");
  const [billingType, setBillingType] = useState("hourly");
  const [ram, setRam] = useState(4);

  // Game Registry wrapped in useMemo to support live translation
  const GAME_REGISTRY = useMemo(() => ({
    minecraft: {
      name: 'Minecraft',
      subtitle: t('games.minecraft.subtitle', 'Java & Bedrock'),
      minRam: 2,
      allowHourly: true,
      icon: CircleStackIcon,
      color: 'text-green-500'
    },
    satisfactory: {
      name: 'Satisfactory',
      subtitle: t('games.satisfactory.subtitle'),
      minRam: 4, 
      allowHourly: false, 
      icon: WrenchScrewdriverIcon,
      color: 'text-orange-500'
    }
  }), [t]);

  // Enforce Game Minimums and Billing restrictions when selections change
  useEffect(() => {
    const gameConfig = GAME_REGISTRY[game];
    const minRamForGame = gameConfig.minRam;

    if (!gameConfig.allowHourly && billingType === 'hourly') {
        setBillingType('monthly');
        return; 
    }

    if (billingType === 'hourly') {
      if (ram < minRamForGame) setRam(minRamForGame);
    } else {
      const validTiers = monthlyTiers.filter(t => t >= minRamForGame);
      if (!validTiers.includes(ram)) {
        const closest = validTiers.reduce((prev, curr) => 
          Math.abs(curr - ram) < Math.abs(prev - ram) ? curr : prev
        );
        setRam(closest);
      }
    }
  }, [billingType, ram, game, GAME_REGISTRY]);

  const handleRamChange = (e) => {
    if (billingType === 'monthly') {
      setRam(monthlyTiers[Number(e.target.value)]);
    } else {
      setRam(Number(e.target.value));
    }
  };

  const estimatedCost = billingType === 'hourly' 
    ? Math.ceil((ram / 4) * 1.5) 
    : getApexCreditCost(ram);    

  const priceEuro = (estimatedCost / 100).toFixed(2);

  const getRecommendation = (gb) => {
    if (gb <= 2) return t('recommendations.small', { defaultValue: 'Perfect for small survival servers with a few friends.' });
    if (gb <= 4) return t('recommendations.medium', { defaultValue: 'Great for standard communities and light modpacks.' });
    if (gb <= 8) return t('recommendations.standard', { defaultValue: 'Ideal for large player bases and heavy plugins.' });
    if (gb <= 12) return t('recommendations.heavy', { defaultValue: 'Recommended for intensive modpacks (e.g., All The Mods).' });
    if (gb <= 16) return t('recommendations.very_heavy', { defaultValue: 'Massive networks and extreme performance needs.' });
    return t('recommendations.massive', { defaultValue: 'Enterprise-grade hosting for the largest communities.' });
  };

  const currentConfig = GAME_REGISTRY[game];
  const currentMinRam = currentConfig.minRam;
  const currentMinMonthlyIndex = monthlyTiers.findIndex(t => t >= currentMinRam);
  const isHourlyAllowed = currentConfig.allowHourly;

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 font-sans text-slate-900 dark:text-slate-100 transition-colors duration-300">
      <Navbar />

      <main className="flex-grow w-full">
        
        {/* === HEADER SECTION === */}
        <section className="relative pt-24 pb-32 overflow-hidden border-b border-slate-200 dark:border-slate-800/50">
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#cbd5e1_1px,transparent_1px),linear-gradient(to_bottom,#cbd5e1_1px,transparent_1px)] dark:bg-[linear-gradient(to_right,#1e293b_1px,transparent_1px),linear-gradient(to_bottom,#1e293b_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] opacity-30 dark:opacity-20"></div>
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-2xl h-64 bg-blue-600/20 blur-[120px] rounded-full pointer-events-none"></div>

          <div className="w-full px-6 md:px-12 lg:px-24 relative z-10 text-center">
            <h1 className="text-4xl md:text-6xl font-bold tracking-tight text-slate-900 dark:text-white mb-6">
              {t('title', { defaultValue: 'Transparent Pricing.' })}
            </h1>
            <p className="text-lg md:text-xl text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">
              {t('subtitle', { defaultValue: 'Pay exclusively for the resources you use with zero hidden fees.' })}
            </p>
            <div className="mt-8 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 text-blue-700 dark:text-blue-400 text-sm font-semibold">
              <BoltIcon className="w-4 h-4" />
              {t('credit_explanation', { defaultValue: 'Exchange Rate: 100 Credits = €1.00' })}
            </div>
          </div>
        </section>

        {/* === CALCULATOR SECTION === */}
        <section className="relative -mt-20 px-6 md:px-12 lg:px-24 pb-24 z-20">
          <div className="max-w-6xl mx-auto">
            
            {/* Billing Toggle */}
            <div className="flex justify-center mb-8">
              <div className="bg-white dark:bg-slate-900 p-1.5 rounded-full border border-slate-200 dark:border-slate-800 shadow-sm inline-flex relative">
                
                {/* Hourly Button */}
                <button
                  onClick={() => isHourlyAllowed && setBillingType('hourly')}
                  disabled={!isHourlyAllowed}
                  className={`relative flex-1 px-8 py-3 rounded-full font-semibold text-sm transition-all duration-300 z-10 ${
                    !isHourlyAllowed 
                      ? 'opacity-40 cursor-not-allowed text-slate-500' 
                      : billingType === 'hourly' 
                        ? 'text-white' 
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {t('billing.hourly', { defaultValue: 'Hourly Billing' })}
                </button>

                {/* Monthly Button */}
                <button
                  onClick={() => setBillingType('monthly')}
                  className={`relative flex-1 px-8 py-3 rounded-full font-semibold text-sm transition-all duration-300 z-10 ${
                    billingType === 'monthly' ? 'text-white' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {t('billing.monthly', { defaultValue: 'Monthly Billing' })}
                </button>

                {/* Sliding Background Pill */}
                <div 
                  className={`absolute top-1.5 bottom-1.5 w-[calc(50%-0.375rem)] bg-blue-600 rounded-full transition-transform duration-300 ease-out shadow-md`}
                  style={{ transform: billingType === 'hourly' ? 'translateX(0)' : 'translateX(100%)' }}
                ></div>
              </div>
            </div>

            {!isHourlyAllowed && billingType === 'monthly' && (
              <div className="text-center mb-8 flex items-center justify-center gap-2 text-sm text-orange-600 dark:text-orange-400 font-medium">
                <InformationCircleIcon className="w-5 h-5" />
                {t('calculator.hourly_disabled', { defaultValue: 'Hourly billing is currently disabled for {{game}} due to game architecture limitations.', game: currentConfig.name })}
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              
              {/* Left Panel: Configuration */}
              <div className="lg:col-span-7 space-y-8 bg-white dark:bg-slate-900 p-8 md:p-10 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xl dark:shadow-2xl">
                
                <div>
                  <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
                    {t('calculator.configure_title', { defaultValue: 'Configure Your Node' })}
                  </h2>
                  <p className="text-slate-500 dark:text-slate-400 mb-8">
                    {t('calculator.configure_subtitle', { defaultValue: 'Select your game environment and allocate resources.' })}
                  </p>
                </div>

                {/* Game Selection */}
                <div>
                  <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-4 block">
                    {t('calculator.select_game', { defaultValue: '1. Select Environment' })}
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {Object.entries(GAME_REGISTRY).map(([key, config]) => {
                      const GameIcon = config.icon;
                      const isActive = game === key;
                      return (
                        <button
                          key={key}
                          onClick={() => setGame(key)}
                          className={`relative flex items-start gap-4 p-5 rounded-2xl border transition-all duration-200 text-left ${
                            isActive
                              ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-500/10 ring-1 ring-blue-500'
                              : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-slate-50/50 dark:bg-slate-950/50'
                          }`}
                        >
                          <div className={`p-2 rounded-xl bg-white dark:bg-slate-900 shadow-sm border border-slate-100 dark:border-slate-800 ${isActive ? config.color : 'text-slate-400'}`}>
                            <GameIcon className="w-6 h-6" />
                          </div>
                          <div>
                            <h3 className={`font-bold ${isActive ? 'text-slate-900 dark:text-white' : 'text-slate-700 dark:text-slate-300'}`}>
                              {config.name}
                            </h3>
                            <p className="text-xs text-slate-500 font-medium mt-0.5">{config.subtitle}</p>
                          </div>
                          {isActive && (
                            <div className="absolute top-4 right-4 w-2 h-2 rounded-full bg-blue-500 animate-pulse"></div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="w-full h-px bg-slate-100 dark:bg-slate-800"></div>

                {/* RAM Allocation */}
                <div>
                  <div className="flex justify-between items-end mb-6">
                    <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      {t('calculator.ram_label', { defaultValue: '2. Allocate Memory' })}
                    </label>
                    <div className="text-right">
                      <span className="text-4xl font-black text-slate-900 dark:text-white tracking-tight">{ram}</span>
                      <span className="text-lg text-slate-500 font-medium ml-1">GB</span>
                    </div>
                  </div>
                  
                  {billingType === 'monthly' ? (
                    <input
                      type="range" 
                      min={currentMinMonthlyIndex} 
                      max={monthlyTiers.length - 1} 
                      step="1"
                      value={monthlyTiers.indexOf(ram) !== -1 ? monthlyTiers.indexOf(ram) : 0}
                      onChange={handleRamChange}
                      className="w-full h-2 bg-slate-200 dark:bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    />
                  ) : (
                    <input
                      type="range" 
                      min={currentMinRam} 
                      max="32" 
                      step="1"
                      value={ram}
                      onChange={handleRamChange}
                      className="w-full h-2 bg-slate-200 dark:bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    />
                  )}

                  <div className="flex justify-between text-xs text-slate-400 font-semibold mt-3">
                    <span>{currentMinRam} GB</span>
                    <span>32 GB</span>
                  </div>

                  {/* Recommendation Box */}
                  <div className="mt-8 bg-slate-50 dark:bg-slate-950/50 rounded-xl p-5 border border-slate-200 dark:border-slate-800 flex items-start gap-3">
                    <CpuChipIcon className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-sm font-bold text-slate-900 dark:text-white mb-1">
                        {t('calculator.recommendation_title', { defaultValue: 'Deployment Recommendation' })}
                      </h4>
                      <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                        {getRecommendation(ram)}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Panel: Checkout / Invoice Card */}
              <div className="lg:col-span-5">
                <div className="sticky top-28 bg-slate-900 dark:bg-slate-950 p-8 md:p-10 rounded-3xl border border-slate-800 shadow-2xl flex flex-col h-full relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-blue-600/20 blur-[60px] rounded-full pointer-events-none"></div>

                  <h3 className="text-xl font-bold text-white mb-8 flex items-center gap-2">
                    <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                    {t('calculator.estimate_title', { defaultValue: 'Deployment Estimate' })}
                  </h3>
                  
                  <div className="space-y-6 flex-grow">
                    <div className="flex justify-between items-center pb-6 border-b border-slate-800">
                      <div className="text-slate-400 font-medium">{t('calculator.environment', { defaultValue: 'Environment' })}</div>
                      <div className="text-white font-semibold text-right">{currentConfig.name}</div>
                    </div>
                    
                    <div className="flex justify-between items-center pb-6 border-b border-slate-800">
                      <div className="text-slate-400 font-medium">{t('calculator.resources', { defaultValue: 'Resources' })}</div>
                      <div className="text-white font-semibold text-right">
                        {t('calculator.ram_value', { defaultValue: '{{ram}} GB RAM', ram })}
                      </div>
                    </div>

                    <div className="flex justify-between items-center pb-6 border-b border-slate-800">
                      <div className="text-slate-400 font-medium">{t('calculator.billing_cycle', { defaultValue: 'Billing Cycle' })}</div>
                      <div className="text-white font-semibold text-right capitalize">
                        {billingType === 'hourly' 
                          ? t('billing.hourly', { defaultValue: 'Hourly' }) 
                          : t('billing.monthly', { defaultValue: 'Monthly' })
                        }
                      </div>
                    </div>

                    <div className="pt-4">
                      <div className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-2">
                        {t('calculator.total_cost', { defaultValue: 'Total Estimated Cost' })}
                      </div>
                      <div className="flex items-end gap-3 mb-1">
                        <span className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-300">
                          {estimatedCost}
                        </span>
                        <span className="text-xl font-bold text-blue-500 pb-1">Cr</span>
                      </div>
                      <p className="text-slate-400 font-medium">
                        ~ €{priceEuro} <span className="text-sm">{billingType === 'hourly' ? t('calculator.per_hour', { defaultValue: '/ hour' }) : t('calculator.per_month', { defaultValue: '/ month' })}</span>
                      </p>
                    </div>
                  </div>

                  <div className="mt-10">
                    <Link 
                      href="/register"
                      className="block w-full text-center bg-blue-600 hover:bg-blue-500 text-white font-bold py-4 px-6 rounded-xl transition-all shadow-[0_0_20px_rgba(37,99,235,0.3)] hover:shadow-[0_0_30px_rgba(37,99,235,0.5)]"
                    >
                      {t('calculator.deploy_btn', { defaultValue: 'Deploy {{ram}}GB Node', ram })}
                    </Link>
                    <p className="text-center text-xs text-slate-500 font-medium mt-4">
                      {t('calculator.no_card', { defaultValue: 'No credit card required to register.' })}
                    </p>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </section>

        {/* === FEATURES GRID === */}
        <section className="py-24 bg-white dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800/50">
          <div className="w-full px-6 md:px-12 lg:px-24 max-w-7xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-3xl font-bold text-slate-900 dark:text-white mb-4">
                {t('features.included_title', { defaultValue: 'Included with every deployment' })}
              </h2>
              <p className="text-slate-600 dark:text-slate-400">
                {t('features.included_subtitle', { defaultValue: 'Enterprise features come standard. No upsells, no hidden fees.' })}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[
                { title: t('features.ddos', { defaultValue: '480Gbps DDoS Protection' }), icon: ShieldCheckIcon },
                { title: t('features.slots', { defaultValue: 'Unlimited Player Slots' }), icon: GlobeAltIcon },
                { title: t('features.files', { defaultValue: 'Full File Access & FTP' }), icon: CircleStackIcon },
                { title: t('features.mods', { defaultValue: '1-Click Modpack Installers' }), icon: WrenchScrewdriverIcon },
                { title: t('features.setup', { defaultValue: 'Instant Setup in 60s' }), icon: BoltIcon },
                { title: t('features.uptime', { defaultValue: '99.9% Uptime Guarantee' }), icon: CheckCircleIcon },
              ].map((feature, idx) => (
                <div key={idx} className="flex items-center gap-4 p-5 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 transition-colors">
                  <div className="p-2 bg-blue-100 dark:bg-blue-500/10 rounded-lg text-blue-600 dark:text-blue-400">
                    <feature.icon className="w-6 h-6" />
                  </div>
                  <span className="text-slate-800 dark:text-slate-200 font-bold">{feature.title}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* === FAQ SECTION === */}
        <section className="py-24 bg-slate-50 dark:bg-slate-900/50 border-t border-slate-200 dark:border-slate-800/50">
          <div className="max-w-3xl mx-auto px-6 text-center">
            <h2 className="text-3xl font-bold text-slate-900 dark:text-white mb-6">
              {t('faq.title', { defaultValue: 'How does credit billing work?' })}
            </h2>
            <div className="bg-white dark:bg-slate-900 p-8 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 text-left">
              <p className="text-slate-600 dark:text-slate-400 leading-relaxed text-lg">
                <Trans
                  i18nKey="faq.answer"
                  ns="pricing"
                  defaultValue="Spawnly uses a credit-based system. Purchase credits (1 Credit = €0.01) and we deduct them from your balance for every hour your server is <1>Running</1>. If you <3>Stop</3> the server, billing pauses immediately, but your files are kept safe for free."
                  components={[
                    <React.Fragment key="0" />,
                    <strong key="1" className="text-blue-600 dark:text-blue-400" />,
                    <React.Fragment key="2" />,
                    <strong key="3" className="text-blue-600 dark:text-blue-400" />
                  ]}
                />
              </p>
            </div>
          </div>
        </section>

      </main>

      <Footer />
    </div>
  );
}

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