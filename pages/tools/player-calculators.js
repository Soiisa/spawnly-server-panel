// pages/tools/player-calculators.js
import { useState, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useTranslation } from 'next-i18next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import Navbar from '../../components/Navbar';
import ServersFooter from '../../components/ServersFooter';
import { GAME_REGISTRY } from '../../lib/config';
import { 
  CalculatorIcon, MapIcon, FireIcon, CpuChipIcon, TrashIcon, 
  ClockIcon, BoltIcon, HomeModernIcon, MoonIcon, ChevronRightIcon, 
  BeakerIcon, ShieldExclamationIcon, RocketLaunchIcon, ScaleIcon, 
  ViewfinderCircleIcon, CurrencyDollarIcon, SparklesIcon, GlobeEuropeAfricaIcon,
  BriefcaseIcon
} from '@heroicons/react/24/outline';

// ==========================================
// MASTER CALCULATOR CATALOG (Dynamic for i18n)
// ==========================================
const getCategories = (t) => [
  {
    name: t('calculators.categories.survival', 'Hardcore Survival'),
    calculators: [
      { id: 'rust', registryId: 'rust', game: 'Rust', name: t('calculators.names.rust', 'Raid Path Planner'), icon: <FireIcon className="w-5 h-5" />, color: 'orange' },
      { id: 'ark', registryId: 'ark_sa', game: 'ARK: Survival', name: t('calculators.names.ark', 'Maturation & Breeding'), icon: <ScaleIcon className="w-5 h-5" />, color: 'emerald' },
      { id: 'seven_days', registryId: 'seven_days_to_die', game: '7 Days to Die', name: t('calculators.names.seven_days', 'Blood Moon Gamestage'), icon: <MoonIcon className="w-5 h-5" />, color: 'red' },
      { id: 'zomboid', registryId: 'project_zomboid', game: 'Project Zomboid', name: t('calculators.names.zomboid', 'Generator Fuel Usage'), icon: <BoltIcon className="w-5 h-5" />, color: 'yellow' },
      { id: 'conan', registryId: 'conan_exiles', game: 'Conan Exiles', name: t('calculators.names.conan', 'Wheel of Pain Taming'), icon: <ShieldExclamationIcon className="w-5 h-5" />, color: 'amber' },
      { id: 'dayz', registryId: 'dayz', game: 'DayZ', name: t('calculators.names.dayz', 'Metabolism Drain'), icon: <GlobeEuropeAfricaIcon className="w-5 h-5" />, color: 'emerald' },
    ]
  },
  {
    name: t('calculators.categories.rpg', 'Crafting & RPG'),
    calculators: [
      { id: 'minecraft', registryId: 'minecraft', game: 'Minecraft', name: t('calculators.names.minecraft', 'Nether Portal Sync'), icon: <MapIcon className="w-5 h-5" />, color: 'emerald' },
      { id: 'palworld', registryId: 'palworld', game: 'Palworld', name: t('calculators.names.palworld', 'Server Times & Eggs'), icon: <ClockIcon className="w-5 h-5" />, color: 'blue' },
      { id: 'valheim', registryId: 'valheim', game: 'Valheim', name: t('calculators.names.valheim', 'Comfort Base Builder'), icon: <HomeModernIcon className="w-5 h-5" />, color: 'amber' },
      { id: 'v_rising', registryId: 'v_rising', game: 'V Rising', name: t('calculators.names.v_rising', 'Castle Decay & Blood'), icon: <BeakerIcon className="w-5 h-5" />, color: 'rose' },
      { id: 'enshrouded', registryId: 'enshrouded', game: 'Enshrouded', name: t('calculators.names.enshrouded', 'Shroud Time Calc'), icon: <SparklesIcon className="w-5 h-5" />, color: 'indigo' },
      { id: 'stardew', registryId: 'stardew_valley', game: 'Stardew Valley', name: t('calculators.names.stardew', 'Crop Profit Calc'), icon: <CurrencyDollarIcon className="w-5 h-5" />, color: 'emerald' },
    ]
  },
  {
    name: t('calculators.categories.factory', 'Factory & Automation'),
    calculators: [
      { id: 'factorio', registryId: 'factorio', game: 'Factorio', name: t('calculators.names.factorio', 'Belt & Assembly Opt'), icon: <CpuChipIcon className="w-5 h-5" />, color: 'sky' },
      { id: 'satisfactory', registryId: 'satisfactory', game: 'Satisfactory', name: t('calculators.names.satisfactory', 'Coal Power Planner'), icon: <BoltIcon className="w-5 h-5" />, color: 'orange' },
      { id: 'space_engineers', registryId: 'space_engineers', game: 'Space Engineers', name: t('calculators.names.space_engineers', 'Atmospheric Lift'), icon: <RocketLaunchIcon className="w-5 h-5" />, color: 'indigo' },
      { id: 'oni', registryId: null, game: 'Oxygen Not Included', name: t('calculators.names.oni', 'SPOM Calculator'), icon: <BeakerIcon className="w-5 h-5" />, color: 'cyan' },
      { id: 'dsp', registryId: null, game: 'Dyson Sphere', name: t('calculators.names.dsp', 'Matrix Lab Planner'), icon: <GlobeEuropeAfricaIcon className="w-5 h-5" />, color: 'yellow' },
    ]
  },
  {
    name: t('calculators.categories.tactical', 'Tactical & Co-Op'),
    calculators: [
      { id: 'cs2_sens', registryId: 'cs2', game: 'CS2 / Source', name: t('calculators.names.cs2_sens', 'Sensitivity Converter'), icon: <ViewfinderCircleIcon className="w-5 h-5" />, color: 'yellow' },
      { id: 'lethal', registryId: null, game: 'Lethal Company', name: t('calculators.names.lethal', 'Quota Predictor'), icon: <BriefcaseIcon className="w-5 h-5" />, color: 'orange' },
    ]
  }
];

export default function PlayerCalculatorsTool() {
  const { t } = useTranslation('tools');
  const [activeCalcId, setActiveCalcId] = useState('rust');

  const categories = getCategories(t);

  useEffect(() => {
    const hash = window.location.hash.replace('#', '');
    if (hash && categories.some(cat => cat.calculators.some(calc => calc.id === hash))) {
      setActiveCalcId(hash);
    }
  }, [categories]);

  const handleCalcChange = (id) => {
    setActiveCalcId(id);
    window.location.hash = id;
  };

  const schemaMarkup = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "name": t('calculators.seo.schema_name', 'Spawnly Ultimate Game Calculators Hub'),
    "applicationCategory": "GameApplication",
    "operatingSystem": "WebBrowser",
    "offers": { "@type": "Offer", "price": "0", "priceCurrency": "USD" },
    "description": t('calculators.seo.schema_desc', '20+ free web-based gaming calculators for Rust, Enshrouded, Oxygen Not Included, Lethal Company, Stardew Valley, Space Engineers, and more.')
  };

  return (
    <div className="min-h-screen bg-[#020617] bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-[#020617] to-[#020617] flex flex-col selection:bg-indigo-500/30">
      <Head>
        <title>{t('calculators.seo.title', 'Massive Game Calculators: Rust, Enshrouded, Lethal Company | Spawnly')}</title>
        <meta name="description" content={t('calculators.seo.description', '20+ free advanced gaming calculators. Plan Rust raids, calculate Enshrouded Shroud limits, Stardew profits, Lethal Company quotas, and more.')} />
        <link rel="canonical" href="https://spawnly.net/tools/player-calculators" />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schemaMarkup) }} />
      </Head>

      <Navbar />

      <main className="flex-grow w-full max-w-[90rem] mx-auto py-12 px-4 sm:px-6 relative">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3/4 h-64 bg-indigo-500/10 blur-[100px] rounded-full pointer-events-none"></div>

        <div className="text-center mb-12 relative z-10">
          <div className="inline-flex items-center justify-center p-3 bg-indigo-500/10 rounded-2xl mb-5 border border-indigo-500/20 shadow-[0_0_30px_rgba(99,102,241,0.15)]">
            <CalculatorIcon className="w-8 h-8 text-indigo-400" />
          </div>
          <h1 className="text-4xl md:text-5xl font-extrabold text-white mb-4 tracking-tight">{t('calculators.hero.title', 'Massive Calculator Hub')}</h1>
          <p className="text-lg text-slate-400 max-w-2xl mx-auto">
            {t('calculators.hero.subtitle', '20 highly-specialized math and planning tools for the biggest games.')}
          </p>
        </div>

        {/* Mobile Dropdown Navigator */}
        <div className="lg:hidden mb-6 relative z-10">
          <select value={activeCalcId} onChange={(e) => handleCalcChange(e.target.value)} className="w-full bg-slate-900/80 backdrop-blur-md border border-slate-700/50 rounded-xl px-4 py-4 text-white font-bold outline-none focus:ring-2 focus:ring-indigo-500/50 appearance-none shadow-xl">
            {categories.map(cat => (
              <optgroup key={cat.name} label={cat.name} className="bg-slate-950 text-slate-400 font-bold">
                {cat.calculators.map(calc => <option key={calc.id} value={calc.id}>{calc.game} - {calc.name}</option>)}
              </optgroup>
            ))}
          </select>
        </div>

        <div className="flex flex-col lg:flex-row gap-8 min-h-[750px] relative z-10">
          
          {/* Desktop Sidebar Navigation */}
          <div className="hidden lg:flex flex-col w-72 flex-shrink-0 space-y-8 overflow-y-auto custom-scrollbar pr-2 pb-8 h-[750px]">
            {categories.map(category => (
              <div key={category.name}>
                <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-3 px-4">{category.name}</h3>
                <div className="space-y-1.5">
                  {category.calculators.map(calc => {
                    const isActive = activeCalcId === calc.id;
                    return (
                      <button
                        key={calc.id}
                        onClick={() => handleCalcChange(calc.id)}
                        className={`w-full text-left px-4 py-3 rounded-xl font-bold text-sm transition-all duration-300 flex items-center justify-between group ${
                          isActive 
                            ? 'bg-gradient-to-r from-indigo-500/20 to-transparent border-l-2 border-indigo-400 text-white shadow-lg shadow-indigo-500/10' 
                            : 'border-l-2 border-transparent text-slate-400 hover:bg-slate-800/40 hover:text-slate-200'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          {calc.registryId && GAME_REGISTRY[calc.registryId]?.logo ? (
                            <div className="relative">
                              <img 
                                src={GAME_REGISTRY[calc.registryId].logo} 
                                alt={calc.game} 
                                className={`w-6 h-6 rounded-md object-cover transition-all duration-300 ${isActive ? 'opacity-100 ring-2 ring-indigo-500/50 shadow-md shadow-indigo-500/20' : 'opacity-50 group-hover:opacity-80 grayscale-[50%]'}`}
                              />
                            </div>
                          ) : (
                            <span className={`${isActive ? 'text-indigo-400' : `text-${calc.color}-400/70 group-hover:text-${calc.color}-400`}`}>
                              {calc.icon}
                            </span>
                          )}
                          <span className={`${isActive ? 'tracking-wide' : ''} transition-all`}>{calc.game}</span>
                        </div>
                        <ChevronRightIcon className={`w-4 h-4 transition-transform duration-300 ${isActive ? 'translate-x-1 text-indigo-400' : 'opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0'}`} />
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* Main Calculator Body */}
          <div className="flex-grow bg-[#0f172a]/80 backdrop-blur-2xl border border-slate-700/50 rounded-[2rem] overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.5)] ring-1 ring-white/5 relative">
            {activeCalcId === 'rust' && <RustRaidCalculator />}
            {activeCalcId === 'ark' && <ArkBreedingCalculator />}
            {activeCalcId === 'seven_days' && <SevenDaysGamestageCalculator />}
            {activeCalcId === 'zomboid' && <ZomboidCalculator />}
            {activeCalcId === 'conan' && <ConanCalculator />}
            {activeCalcId === 'dayz' && <DayzCalculator />}
            {activeCalcId === 'minecraft' && <MinecraftPortalCalculator />}
            {activeCalcId === 'palworld' && <PalworldCalculator />}
            {activeCalcId === 'valheim' && <ValheimComfortCalculator />}
            {activeCalcId === 'v_rising' && <VRisingCalculator />}
            {activeCalcId === 'enshrouded' && <EnshroudedCalculator />}
            {activeCalcId === 'stardew' && <StardewCalculator />}
            {activeCalcId === 'factorio' && <FactorioCalculator />}
            {activeCalcId === 'satisfactory' && <SatisfactoryPowerCalculator />}
            {activeCalcId === 'space_engineers' && <SpaceEngineersCalculator />}
            {activeCalcId === 'oni' && <OniCalculator />}
            {activeCalcId === 'dsp' && <DspCalculator />}
            {activeCalcId === 'cs2_sens' && <SensConverter />}
            {activeCalcId === 'lethal' && <LethalCompanyCalculator />}
          </div>
        </div>

        {/* SEO & HOSTING UPSELL SECTION */}
        <div className="mt-16 lg:mt-20 bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 rounded-[2rem] p-8 lg:p-12 relative overflow-hidden shadow-2xl">
          <div className="absolute -top-32 -right-32 w-96 h-96 bg-indigo-500/10 rounded-full blur-[120px] pointer-events-none"></div>
          <div className="relative z-10 flex flex-col lg:flex-row items-center justify-between gap-10">
            <div className="max-w-4xl">
              <h2 className="text-3xl md:text-4xl font-extrabold text-white mb-6 tracking-tight leading-tight">
                {t('calculators.upsell.title_1', 'Ready to put these plans to the test?')} <br className="hidden md:block" />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-sky-400">{t('calculators.upsell.title_2', 'Host your own premium game server.')}</span>
              </h2>
              <div className="space-y-4">
                <p className="text-slate-400 text-sm md:text-base leading-relaxed">
                  {t('calculators.upsell.desc_1', 'Stop worrying about server lag, unpredictable wipes, or restrictive admin rules. Spawnly provides high-performance, lag-free game server hosting for over 30+ titles including Rust, Palworld, Enshrouded, Valheim, and 7 Days to Die. Put your raid paths, factory layouts, and base builds into practice in an environment you entirely control.')}
                </p>
                <p className="text-slate-400 text-sm md:text-base leading-relaxed">
                  {t('calculators.upsell.desc_2', 'Our enterprise-grade servers are powered by extreme-performance NVMe SSDs, top-tier CPUs, and robust DDoS protection. Whether you are running a massive Rust clan operation, building a megabase in Satisfactory, or maintaining a persistent V Rising castle, our global network ensures 99.9% uptime and zero rubberbanding.')}
                </p>
              </div>
              <div className="flex flex-wrap gap-3 mt-8">
                <span className="px-4 py-2 bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-xl text-xs font-bold text-slate-300 flex items-center gap-2 shadow-sm">
                  <span className="text-indigo-400 text-base">🚀</span> {t('calculators.upsell.feat_instant', 'Instant Setup')}
                </span>
                <span className="px-4 py-2 bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-xl text-xs font-bold text-slate-300 flex items-center gap-2 shadow-sm">
                  <span className="text-indigo-400 text-base">🛡️</span> {t('calculators.upsell.feat_ddos', 'DDoS Protection')}
                </span>
                <span className="px-4 py-2 bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-xl text-xs font-bold text-slate-300 flex items-center gap-2 shadow-sm">
                  <span className="text-indigo-400 text-base">⚡</span> {t('calculators.upsell.feat_nvme', 'NVMe Storage')}
                </span>
                <span className="px-4 py-2 bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-xl text-xs font-bold text-slate-300 flex items-center gap-2 shadow-sm">
                  <span className="text-indigo-400 text-base">🌍</span> {t('calculators.upsell.feat_global', 'Global Locations')}
                </span>
              </div>
            </div>
            <div className="flex-shrink-0 w-full lg:w-auto flex flex-col items-center">
              <Link href="/pricing" className="block w-full lg:w-64 py-5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-center text-lg rounded-2xl transition-all duration-300 shadow-[0_0_30px_rgba(79,70,229,0.3)] hover:shadow-[0_0_40px_rgba(79,70,229,0.5)] transform hover:-translate-y-1 ring-1 ring-white/10 hover:ring-white/20">
                {t('calculators.upsell.cta', 'View Hosting Plans')}
              </Link>
              <p className="text-center text-xs text-slate-500 mt-4 font-bold tracking-wide uppercase">{t('calculators.upsell.cta_sub', 'Deploy in under 60s')}</p>
            </div>
          </div>
        </div>

      </main>

      <style jsx global>{`
        .hide-arrows::-webkit-outer-spin-button,
        .hide-arrows::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
        .hide-arrows { -moz-appearance: textfield; }
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(51, 65, 85, 0.5); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(79, 70, 229, 0.5); }
        .input-glass { background-color: rgba(30, 41, 59, 0.4); border-color: rgba(51, 65, 85, 0.5); backdrop-filter: blur(8px); }
        .input-glass:focus { background-color: rgba(30, 41, 59, 0.8); border-color: rgba(99, 102, 241, 0.5); box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.1); outline: none; }
      `}</style>
      <ServersFooter />
    </div>
  );
}

// ==========================================
// SSR TRANSLATION INJECTION
// ==========================================
export async function getStaticProps({ locale }) {
  return {
    props: {
      ...(await serverSideTranslations(locale, ['common', 'tools', 'navbar', 'footer'])),
    },
  };
}

// ==========================================
// REUSABLE COMPONENTS
// ==========================================
function StatCard({ title, value, subtext, colorClass = "text-white", pulse = false }) {
  const isIndigo = colorClass.includes('indigo');
  const isEmerald = colorClass.includes('emerald');
  const isRed = colorClass.includes('red') || colorClass.includes('rose');
  const isAmber = colorClass.includes('amber') || colorClass.includes('yellow') || colorClass.includes('orange');
  const isSky = colorClass.includes('sky') || colorClass.includes('blue');

  let glowClass = "shadow-[0_0_15px_rgba(255,255,255,0.05)] border-slate-700/50";
  if (pulse) {
    if (isIndigo) glowClass = "shadow-[0_0_20px_rgba(99,102,241,0.15)] border-indigo-500/30";
    if (isEmerald) glowClass = "shadow-[0_0_20px_rgba(16,185,129,0.15)] border-emerald-500/30";
    if (isRed) glowClass = "shadow-[0_0_20px_rgba(239,68,68,0.15)] border-red-500/30";
    if (isAmber) glowClass = "shadow-[0_0_20px_rgba(245,158,11,0.15)] border-amber-500/30";
    if (isSky) glowClass = "shadow-[0_0_20px_rgba(14,165,233,0.15)] border-sky-500/30";
  }

  return (
    <div className={`bg-slate-800/30 backdrop-blur-md p-6 rounded-2xl border ${glowClass} flex flex-col justify-center transition-all h-full relative overflow-hidden group`}>
      {pulse && <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-current to-transparent opacity-20 ${colorClass}"></div>}
      <span className={`block text-3xl md:text-4xl font-black mb-2 ${colorClass} tracking-tight drop-shadow-md`}>{value}</span>
      <h4 className="text-slate-300 font-bold text-sm tracking-wide">{title}</h4>
      {subtext && <p className="text-slate-500 text-xs mt-1.5 font-medium">{subtext}</p>}
    </div>
  );
}

function NumberInput({ label, value, onChange, min = 0, max, step = 1, className }) {
  const handleChange = (e) => {
    const raw = e.target.value;
    if (raw === '') {
      onChange(parseFloat(min) || 0);
      return;
    }
    const num = parseFloat(raw);
    if (!isNaN(num)) {
      if (max !== undefined && num > max) onChange(max);
      else if (num < min) onChange(parseFloat(min));
      else onChange(num);
    }
  };

  return (
    <div className={className}>
      <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-2">{label}</label>
      <input
        type="number" min={min} max={max} step={step} value={value} onChange={handleChange}
        className="w-full input-glass rounded-xl px-4 py-3.5 text-white font-bold hide-arrows transition-all duration-200"
      />
    </div>
  );
}

function SelectInput({ label, value, onChange, children }) {
  return (
    <div>
      <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-2">{label}</label>
      <select 
        value={value} onChange={onChange} 
        className="w-full input-glass rounded-xl px-4 py-3.5 text-white font-bold transition-all duration-200 cursor-pointer appearance-none bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2224%22%20height%3D%2224%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%2394a3b8%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpolyline%20points%3D%226%209%2012%2015%2018%209%22%3E%3C%2Fpolyline%3E%3C%2Fsvg%3E')] bg-no-repeat bg-[position:right_1rem_center] bg-[length:1.2em_1.2em] pr-10"
      >
        {children}
      </select>
    </div>
  );
}

function ToggleInput({ label, checked, onChange, extraClass="" }) {
  return (
    <div className={`flex items-center gap-3 bg-slate-800/30 hover:bg-slate-800/50 backdrop-blur-sm p-4 rounded-xl border border-slate-700/50 cursor-pointer transition-all duration-200 group ${extraClass}`} onClick={onChange}>
      <div className={`w-5 h-5 rounded flex items-center justify-center border transition-colors ${checked ? 'bg-indigo-500 border-indigo-500' : 'bg-slate-900 border-slate-600 group-hover:border-indigo-400'}`}>
        {checked && <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
      </div>
      <span className={`text-sm font-bold transition-colors ${checked ? 'text-white' : 'text-slate-400 group-hover:text-slate-300'}`}>{label}</span>
    </div>
  );
}


// ==========================================
// ALL CALCULATORS
// ==========================================

// 1. RUST RAID PLANNER
function RustRaidCalculator() {
  const { t } = useTranslation('tools');
  const [cart, setCart] = useState([]);

  const RUST_TARGETS = [
    { id: 'wood_door', name: t('calculators.rust.wood_door', 'Wooden Door'), hp: 200, costs: { c4: 0.5, rocket: 1, satchel: 2, expAmmo: 25 } },
    { id: 'sheet_door', name: t('calculators.rust.sheet_door', 'Sheet Metal Door'), hp: 250, costs: { c4: 1, rocket: 2, satchel: 4, expAmmo: 63 } },
    { id: 'garage_door', name: t('calculators.rust.garage_door', 'Garage Door'), hp: 600, costs: { c4: 2, rocket: 3, satchel: 9, expAmmo: 150 } },
    { id: 'armored_door', name: t('calculators.rust.armored_door', 'Armored Door'), hp: 1000, costs: { c4: 2, rocket: 4, satchel: 12, expAmmo: 200 } },
    { id: 'stone_wall', name: t('calculators.rust.stone_wall', 'Stone Wall'), hp: 500, costs: { c4: 2, rocket: 4, satchel: 10, expAmmo: 185 } },
    { id: 'metal_wall', name: t('calculators.rust.metal_wall', 'Sheet Metal Wall'), hp: 1000, costs: { c4: 4, rocket: 8, satchel: 23, expAmmo: 400 } },
    { id: 'armored_wall', name: t('calculators.rust.armored_wall', 'Armored Wall'), hp: 2000, costs: { c4: 8, rocket: 15, satchel: 46, expAmmo: 800 } },
    { id: 'tc', name: t('calculators.rust.tc', 'Tool Cupboard'), hp: 100, costs: { c4: 1, rocket: 1, satchel: 1, expAmmo: 10 } },
  ];

  const sulfurPerExplosive = { c4: 2200, rocket: 1400, satchel: 480, expAmmo: 25 };
  const labels = { c4: t('calculators.rust.c4', 'C4'), rocket: t('calculators.rust.rockets', 'Rockets'), satchel: t('calculators.rust.satchels', 'Satchels'), expAmmo: t('calculators.rust.exp_ammo', 'Exp. Ammo') };

  const getCheapestType = (costs) => {
    let best = null;
    Object.entries(costs).forEach(([type, qty]) => {
      const sulfur = qty * sulfurPerExplosive[type];
      if (!best || sulfur < best.sulfur) best = { type, sulfur };
    });
    return best.type;
  };

  const addToCart = (id) => {
    setCart(prev => {
      const exist = prev.find(i => i.id === id);
      if (exist) return prev.map(i => i.id === id ? { ...i, qty: i.qty + 1 } : i);
      const target = RUST_TARGETS.find(t => t.id === id);
      return [...prev, { ...target, qty: 1, selectedExplosive: getCheapestType(target.costs) }];
    });
  };

  const updateQty = (id, delta) => setCart(prev => prev.map(i => i.id === id ? { ...i, qty: Math.max(1, i.qty + delta) } : i));
  const remove = (id) => setCart(prev => prev.filter(i => i.id !== id));
  const changeExplosive = (id, type) => setCart(prev => prev.map(i => i.id === id ? { ...i, selectedExplosive: type } : i));

  const totals = cart.reduce((acc, item) => {
    const type = item.selectedExplosive;
    const exactQty = item.costs[type] * item.qty;
    const actualQtyToBring = Math.ceil(exactQty);
    
    acc[type] += actualQtyToBring;
    acc.sulfur += actualQtyToBring * sulfurPerExplosive[type];
    return acc;
  }, { c4: 0, rocket: 0, satchel: 0, expAmmo: 0, sulfur: 0 });

  return (
    <div className="animate-in fade-in flex flex-col xl:flex-row h-full absolute inset-0">
      <div className="xl:w-[35%] bg-slate-900/50 backdrop-blur-sm p-6 xl:p-8 border-b xl:border-b-0 xl:border-r border-slate-700/50 overflow-y-auto custom-scrollbar flex flex-col">
        <h2 className="text-2xl font-black text-white mb-6 flex items-center gap-2">
          <FireIcon className="w-6 h-6 text-orange-500" /> {t('calculators.rust.structures', 'Structures')}
        </h2>
        <div className="space-y-3 flex-grow">
          {RUST_TARGETS.map(t => (
            <button
              key={t.id}
              onClick={() => addToCart(t.id)}
              className="w-full text-left p-4 bg-slate-800/40 border border-slate-700/50 hover:border-orange-500/50 hover:bg-slate-800/80 text-white font-bold text-sm rounded-2xl transition-all duration-200 flex justify-between items-center group shadow-sm"
            >
              <span>{t.name}</span>
              <span className="w-6 h-6 rounded-full bg-slate-900/80 flex items-center justify-center text-slate-400 group-hover:text-orange-400 group-hover:bg-orange-500/10 font-black text-lg transition-colors">+</span>
            </button>
          ))}
        </div>
        {cart.length > 0 && (
          <button onClick={() => setCart([])} className="w-full mt-6 p-4 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 rounded-2xl text-sm font-bold transition-all flex justify-center items-center gap-2">
            <TrashIcon className="w-4 h-4" /> {t('calculators.rust.clear_blueprint', 'Clear Blueprint')}
          </button>
        )}
      </div>

      <div className="xl:w-[65%] p-6 xl:p-10 flex flex-col relative overflow-y-auto custom-scrollbar bg-slate-900/20">
        <h2 className="text-3xl font-extrabold text-white mb-8 tracking-tight">{t('calculators.rust.raid_plan', 'Raid Blueprint')}</h2>
        
        {cart.length === 0 ? (
          <div className="flex-grow flex flex-col items-center justify-center border-2 border-dashed border-slate-700/50 rounded-3xl bg-slate-800/10 text-center p-8">
            <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mb-4">
              <MapIcon className="w-8 h-8 text-slate-500" />
            </div>
            <p className="text-slate-400 font-bold text-lg">{t('calculators.rust.empty_cart', 'Your blueprint is empty.')}</p>
            <p className="text-slate-500 text-sm mt-2">{t('calculators.rust.empty_sub', 'Add doors and walls from the left menu to calculate costs.')}</p>
          </div>
        ) : (
          <div className="flex-grow flex flex-col">
            <div className="space-y-4 mb-10">
              {cart.map(item => (
                <div key={item.id} className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 bg-slate-800/40 backdrop-blur-md p-5 border border-slate-700/50 rounded-2xl shadow-sm hover:border-slate-600/50 transition-colors">
                  <div className="flex-1">
                    <span className="font-bold text-white text-lg">{item.name}</span>
                    <div className="mt-2.5 relative">
                      <select
                        value={item.selectedExplosive}
                        onChange={(e) => changeExplosive(item.id, e.target.value)}
                        className="w-full sm:max-w-[300px] bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-300 outline-none font-bold cursor-pointer appearance-none bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2216%22%20height%3D%2216%22%20viewBox%3D%220%200%24%2024%22%20fill%3D%22none%22%20stroke%3D%22%2394a3b8%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpolyline%20points%3D%226%209%2012%2015%2018%209%22%3E%3C%2Fpolyline%3E%3C%2Fsvg%3E')] bg-no-repeat bg-[position:right_1rem_center] bg-[length:1em_1em] pr-10 focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500/50 transition-all"
                      >
                        {Object.entries(item.costs).map(([type, qty]) => {
                          const sulf = qty * sulfurPerExplosive[type];
                          const isCheapest = getCheapestType(item.costs) === type;
                          return (
                            <option key={type} value={type}>
                              {qty}x {labels[type]} ({sulf.toLocaleString()} {t('calculators.rust.sulfur_short', 'S')}) {isCheapest ? t('calculators.rust.best', '⭐ Best') : ''}
                            </option>
                          );
                        })}
                      </select>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 self-end sm:self-auto">
                    <div className="flex items-center bg-slate-900 border border-slate-700 rounded-xl overflow-hidden shadow-inner">
                      <button onClick={() => updateQty(item.id, -1)} className="px-4 py-2.5 text-slate-400 hover:text-white hover:bg-slate-800 font-black transition-colors">-</button>
                      <span className="text-lg font-bold text-white min-w-[3ch] text-center">{item.qty}</span>
                      <button onClick={() => updateQty(item.id, 1)} className="px-4 py-2.5 text-slate-400 hover:text-white hover:bg-slate-800 font-black transition-colors">+</button>
                    </div>
                    <button onClick={() => remove(item.id)} className="p-3 text-red-500/50 hover:text-red-400 bg-red-500/10 hover:bg-red-500/20 rounded-xl transition-all">
                      <TrashIcon className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-auto pt-8 border-t border-slate-700/50">
              <h3 className="text-sm font-black text-slate-500 uppercase tracking-widest mb-4">{t('calculators.rust.req_loadout', 'Required Loadout')}</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <StatCard title={t('calculators.rust.c4_needed', 'C4 Needed')} value={totals.c4} colorClass={totals.c4 > 0 ? "text-red-400" : "text-slate-600"} />
                <StatCard title={t('calculators.rust.rockets_needed', 'Rockets Needed')} value={totals.rocket} colorClass={totals.rocket > 0 ? "text-orange-400" : "text-slate-600"} />
                <StatCard title={t('calculators.rust.satchels_needed', 'Satchels')} value={totals.satchel} colorClass={totals.satchel > 0 ? "text-yellow-400" : "text-slate-600"} />
                <StatCard title={t('calculators.rust.expammo_needed', 'Exp. Ammo')} value={totals.expAmmo} colorClass={totals.expAmmo > 0 ? "text-amber-300" : "text-slate-600"} />
              </div>
              <div className="bg-gradient-to-r from-emerald-500/20 to-emerald-900/20 backdrop-blur-md border border-emerald-500/30 p-6 md:p-8 rounded-[2rem] flex flex-col md:flex-row items-start md:items-center justify-between shadow-[0_0_30px_rgba(16,185,129,0.15)] ring-1 ring-emerald-500/20">
                <div>
                  <h3 className="text-emerald-400 font-bold text-lg uppercase tracking-wider mb-1">{t('calculators.rust.total_sulfur', 'Total Sulfur Cost')}</h3>
                  <p className="text-emerald-500/70 text-sm font-medium">{t('calculators.rust.combined', 'Combined cost of all selected explosives')}</p>
                </div>
                <span className="text-4xl md:text-5xl font-black text-emerald-400 mt-2 md:mt-0 drop-shadow-md">{totals.sulfur.toLocaleString()}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// 2. ARK BREEDING
function ArkBreedingCalculator() {
  const { t } = useTranslation('tools');
  const [species, setSpecies] = useState('rex');
  const [maturationMulti, setMaturationMulti] = useState(1.0);
  const [cuddleMulti, setCuddleMulti] = useState(1.0);
  const [imprintQuality, setImprintQuality] = useState(1.0);

  const SPECIES_DATA = {
    rex: { name: 'Rex', baseMaturation: 92.58, baseCuddleInterval: 8, cuddlePerImprint: 0.08 },
    giga: { name: 'Giganotosaurus', baseMaturation: 276.45, baseCuddleInterval: 18, cuddlePerImprint: 0.04 },
    argentavis: { name: 'Argentavis', baseMaturation: 69.12, baseCuddleInterval: 8, cuddlePerImprint: 0.08 },
    ptera: { name: 'Pteranodon', baseMaturation: 38.31, baseCuddleInterval: 8, cuddlePerImprint: 0.08 },
    wyvern: { name: 'Wyvern', baseMaturation: 92.58, baseCuddleInterval: 8, cuddlePerImprint: 0.08 },
    rockdrake: { name: 'Rock Drake', baseMaturation: 92.58, baseCuddleInterval: 8, cuddlePerImprint: 0.08 },
    therizino: { name: 'Therizinosaurus', baseMaturation: 92.58, baseCuddleInterval: 8, cuddlePerImprint: 0.08 },
  };

  const speciesInfo = SPECIES_DATA[species];
  const totalMaturationHours = speciesInfo.baseMaturation / (maturationMulti || 0.01);
  const cuddleIntervalHours = speciesInfo.baseCuddleInterval / (cuddleMulti || 0.01);
  const cuddlesNeeded = Math.floor(totalMaturationHours / cuddleIntervalHours);
  const totalImprint = Math.min(1, cuddlesNeeded * speciesInfo.cuddlePerImprint * imprintQuality);

  return (
    <div className="animate-in fade-in flex flex-col md:flex-row h-full absolute inset-0 overflow-y-auto custom-scrollbar">
      <div className="md:w-1/2 p-6 lg:p-10 border-b md:border-b-0 md:border-r border-slate-700/50 flex flex-col justify-center space-y-6 bg-slate-900/20">
        <div>
          <h2 className="text-3xl font-extrabold text-white mb-2">{speciesInfo.name} {t('calculators.ark.breeding', 'Breeding')}</h2>
          <p className="text-slate-400 text-sm">{t('calculators.ark.desc', 'Calculate maturation and imprinting results based on server rates.')}</p>
        </div>
        <SelectInput label={t('calculators.ark.species', 'Species')} value={species} onChange={e => setSpecies(e.target.value)}>
          {Object.entries(SPECIES_DATA).map(([k,v]) => <option key={k} value={k}>{v.name}</option>)}
        </SelectInput>
        <NumberInput label={t('calculators.ark.mature_speed', 'BabyMatureSpeedMultiplier')} value={maturationMulti} onChange={setMaturationMulti} step="0.1" />
        <NumberInput label={t('calculators.ark.cuddle_interval', 'BabyCuddleIntervalMultiplier')} value={cuddleMulti} onChange={setCuddleMulti} step="0.1" />
        <NumberInput label={t('calculators.ark.imprint_qual', 'Imprint Quality Multiplier (0.0–1.0)')} value={imprintQuality} onChange={setImprintQuality} min="0" max="1" step="0.1" />
      </div>
      <div className="md:w-1/2 p-6 lg:p-10 flex flex-col justify-center space-y-6">
        <StatCard title={t('calculators.ark.total_time', 'Total Maturation Time')} value={`${totalMaturationHours.toFixed(1)} ${t('calculators.ark.hours', 'Hours')}`} colorClass="text-emerald-400" pulse />
        <div className="grid grid-cols-2 gap-6">
          <StatCard title={t('calculators.ark.cuddle_inter', 'Cuddle Interval')} value={`${cuddleIntervalHours.toFixed(1)}h`} colorClass="text-sky-400" />
          <StatCard title={t('calculators.ark.poss_cuddles', 'Possible Cuddles')} value={cuddlesNeeded} colorClass="text-amber-400" />
        </div>
        <div className={`p-5 rounded-2xl border font-bold text-center text-lg backdrop-blur-sm ${totalImprint >= 1 ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 shadow-[0_0_20px_rgba(16,185,129,0.1)]' : 'bg-red-500/10 text-red-400 border-red-500/30'}`}>
          {totalImprint >= 1 ? t('calculators.ark.imprint_max', '100% Imprint Achievable 🎉') : `${t('calculators.ark.imprint_cap', 'Max Imprint:')} ${(totalImprint*100).toFixed(0)}%`}
        </div>
      </div>
    </div>
  );
}

// 3. 7 DAYS TO DIE 
function SevenDaysGamestageCalculator() {
  const { t } = useTranslation('tools');
  const [level, setLevel] = useState(1);
  const [daysAlive, setDaysAlive] = useState(1);
  const [players, setPlayers] = useState(1);
  const [difficulty, setDifficulty] = useState('survivalist');
  const [partyLevels, setPartyLevels] = useState('');

  const DIFFICULTY_MODS = { scavenger: 1.0, adventurer: 1.2, nomad: 1.5, warrior: 1.7, survivalist: 2.0, insane: 2.5 };
  const partyLevelsArray = partyLevels.split(',').map(Number).filter(n => !isNaN(n) && n > 0);
  const partySize = partyLevelsArray.length;

  let baseGS;
  if (partySize > 0) {
    const sorted = [...partyLevelsArray].sort((a,b) => b - a);
    const highest = sorted[0];
    const othersSum = sorted.slice(1).reduce((s, l) => s + l * 0.5, 0);
    baseGS = (highest + othersSum) * (1 + 0.25 * (partySize - 1));
  } else {
    baseGS = parseInt(level) + parseInt(daysAlive);
  }

  const multiplayerBonus = (partySize === 0 && players > 1) ? 1.2 : 1.0;
  const finalGS = Math.floor(baseGS * DIFFICULTY_MODS[difficulty] * multiplayerBonus);
  const zombiesPerPlayer = Math.max(1, Math.floor(finalGS / 5));
  const totalZombies = zombiesPerPlayer * (partySize > 0 ? partySize : players);

  return (
    <div className="animate-in fade-in flex flex-col md:flex-row h-full absolute inset-0 overflow-y-auto custom-scrollbar">
      <div className="md:w-1/2 p-6 lg:p-10 border-b md:border-b-0 md:border-r border-slate-700/50 flex flex-col justify-center space-y-6 bg-slate-900/20">
        <div><h2 className="text-3xl font-extrabold text-white mb-2">{t('calculators.7dtd.title', 'Bloodmoon Gamestage')}</h2></div>
        <div className="grid grid-cols-2 gap-4">
          <NumberInput label={t('calculators.7dtd.level', 'Your Level')} value={level} onChange={setLevel} />
          <NumberInput label={t('calculators.7dtd.days', 'Days Alive')} value={daysAlive} onChange={setDaysAlive} />
        </div>
        <NumberInput label={t('calculators.7dtd.players', 'Solo / Simple Co-op Players')} value={players} onChange={setPlayers} min="1" />
        <div>
          <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-2">{t('calculators.7dtd.party', 'Party Levels (comma separated, optional)')}</label>
          <input type="text" value={partyLevels} onChange={e => setPartyLevels(e.target.value)} placeholder={t('calculators.7dtd.party_ph', 'e.g. 45,32,50')} className="w-full input-glass rounded-xl px-4 py-3.5 text-white outline-none font-bold transition-all" />
          <p className="text-xs text-slate-500 mt-2">{t('calculators.7dtd.party_desc', 'Overrides simple co-op count for accurate group formula.')}</p>
        </div>
        <SelectInput label={t('calculators.7dtd.diff', 'Difficulty')} value={difficulty} onChange={e => setDifficulty(e.target.value)}>
          {Object.entries(DIFFICULTY_MODS).map(([k,v]) => <option key={k} value={k}>{k.charAt(0).toUpperCase() + k.slice(1)}</option>)}
        </SelectInput>
      </div>
      <div className="md:w-1/2 p-6 lg:p-10 flex flex-col justify-center space-y-6">
        <StatCard title={t('calculators.7dtd.final_gs', 'Final Gamestage')} value={finalGS} colorClass="text-red-500" pulse />
        <StatCard title={t('calculators.7dtd.horde', 'Est. Horde Size')} value={`~${totalZombies} ${t('calculators.7dtd.zombies', 'zombies')}`} subtext={t('calculators.7dtd.per_wave', 'Per player wave')} colorClass="text-orange-400" />
        {partySize > 0 && <p className="text-sm text-slate-400 font-medium text-center bg-slate-800/40 py-3 rounded-xl border border-slate-700/50">{t('calculators.7dtd.calc_party', 'Calculating for a dynamic party of {{partySize}}.', { partySize })}</p>}
      </div>
    </div>
  );
}

// 4. PROJECT ZOMBOID
function ZomboidCalculator() {
  const { t } = useTranslation('tools');
  const [appliances, setAppliances] = useState([
    { id: 'fridge', name: t('calculators.pz.fridge', 'Refrigerator'), watts: 20, count: 1 },
    { id: 'freezer', name: t('calculators.pz.freezer', 'Freezer'), watts: 30, count: 0 },
    { id: 'oven', name: t('calculators.pz.oven', 'Electric Oven'), watts: 1200, count: 0 },
    { id: 'light', name: t('calculators.pz.light', 'Lamp'), watts: 10, count: 0 },
    { id: 'tv', name: t('calculators.pz.tv', 'TV'), watts: 50, count: 0 },
    { id: 'radio', name: t('calculators.pz.radio', 'Radio'), watts: 5, count: 0 },
    { id: 'antique_oven', name: t('calculators.pz.antique', 'Antique Oven (wood)'), watts: 0, count: 0 },
    { id: 'ice_freezer', name: t('calculators.pz.ice', 'Popsicle Freezer'), watts: 40, count: 0 },
    { id: 'computer', name: t('calculators.pz.computer', 'Computer'), watts: 200, count: 0 },
  ]);
  const [generatorCondition, setGeneratorCondition] = useState(100);

  const updateCount = (id, delta) => setAppliances(prev => prev.map(app => app.id === id ? { ...app, count: Math.max(0, app.count + delta) } : app));
  const totalWatts = appliances.reduce((sum, app) => sum + app.watts * app.count, 0);
  const loadPercent = Math.min(100, (totalWatts / 1000) * 100);
  const fuelPerHour = 2.5 * (totalWatts / 1000) * (generatorCondition / 100);
  const fuelPerDay = fuelPerHour * 24;

  return (
    <div className="animate-in fade-in flex flex-col md:flex-row h-full absolute inset-0 overflow-y-auto custom-scrollbar">
      <div className="md:w-1/2 p-6 lg:p-10 border-b md:border-b-0 md:border-r border-slate-700/50 flex flex-col bg-slate-900/20">
        <h2 className="text-3xl font-extrabold text-white mb-6">{t('calculators.pz.title', 'Generator Fuel Usage')}</h2>
        <div className="space-y-3 flex-grow overflow-y-auto pr-2 custom-scrollbar mb-6">
          {appliances.map(app => (
            <div key={app.id} className="flex items-center justify-between bg-slate-800/40 backdrop-blur-sm p-4 rounded-xl border border-slate-700/50 hover:border-slate-600/50 transition-colors">
              <span className="text-white font-bold text-sm">{app.name} <span className="text-slate-500 font-normal ml-1">({app.watts}W)</span></span>
              <div className="flex items-center gap-1 bg-slate-900/80 rounded-lg p-1 border border-slate-700/50">
                <button onClick={() => updateCount(app.id, -1)} className="w-8 h-8 rounded-md hover:bg-slate-700 text-slate-300 font-black transition-colors">-</button>
                <span className="text-white w-6 text-center font-bold">{app.count}</span>
                <button onClick={() => updateCount(app.id, 1)} className="w-8 h-8 rounded-md hover:bg-slate-700 text-slate-300 font-black transition-colors">+</button>
              </div>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between bg-slate-800/60 backdrop-blur-md p-4 rounded-2xl border border-slate-700/50 mb-4">
          <label className="text-sm font-bold text-slate-300">{t('calculators.pz.cond', 'Generator Condition %')}</label>
          <input type="number" min="1" max="100" value={generatorCondition} onChange={e => setGeneratorCondition(parseInt(e.target.value)||100)} className="w-20 input-glass rounded-lg px-3 py-2 text-white text-center font-bold hide-arrows" />
        </div>
        <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 text-sm text-center">
          <span className="text-slate-400">{t('calculators.pz.load', 'Total Load:')} </span><span className={`font-black text-lg ${loadPercent > 100 ? 'text-red-500' : 'text-white'}`}>{totalWatts}W / 1000W ({loadPercent.toFixed(0)}%)</span>
        </div>
      </div>
      <div className="md:w-1/2 p-6 lg:p-10 flex flex-col justify-center space-y-6">
        <StatCard title={t('calculators.pz.ph', 'Fuel per Hour')} value={`${fuelPerHour.toFixed(2)} L`} colorClass="text-yellow-400" />
        <StatCard title={t('calculators.pz.p24', 'Fuel per 24h')} value={`${fuelPerDay.toFixed(1)} L`} colorClass="text-yellow-500" pulse />
        <p className="text-sm text-center font-medium text-slate-500 bg-slate-800/30 p-4 rounded-xl border border-slate-700/30">
          {t('calculators.pz.tank_msg', 'A full tank (1.5 L) lasts')} <strong className="text-white">{fuelPerHour > 0 ? (1.5 / fuelPerHour).toFixed(1) : '∞'}</strong> {t('calculators.pz.hours', 'hours.')}
        </p>
      </div>
    </div>
  );
}

// 5. CONAN EXILES
function ConanCalculator() {
  const { t } = useTranslation('tools');
  const [thrallTier, setThrallTier] = useState("1");
  const [taskmasterTier, setTaskmasterTier] = useState("none");
  const [wheelType, setWheelType] = useState("greater");
  const [craftSpeedMulti, setCraftSpeedMulti] = useState(1.0);

  const THRALL_BASE_SECONDS = { "1": 3900, "2": 11905, "3": 23627, "4": 92920 };
  const TASKMASTER_BONUS = { none: 1.0, tier1: 0.86, tier2: 0.71, tier3: 0.57, tier4: 0.43 };
  const WHEEL_SPEED_MULT = { lesser: 0.5, normal: 0.75, greater: 1.0 };

  const baseSeconds = THRALL_BASE_SECONDS[thrallTier];
  const taskMod = TASKMASTER_BONUS[taskmasterTier];
  const wheelSpeed = WHEEL_SPEED_MULT[wheelType];
  const realTimeSeconds = (baseSeconds * taskMod) / (wheelSpeed * (craftSpeedMulti || 0.01));
  const hours = Math.floor(realTimeSeconds / 3600);
  const minutes = Math.floor((realTimeSeconds % 3600) / 60);

  return (
    <div className="animate-in fade-in flex flex-col md:flex-row h-full absolute inset-0 overflow-y-auto custom-scrollbar">
      <div className="md:w-1/2 p-6 lg:p-10 border-b md:border-b-0 md:border-r border-slate-700/50 flex flex-col justify-center space-y-6 bg-slate-900/20">
        <div><h2 className="text-3xl font-extrabold text-white mb-2">{t('calculators.conan.title', 'Wheel of Pain Taming')}</h2></div>
        <SelectInput label={t('calculators.conan.captive_tier', 'Thrall Tier')} value={thrallTier} onChange={e => setThrallTier(e.target.value)}>
          <option value="1">{t('calculators.conan.tier_1', 'Tier 1')}</option>
          <option value="2">{t('calculators.conan.tier_2', 'Tier 2')}</option>
          <option value="3">{t('calculators.conan.tier_3', 'Tier 3')}</option>
          <option value="4">{t('calculators.conan.tier_4', 'Tier 4 (Named)')}</option>
        </SelectInput>
        <SelectInput label={t('calculators.conan.taskmaster', 'Taskmaster Thrall')} value={taskmasterTier} onChange={e => setTaskmasterTier(e.target.value)}>
          <option value="none">{t('calculators.conan.tm_none', 'None')}</option>
          <option value="tier1">{t('calculators.conan.tm_1', 'Tier 1 (-14%)')}</option>
          <option value="tier2">{t('calculators.conan.tm_2', 'Tier 2 (-29%)')}</option>
          <option value="tier3">{t('calculators.conan.tm_3', 'Tier 3 (-43%)')}</option>
          <option value="tier4">{t('calculators.conan.tm_4', 'Tier 4 (-57%)')}</option>
        </SelectInput>
        <SelectInput label={t('calculators.conan.wheel_type', 'Wheel Type')} value={wheelType} onChange={e => setWheelType(e.target.value)}>
          <option value="lesser">{t('calculators.conan.wl_lesser', 'Lesser (0.5x)')}</option>
          <option value="normal">{t('calculators.conan.wl_normal', 'Normal (0.75x)')}</option>
          <option value="greater">{t('calculators.conan.wl_greater', 'Greater (1.0x)')}</option>
        </SelectInput>
        <NumberInput label={t('calculators.conan.server_speed', 'Server ThrallCraftSpeedMultiplier')} value={craftSpeedMulti} onChange={setCraftSpeedMulti} step="0.1" />
      </div>
      <div className="md:w-1/2 p-6 lg:p-10 flex flex-col justify-center">
        <StatCard title={t('calculators.conan.time_req', 'Real Time Required')} value={`${hours}h ${minutes}m`} colorClass="text-amber-400" pulse />
      </div>
    </div>
  );
}

// 6. DAYZ
function DayzCalculator() {
  const { t } = useTranslation('tools');
  const [temp, setTemp] = useState("normal");
  const [movement, setMovement] = useState("jog");
  const [sick, setSick] = useState(false);
  const [wet, setWet] = useState(false);

  let tempMulti = { hot: 0.8, normal: 1.0, cold: 1.5, freezing: 2.5 }[temp];
  let moveMulti = { rest: 1.0, walk: 1.5, jog: 3.0, sprint: 5.0 }[movement];
  if (sick) moveMulti *= 1.3;
  if (wet) tempMulti *= 1.2;
  const drainRate = tempMulti * moveMulti;
  const hoursToStarve = 48 / drainRate;

  return (
    <div className="animate-in fade-in flex flex-col md:flex-row h-full absolute inset-0 overflow-y-auto custom-scrollbar">
      <div className="md:w-1/2 p-6 lg:p-10 border-b md:border-b-0 md:border-r border-slate-700/50 flex flex-col justify-center space-y-6 bg-slate-900/20">
        <div><h2 className="text-3xl font-extrabold text-white mb-2">{t('calculators.dayz.title', 'Metabolism Drain')}</h2></div>
        <SelectInput label={t('calculators.dayz.temp', 'Body Temperature')} value={temp} onChange={e => setTemp(e.target.value)}>
          <option value="hot">{t('calculators.dayz.hot', 'Hot')}</option>
          <option value="normal">{t('calculators.dayz.normal', 'Normal')}</option>
          <option value="cold">{t('calculators.dayz.cold', 'Cold')}</option>
          <option value="freezing">{t('calculators.dayz.freezing', 'Freezing')}</option>
        </SelectInput>
        <SelectInput label={t('calculators.dayz.move', 'Movement State')} value={movement} onChange={e => setMovement(e.target.value)}>
          <option value="rest">{t('calculators.dayz.rest', 'Resting')}</option>
          <option value="walk">{t('calculators.dayz.walk', 'Walking')}</option>
          <option value="jog">{t('calculators.dayz.jog', 'Jogging')}</option>
          <option value="sprint">{t('calculators.dayz.sprint', 'Sprinting')}</option>
        </SelectInput>
        <div className="flex gap-4">
          <ToggleInput label={t('calculators.dayz.sick', 'Sick')} checked={sick} onChange={() => setSick(!sick)} extraClass="flex-1" />
          <ToggleInput label={t('calculators.dayz.wet', 'Wet')} checked={wet} onChange={() => setWet(!wet)} extraClass="flex-1" />
        </div>
      </div>
      <div className="md:w-1/2 p-6 lg:p-10 flex flex-col justify-center space-y-6">
        <StatCard title={t('calculators.dayz.burn_rate', 'Calorie Burn Rate')} value={`${drainRate.toFixed(1)}x`} colorClass={drainRate>2?"text-red-500":"text-emerald-400"} />
        <StatCard title={t('calculators.dayz.time_starve', 'Time to Starve')} value={`${hoursToStarve.toFixed(1)}h`} colorClass="text-amber-400" pulse />
      </div>
    </div>
  );
}

// 7. MINECRAFT PORTAL
function MinecraftPortalCalculator() {
  const { t } = useTranslation('tools');
  const [owX, setOwX] = useState(0);
  const [owZ, setOwZ] = useState(0);
  const [mode, setMode] = useState('owToNether');
  const [existingNetherX, setExistingNetherX] = useState(0);
  const [existingNetherZ, setExistingNetherZ] = useState(0);

  let netherX, netherZ;
  if (mode === 'owToNether') {
    netherX = Math.floor(Number(owX) / 8);
    netherZ = Math.floor(Number(owZ) / 8);
  } else {
    netherX = Number(owX);
    netherZ = Number(owZ);
  }
  const displayX = mode === 'owToNether' ? netherX : Number(owX) * 8;
  const displayZ = mode === 'owToNether' ? netherZ : Number(owZ) * 8;

  const distToExisting = Math.sqrt((netherX - existingNetherX)**2 + (netherZ - existingNetherZ)**2);
  const willLink = distToExisting <= 16 && !(existingNetherX===0 && existingNetherZ===0);

  return (
    <div className="animate-in fade-in flex flex-col md:flex-row h-full absolute inset-0 overflow-y-auto custom-scrollbar">
      <div className="md:w-1/2 p-6 lg:p-10 border-b md:border-b-0 md:border-r border-slate-700/50 flex flex-col justify-center space-y-6 bg-slate-900/20">
        <div><h2 className="text-3xl font-extrabold text-white mb-2">{t('calculators.mc.title', 'Nether Portal Linker')}</h2></div>
        <SelectInput label={t('calculators.mc.dir', 'Direction')} value={mode} onChange={e => setMode(e.target.value)}>
          <option value="owToNether">{t('calculators.mc.ow_nether', 'Overworld → Nether')}</option>
          <option value="netherToOw">{t('calculators.mc.nether_ow', 'Nether → Overworld')}</option>
        </SelectInput>
        <div className="grid grid-cols-2 gap-4">
          <NumberInput label={mode==='owToNether'?t('calculators.mc.ow_x',"Overworld X"):t('calculators.mc.net_x',"Nether X")} value={owX} onChange={setOwX} />
          <NumberInput label={mode==='owToNether'?t('calculators.mc.ow_z',"Overworld Z"):t('calculators.mc.net_z',"Nether Z")} value={owZ} onChange={setOwZ} />
        </div>
        <div className="border-t border-slate-700/50 pt-6">
          <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mb-3">{t('calculators.mc.ext_portal', 'Existing Nether Portal Position (Optional)')}</p>
          <div className="grid grid-cols-2 gap-4">
            <input type="number" value={existingNetherX} onChange={e => setExistingNetherX(parseInt(e.target.value)||0)} className="input-glass rounded-xl px-4 py-3.5 text-white font-bold transition-all placeholder:text-slate-600" placeholder={t('calculators.mc.x_coord', 'X Coord')} />
            <input type="number" value={existingNetherZ} onChange={e => setExistingNetherZ(parseInt(e.target.value)||0)} className="input-glass rounded-xl px-4 py-3.5 text-white font-bold transition-all placeholder:text-slate-600" placeholder={t('calculators.mc.z_coord', 'Z Coord')} />
          </div>
          <p className="text-xs text-slate-500 mt-2 font-medium">{t('calculators.mc.ext_desc', 'Used to check if portals will link (within 16 blocks).')}</p>
        </div>
      </div>
      <div className="md:w-1/2 p-6 lg:p-10 flex flex-col justify-center space-y-6">
        <StatCard title={mode==='owToNether'?t('calculators.mc.res_net',"Nether Coordinates"):t('calculators.mc.res_ow',"Overworld Coordinates")} value={`${displayX} , ~, ${displayZ}`} colorClass="text-emerald-400" pulse />
        {(existingNetherX !==0 || existingNetherZ !==0) && (
          <div className={`p-5 rounded-2xl text-base font-bold text-center backdrop-blur-md border shadow-lg ${willLink ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'}`}>
            {willLink ? t('calculators.mc.warn_link', '⚠ Will link to existing portal ({{dist}} blocks away)', { dist: distToExisting.toFixed(1) }) : t('calculators.mc.safe_link', '✓ Safe: Will not interfere ({{dist}} blocks away)', { dist: distToExisting.toFixed(1) })}
          </div>
        )}
      </div>
    </div>
  );
}

// 8. PALWORLD
function PalworldCalculator() {
  const { t } = useTranslation('tools');
  const [eggType, setEggType] = useState('large');
  const [eggMulti, setEggMulti] = useState(1.0);
  const [comfortable, setComfortable] = useState(true);
  const [incubatorSpeed, setIncubatorSpeed] = useState(0);
  const [flameEmperor, setFlameEmperor] = useState(false);

  const BASE_HOURS = { normal: 1, large: 2, huge: 4 };
  const baseTime = BASE_HOURS[eggType] || 2;
  const comfortMod = comfortable ? 1.0 : 0.5;
  let totalSpeedMulti = 1.0;
  if (incubatorSpeed > 0) totalSpeedMulti += incubatorSpeed / 100;
  if (flameEmperor) totalSpeedMulti += 1.0;
  const realHours = (baseTime * parseFloat(eggMulti)) / (comfortMod * totalSpeedMulti);

  return (
    <div className="animate-in fade-in flex flex-col md:flex-row h-full absolute inset-0 overflow-y-auto custom-scrollbar">
      <div className="md:w-1/2 p-6 lg:p-10 border-b md:border-b-0 md:border-r border-slate-700/50 flex flex-col justify-center space-y-6 bg-slate-900/20">
        <div><h2 className="text-3xl font-extrabold text-white mb-2">{t('calculators.palworld.title', 'Egg Incubation Calc')}</h2></div>
        <SelectInput label={t('calculators.palworld.egg_size', 'Egg Size')} value={eggType} onChange={e => setEggType(e.target.value)}>
          <option value="normal">{t('calculators.palworld.egg_norm', 'Normal (1h base)')}</option>
          <option value="large">{t('calculators.palworld.egg_large', 'Large (2h base)')}</option>
          <option value="huge">{t('calculators.palworld.egg_huge', 'Huge (4h base)')}</option>
        </SelectInput>
        <NumberInput label={t('calculators.palworld.server_speed', 'Server Egg Incubation Speed Multiplier')} value={eggMulti} onChange={setEggMulti} step="0.1" />
        <NumberInput label={t('calculators.palworld.incub_bonus', 'Incubator Speed Bonus % (0-200)')} value={incubatorSpeed} onChange={setIncubatorSpeed} min="0" max="200" />
        <div className="flex flex-col sm:flex-row gap-4">
          <ToggleInput label={t('calculators.palworld.comf_temp', 'Comfortable Temp (2x)')} checked={comfortable} onChange={() => setComfortable(!comfortable)} extraClass="flex-1" />
          <ToggleInput label={t('calculators.palworld.flame_emp', 'Flame Emperor (+100%)')} checked={flameEmperor} onChange={() => setFlameEmperor(!flameEmperor)} extraClass="flex-1" />
        </div>
      </div>
      <div className="md:w-1/2 p-6 lg:p-10 flex flex-col justify-center">
        <StatCard title={t('calculators.palworld.real_time', 'Real Incubation Time')} value={`${realHours.toFixed(2)} ${t('calculators.palworld.hours', 'Hours')}`} colorClass="text-blue-400" pulse />
      </div>
    </div>
  );
}

// 9. VALHEIM
function ValheimComfortCalculator() {
  const { t } = useTranslation('tools');
  const [activeItems, setActiveItems] = useState(new Set(['shelter', 'fire']));
  const COMFORT_ITEMS = [
    { id: 'shelter', name: t('calculators.valheim.shelter', 'Shelter (+2)'), val: 2 }, { id: 'fire', name: t('calculators.valheim.fire', 'Campfire (+1)'), val: 1 },
    { id: 'bed', name: t('calculators.valheim.bed', 'Bed (+1)'), val: 1 }, { id: 'deer_rug', name: t('calculators.valheim.deer', 'Deer Rug (+1)'), val: 1 },
    { id: 'wolf_rug', name: t('calculators.valheim.wolf', 'Wolf Rug (+1)'), val: 1 }, { id: 'lox_rug', name: t('calculators.valheim.lox', 'Lox Rug (+1)'), val: 1 },
    { id: 'banner', name: t('calculators.valheim.banner', 'Banner (+1)'), val: 1 }, { id: 'chair', name: t('calculators.valheim.chair', 'Chair (+1)'), val: 1 },
    { id: 'table', name: t('calculators.valheim.table', 'Table (+1)'), val: 1 }, { id: 'bench', name: t('calculators.valheim.bench', 'Bench (+1)'), val: 1 },
    { id: 'hot_tub', name: t('calculators.valheim.hot_tub', 'Hot Tub (+2)'), val: 2 }, { id: 'crystal_throne', name: t('calculators.valheim.crystal', 'Crystal Throne (+2)'), val: 2 },
    { id: 'maypole', name: t('calculators.valheim.maypole', 'Maypole (+1)'), val: 1 }, { id: 'yule_tree', name: t('calculators.valheim.yule', 'Yule Tree (+1)'), val: 1 },
  ];
  const toggleItem = (id) => {
    const next = new Set(activeItems);
    next.has(id) ? next.delete(id) : next.add(id);
    setActiveItems(next);
  };
  const totalComfort = 1 + Array.from(activeItems).reduce((acc, id) => acc + (COMFORT_ITEMS.find(i=>i.id===id)?.val || 0), 0);
  return (
    <div className="animate-in fade-in flex flex-col md:flex-row h-full absolute inset-0 overflow-y-auto custom-scrollbar">
      <div className="md:w-1/2 p-6 lg:p-10 border-b md:border-b-0 md:border-r border-slate-700/50 flex flex-col bg-slate-900/20">
        <h2 className="text-3xl font-extrabold text-white mb-6">{t('calculators.valheim.title', 'Comfort Base Builder')}</h2>
        <div className="grid grid-cols-2 gap-3 flex-grow overflow-y-auto pr-2 custom-scrollbar">
          {COMFORT_ITEMS.map(item => (
            <button key={item.id} onClick={() => toggleItem(item.id)} className={`p-4 rounded-xl border text-sm font-bold transition-all duration-200 shadow-sm ${activeItems.has(item.id) ? 'bg-amber-500/20 border-amber-500/50 text-amber-400' : 'bg-slate-800/40 hover:bg-slate-800/80 border-slate-700/50 text-slate-400 hover:border-slate-500/50'}`}>
              {item.name}
            </button>
          ))}
        </div>
      </div>
      <div className="md:w-1/2 p-6 lg:p-10 flex flex-col justify-center space-y-6">
        <StatCard title={t('calculators.valheim.level', 'Comfort Level')} value={totalComfort} colorClass="text-amber-300" />
        <StatCard title={t('calculators.valheim.rested_dur', 'Rested Buff Duration')} value={`${7 + totalComfort} ${t('calculators.valheim.mins', 'Minutes')}`} colorClass="text-amber-500" pulse />
        <p className="text-sm text-center font-medium text-slate-400 bg-slate-800/30 p-4 rounded-xl border border-slate-700/30">{t('calculators.valheim.rested_desc', 'Rested buff grants ')} <strong className="text-white">{t('calculators.valheim.rested_strong', '+50% HP regen, +100% Stamina regen, and +50% XP.')}</strong></p>
      </div>
    </div>
  );
}

// 10. V RISING
function VRisingCalculator() {
  const { t } = useTranslation('tools');
  const [heartLevel, setHeartLevel] = useState(1);
  const [essence, setEssence] = useState(1000);
  const [bloodQuality, setBloodQuality] = useState(0);

  const dailyConsumption = { 1: 1200, 2: 2400, 3: 3600, 4: 4800 }[heartLevel];
  const hoursUntilDecay = essence / (dailyConsumption / 24);
  const bloodBoost = 1 + (bloodQuality / 100) * 0.2;
  const effectiveHours = hoursUntilDecay * bloodBoost;

  return (
    <div className="animate-in fade-in flex flex-col md:flex-row h-full absolute inset-0 overflow-y-auto custom-scrollbar">
      <div className="md:w-1/2 p-6 lg:p-10 border-b md:border-b-0 md:border-r border-slate-700/50 flex flex-col justify-center space-y-6 bg-slate-900/20">
        <div><h2 className="text-3xl font-extrabold text-white mb-2">{t('calculators.v_rising.title', 'Castle Decay Calc')}</h2></div>
        <SelectInput label={t('calculators.v_rising.heart', 'Castle Heart Level')} value={heartLevel} onChange={e => setHeartLevel(Number(e.target.value))}>
          {[1,2,3,4].map(l => <option key={l} value={l}>{t('calculators.v_rising.level', 'Level')} {l} ({[0, 1200, 2400, 3600, 4800][l]}/{t('calculators.v_rising.day', 'day')})</option>)}
        </SelectInput>
        <NumberInput label={t('calculators.v_rising.essence', 'Current Blood Essence')} value={essence} onChange={setEssence} />
        <NumberInput label={t('calculators.v_rising.quality', 'Blood Quality % (0–100)')} value={bloodQuality} onChange={setBloodQuality} min="0" max="100" />
        <p className="text-xs text-slate-500 font-medium">{t('calculators.v_rising.desc', 'Higher blood quality reduces essence consumption by up to 20%.')}</p>
      </div>
      <div className="md:w-1/2 p-6 lg:p-10 flex flex-col justify-center space-y-6">
        <StatCard title={t('calculators.v_rising.time_decay', 'Time Until Decay')} value={`${hoursUntilDecay.toFixed(1)} h`} colorClass="text-rose-500" />
        {bloodQuality > 0 && <StatCard title={t('calculators.v_rising.eff_time', 'Effective Time (With Blood Quality)')} value={`${effectiveHours.toFixed(1)} h`} subtext={t('calculators.v_rising.reduced', 'Reduced consumption')} colorClass="text-red-400" pulse />}
      </div>
    </div>
  );
}

// 11. ENSHROUDED
function EnshroudedCalculator() {
  const { t } = useTranslation('tools');
  const [altar, setAltar] = useState(1);
  const [skill, setSkill] = useState(false);
  const [flask, setFlask] = useState(0);
  const baseTime = 5;
  const altarBonus = parseInt(altar) - 1;
  const skillBonus = skill ? 2 : 0;
  const flaskBonus = parseInt(flask);
  const totalMins = baseTime + altarBonus + skillBonus + flaskBonus;
  return (
    <div className="animate-in fade-in flex flex-col md:flex-row h-full absolute inset-0 overflow-y-auto custom-scrollbar">
      <div className="md:w-1/2 p-6 lg:p-10 border-b md:border-b-0 md:border-r border-slate-700/50 flex flex-col justify-center space-y-6 bg-slate-900/20">
        <div><h2 className="text-3xl font-extrabold text-white mb-2">{t('calculators.enshrouded.title', 'Shroud Time Calc')}</h2></div>
        <SelectInput label={t('calculators.enshrouded.altar', 'Flame Altar Level')} value={altar} onChange={e => setAltar(e.target.value)}>
          {[1,2,3,4,5,6].map(l => <option key={l} value={l}>{t('calculators.enshrouded.level', 'Level')} {l} (+{l-1} {t('calculators.enshrouded.mins', 'mins')})</option>)}
        </SelectInput>
        <SelectInput label={t('calculators.enshrouded.flask', 'Active Flask')} value={flask} onChange={e => setFlask(e.target.value)}>
          <option value="0">{t('calculators.enshrouded.none', 'None')}</option>
          <option value="2">{t('calculators.enshrouded.surv', 'Survival Flask (+2)')}</option>
          <option value="4">{t('calculators.enshrouded.great', 'Greater Survival (+4)')}</option>
        </SelectInput>
        <ToggleInput label={t('calculators.enshrouded.inner', 'Inner Fires Skill (+2 mins)')} checked={skill} onChange={() => setSkill(!skill)} />
      </div>
      <div className="md:w-1/2 p-6 lg:p-10 flex flex-col justify-center">
        <StatCard title={t('calculators.enshrouded.safe', 'Total Safe Time')} value={`${totalMins}:00`} colorClass="text-indigo-400" pulse />
      </div>
    </div>
  );
}

// 12. STARDEW
function StardewCalculator() {
  const { t } = useTranslation('tools');
  const CROPS = {
    parsnip: { name: t('calculators.stardew.parsnip', 'Parsnip'), growDays: 4, cost: 20, sell: 35, regrow: false },
    strawberry: { name: t('calculators.stardew.strawberry', 'Strawberry'), growDays: 8, cost: 100, sell: 120, regrow: 4 },
    blueberry: { name: t('calculators.stardew.blueberry', 'Blueberry'), growDays: 13, cost: 80, sell: 150, regrow: 4 },
    cranberry: { name: t('calculators.stardew.cranberry', 'Cranberry'), growDays: 7, cost: 240, sell: 150, regrow: 5 },
    ancient: { name: t('calculators.stardew.ancient', 'Ancient Fruit'), growDays: 28, cost: 0, sell: 550, regrow: 7 },
  };
  const FERTILIZERS = { none: { qualityMult: 1.0, speedBoost: 0 }, basic: { qualityMult: 1.1, speedBoost: 0 }, quality: { qualityMult: 1.25, speedBoost: 0 }, deluxe: { qualityMult: 1.4, speedBoost: 25 } };
  const PROFESSIONS = { none: 1.0, tiller: 1.1, artisan: 1.4 };

  const [crop, setCrop] = useState('blueberry');
  const [planted, setPlanted] = useState(100);
  const [daysLeft, setDaysLeft] = useState(28);
  const [fertilizer, setFertilizer] = useState('none');
  const [profession, setProfession] = useState('none');

  const sel = CROPS[crop];
  const fert = FERTILIZERS[fertilizer];
  const profMult = PROFESSIONS[profession];
  const effectiveGrowDays = Math.max(1, sel.growDays * (1 - fert.speedBoost / 100));
  let harvests = 0;
  if (daysLeft >= effectiveGrowDays) {
    harvests = 1;
    if (sel.regrow) harvests += Math.floor((daysLeft - effectiveGrowDays) / sel.regrow);
  }
  const avgSellPrice = sel.sell * fert.qualityMult * profMult;
  const grossRev = harvests * planted * avgSellPrice;
  const netProfit = grossRev - (planted * sel.cost);

  return (
    <div className="animate-in fade-in flex flex-col md:flex-row h-full absolute inset-0 overflow-y-auto custom-scrollbar">
      <div className="md:w-1/2 p-6 lg:p-10 border-b md:border-b-0 md:border-r border-slate-700/50 flex flex-col justify-center space-y-5 bg-slate-900/20">
        <div><h2 className="text-3xl font-extrabold text-white mb-2">{t('calculators.stardew.title', 'Crop Profit Optimizer')}</h2></div>
        <SelectInput label={t('calculators.stardew.crop', 'Crop')} value={crop} onChange={e => setCrop(e.target.value)}>
          {Object.entries(CROPS).map(([k,v])=><option key={k} value={k}>{v.name}</option>)}
        </SelectInput>
        <div className="grid grid-cols-2 gap-4">
          <NumberInput label={t('calculators.stardew.planted', 'Planted')} value={planted} onChange={setPlanted} />
          <NumberInput label={t('calculators.stardew.days_left', 'Days Left')} value={daysLeft} onChange={setDaysLeft} max="28" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <SelectInput label={t('calculators.stardew.fert', 'Fertilizer')} value={fertilizer} onChange={e => setFertilizer(e.target.value)}>
            <option value="none">{t('calculators.stardew.none', 'None')}</option>
            <option value="basic">{t('calculators.stardew.basic', 'Basic')}</option>
            <option value="quality">{t('calculators.stardew.quality', 'Quality')}</option>
            <option value="deluxe">{t('calculators.stardew.deluxe', 'Deluxe (+25% SPD)')}</option>
          </SelectInput>
          <SelectInput label={t('calculators.stardew.prof', 'Profession')} value={profession} onChange={e => setProfession(e.target.value)}>
            <option value="none">{t('calculators.stardew.none', 'None')}</option>
            <option value="tiller">{t('calculators.stardew.tiller', 'Tiller (+10%)')}</option>
            <option value="artisan">{t('calculators.stardew.artisan', 'Artisan (+40%)')}</option>
          </SelectInput>
        </div>
      </div>
      <div className="md:w-1/2 p-6 lg:p-10 flex flex-col justify-center space-y-6">
        <StatCard title={t('calculators.stardew.harvests', 'Total Harvests')} value={harvests} colorClass="text-sky-400" />
        <StatCard title={t('calculators.stardew.net', 'Net Profit')} value={`${netProfit.toLocaleString()}g`} subtext={`${t('calculators.stardew.avg_sell', 'Avg sell price:')} ${avgSellPrice.toFixed(0)}g`} colorClass="text-emerald-400" pulse />
      </div>
    </div>
  );
}

// 13. FACTORIO
function FactorioCalculator() {
  const { t } = useTranslation('tools');
  const [recipe, setRecipe] = useState('iron_gear');
  const [assemblerSpeed, setAssemblerSpeed] = useState(0.5);
  const [productivityModules, setProductivityModules] = useState(0);
  const [targetItemsPerSec, setTargetItemsPerSec] = useState(2);

  const RECIPES = {
    iron_gear: { name: t('calculators.factorio.iron_gear', 'Iron Gear Wheel'), time: 0.5, output: 1, inputs: { iron_plate: 2 } },
    electronic_circuit: { name: t('calculators.factorio.circuit', 'Electronic Circuit'), time: 0.5, output: 1, inputs: { iron_plate: 1, copper_cable: 3 } },
    copper_cable: { name: t('calculators.factorio.copper_cable', 'Copper Cable'), time: 0.5, output: 2, inputs: { copper_plate: 1 } },
    advanced_circuit: { name: t('calculators.factorio.adv_circuit', 'Advanced Circuit'), time: 6, output: 1, inputs: { electronic_circuit: 2, plastic_bar: 2, copper_cable: 4 } },
  };
  const sel = RECIPES[recipe];
  const prodBonus = productivityModules * 0.04;
  const speedPenalty = productivityModules * 0.05;
  const effectiveSpeed = assemblerSpeed * (1 - speedPenalty);
  const itemsPerCraft = sel.output * (1 + prodBonus);
  const assemblersNeeded = Math.ceil((targetItemsPerSec * sel.time) / (itemsPerCraft * effectiveSpeed));
  
  const craftsPerSec = targetItemsPerSec / itemsPerCraft;
  const inputPerSec = {};
  Object.entries(sel.inputs).forEach(([item, qty]) => {
    inputPerSec[item] = (qty * craftsPerSec).toFixed(2);
  });

  return (
    <div className="animate-in fade-in flex flex-col md:flex-row h-full absolute inset-0 overflow-y-auto custom-scrollbar">
      <div className="md:w-1/2 p-6 lg:p-10 border-b md:border-b-0 md:border-r border-slate-700/50 flex flex-col justify-center space-y-6 bg-slate-900/20">
        <div><h2 className="text-3xl font-extrabold text-white mb-2">{t('calculators.factorio.title', 'Assembly Line Optimizer')}</h2></div>
        <SelectInput label={t('calculators.factorio.recipe', 'Recipe')} value={recipe} onChange={e => setRecipe(e.target.value)}>
          {Object.entries(RECIPES).map(([k,v])=><option key={k} value={k}>{v.name} ({v.time}s)</option>)}
        </SelectInput>
        <NumberInput label={t('calculators.factorio.target', 'Target Output (items/sec)')} value={targetItemsPerSec} onChange={setTargetItemsPerSec} step="0.1" />
        <div className="grid grid-cols-2 gap-4">
          <SelectInput label={t('calculators.factorio.tier', 'Assembler Tier')} value={assemblerSpeed} onChange={e => setAssemblerSpeed(parseFloat(e.target.value))}>
            <option value="0.5">Mk1 (0.5)</option><option value="0.75">Mk2 (0.75)</option><option value="1.25">Mk3 (1.25)</option>
          </SelectInput>
          <NumberInput label={t('calculators.factorio.modules', 'Prod Modules')} value={productivityModules} onChange={setProductivityModules} min="0" max="4" />
        </div>
      </div>
      <div className="md:w-1/2 p-6 lg:p-10 flex flex-col justify-center space-y-6">
        <StatCard title={t('calculators.factorio.assemblers', 'Assemblers Needed')} value={assemblersNeeded} colorClass="text-orange-400" pulse />
        <div className="bg-slate-800/40 backdrop-blur-sm p-6 rounded-2xl border border-slate-700/50 shadow-inner">
          <h4 className="text-sm text-slate-400 font-bold uppercase tracking-widest mb-4">{t('calculators.factorio.inputs', 'Input Materials Req/Sec')}</h4>
          <div className="space-y-2">
            {Object.entries(inputPerSec).map(([item, qty]) => (
              <div key={item} className="flex justify-between items-center bg-slate-900/50 p-3 rounded-lg border border-slate-800/50 text-sm text-white font-medium">
                <span className="capitalize">{item.replace(/_/g,' ')}</span>
                <span className="text-sky-400 font-black">{qty}/s</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// 14. SATISFACTORY
function SatisfactoryPowerCalculator() {
  const { t } = useTranslation('tools');
  const [generators, setGenerators] = useState(8);
  const [overclockPercent, setOverclockPercent] = useState(100);
  const [nodePurity, setNodePurity] = useState('normal');

  const basePower = 75, baseCoal = 15, baseWater = 45;
  const ocMultiplier = overclockPercent / 100;
  const totalPower = generators * basePower * ocMultiplier;
  const totalCoal = generators * baseCoal * ocMultiplier;
  const totalWater = generators * baseWater * ocMultiplier;
  const extractorsNeeded = Math.ceil(totalWater / 120);

  const minerOutput = { impure: 30, normal: 60, pure: 120 }[nodePurity];
  const minersNeeded = Math.ceil(totalCoal / minerOutput);

  return (
    <div className="animate-in fade-in flex flex-col md:flex-row h-full absolute inset-0 overflow-y-auto custom-scrollbar">
      <div className="md:w-1/2 p-6 lg:p-10 border-b md:border-b-0 md:border-r border-slate-700/50 flex flex-col justify-center space-y-6 bg-slate-900/20">
        <div><h2 className="text-3xl font-extrabold text-white mb-2">{t('calculators.satisfactory.title', 'Coal Power Planner')}</h2></div>
        <NumberInput label={t('calculators.satisfactory.gen', 'Generators')} value={generators} onChange={setGenerators} />
        <NumberInput label={t('calculators.satisfactory.overclock', 'Overclock %')} value={overclockPercent} onChange={setOverclockPercent} min="1" max="250" />
        <SelectInput label={t('calculators.satisfactory.node', 'Coal Node Purity (Mk1 Miner)')} value={nodePurity} onChange={e => setNodePurity(e.target.value)}>
          <option value="impure">{t('calculators.satisfactory.impure', 'Impure (30/min)')}</option>
          <option value="normal">{t('calculators.satisfactory.normal', 'Normal (60/min)')}</option>
          <option value="pure">{t('calculators.satisfactory.pure', 'Pure (120/min)')}</option>
        </SelectInput>
      </div>
      <div className="md:w-1/2 p-6 lg:p-10 flex flex-col justify-center space-y-4">
        <StatCard title={t('calculators.satisfactory.power', 'Total Power Output')} value={`${totalPower.toFixed(0)} MW`} colorClass="text-orange-500" pulse />
        <div className="grid grid-cols-2 gap-4">
          <StatCard title={t('calculators.satisfactory.extractors', 'Water Extractors')} value={extractorsNeeded} subtext={`${totalWater.toFixed(0)} m³/min`} colorClass="text-sky-400" />
          <StatCard title={t('calculators.satisfactory.miners', 'Mk1 Miners')} value={minersNeeded} subtext={`${totalCoal.toFixed(0)} ${t('calculators.satisfactory.coal', 'Coal/min')}`} colorClass="text-amber-400" />
        </div>
      </div>
    </div>
  );
}

// 15. SPACE ENGINEERS
function SpaceEngineersCalculator() {
  const { t } = useTranslation('tools');
  const [mass, setMass] = useState(100000);
  const [planet, setPlanet] = useState("earth");
  const [gridSize, setGridSize] = useState("large");
  const [thrusterType, setThrusterType] = useState("atmo");

  const PLANETS = { 
    earth: { name: t('calculators.se.earth', 'EarthLike'), gravity: 9.81, atmoDensity: 1.0 }, 
    mars: { name: t('calculators.se.mars', 'Mars'), gravity: 8.83, atmoDensity: 0.9 }, 
    moon: { name: t('calculators.se.moon', 'Moon'), gravity: 2.45, atmoDensity: 0.0 } 
  };
  const THRUSTERS = { 
    atmo: { name: t('calculators.se.atmo', 'Atmospheric'), largeGrid: { large: 6480000, small: 648000 }, smallGrid: { large: 408000, small: 96000 } }, 
    hydro: { name: t('calculators.se.hydro', 'Hydrogen'), largeGrid: { large: 7160000, small: 1080000 }, smallGrid: { large: 480000, small: 98400 } }, 
    ion: { name: t('calculators.se.ion', 'Ion'), largeGrid: { large: 4320000, small: 345600 }, smallGrid: { large: 172800, small: 14400 } } 
  };

  const selPlanet = PLANETS[planet];
  const selThruster = THRUSTERS[thrusterType];
  const gridData = selThruster[`${gridSize}Grid`];
  let efficiency = 1.0;
  let penaltyReason = "";

  if (thrusterType === 'atmo') { 
    efficiency = selPlanet.atmoDensity; 
    if (efficiency === 0) penaltyReason = t('calculators.se.warn_atmo', 'Atmospheric thrusters do not work in a vacuum.'); 
  }
  else if (thrusterType === 'ion') { 
    efficiency = 1.0 - (selPlanet.atmoDensity * 0.7); 
    if (efficiency < 1.0) penaltyReason = t('calculators.se.warn_ion', 'Ion thrusters lose efficiency in atmosphere.'); 
  }

  const forceNeeded = mass * selPlanet.gravity;
  const largeNeeded = efficiency > 0 ? Math.ceil(forceNeeded / (gridData.large * efficiency)) : "N/A";
  const smallNeeded = efficiency > 0 ? Math.ceil(forceNeeded / (gridData.small * efficiency)) : "N/A";

  return (
    <div className="animate-in fade-in flex flex-col md:flex-row h-full absolute inset-0 overflow-y-auto custom-scrollbar">
      <div className="md:w-1/2 p-6 lg:p-10 border-b md:border-b-0 md:border-r border-slate-700/50 flex flex-col justify-center space-y-6 bg-slate-900/20">
        <div><h2 className="text-3xl font-extrabold text-white mb-2">{t('calculators.se.title', 'Atmospheric Lift')}</h2></div>
        <NumberInput label={t('calculators.se.mass', 'Total Mass (kg)')} value={mass} onChange={setMass} step="1000" />
        <div className="grid grid-cols-2 gap-4">
          <SelectInput label={t('calculators.se.grid', 'Grid Size')} value={gridSize} onChange={e=>setGridSize(e.target.value)}>
            <option value="large">{t('calculators.se.large', 'Large')}</option>
            <option value="small">{t('calculators.se.small', 'Small')}</option>
          </SelectInput>
          <SelectInput label={t('calculators.se.thruster', 'Thruster')} value={thrusterType} onChange={e=>setThrusterType(e.target.value)}>
            <option value="atmo">{t('calculators.se.t_atmo', 'Atmo')}</option>
            <option value="hydro">{t('calculators.se.t_hydro', 'Hydrogen')}</option>
            <option value="ion">{t('calculators.se.t_ion', 'Ion')}</option>
          </SelectInput>
        </div>
        <SelectInput label={t('calculators.se.planet', 'Planet')} value={planet} onChange={e=>setPlanet(e.target.value)}>
          {Object.entries(PLANETS).map(([k,v])=><option key={k} value={k}>{v.name}</option>)}
        </SelectInput>
      </div>
      <div className="md:w-1/2 p-6 lg:p-10 flex flex-col justify-center relative space-y-4">
        {efficiency === 0 ? (
          <div className="bg-red-500/10 border border-red-500/30 p-6 rounded-2xl text-center">
            <ShieldExclamationIcon className="w-12 h-12 text-red-500 mx-auto mb-3" />
            <p className="text-red-400 font-bold text-lg">{penaltyReason}</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-6 h-full">
            <StatCard title={`${t('calculators.se.large', 'Large')} ${selThruster.name}`} value={largeNeeded} colorClass="text-indigo-400" pulse />
            <StatCard title={`${t('calculators.se.small', 'Small')} ${selThruster.name}`} value={smallNeeded} colorClass="text-sky-400" pulse />
          </div>
        )}
      </div>
    </div>
  );
}

// 16. ONI
function OniCalculator() {
  const { t } = useTranslation('tools');
  const [water, setWater] = useState(1000);
  const [dupeTrait, setDupeTrait] = useState('normal');

  const o2Consumption = { normal: 100, mouthBreather: 150, diversLungs: 75 }[dupeTrait];
  const electrolyzers = water / 1000;
  const o2 = water * 0.888;
  const h2 = water * 0.112;
  const dupesSupported = Math.floor(o2 / o2Consumption);
  const power = (h2 / 100) * 800;

  return (
    <div className="animate-in fade-in flex flex-col md:flex-row h-full absolute inset-0 overflow-y-auto custom-scrollbar">
      <div className="md:w-1/2 p-6 lg:p-10 border-b md:border-b-0 md:border-r border-slate-700/50 flex flex-col justify-center space-y-6 bg-slate-900/20">
        <div><h2 className="text-3xl font-extrabold text-white mb-2">{t('calculators.oni.title', 'SPOM Oxygen Calc')}</h2></div>
        <NumberInput label={t('calculators.oni.water', 'Water (g/s)')} value={water} onChange={setWater} step="100" />
        <SelectInput label={t('calculators.oni.trait', 'Duplicant Trait')} value={dupeTrait} onChange={e => setDupeTrait(e.target.value)}>
          <option value="normal">{t('calculators.oni.normal', 'Normal (100 g/s)')}</option>
          <option value="mouthBreather">{t('calculators.oni.mouth', 'Mouth Breather (150 g/s)')}</option>
          <option value="diversLungs">{t('calculators.oni.lungs', "Diver's Lungs (75 g/s)")}</option>
        </SelectInput>
      </div>
      <div className="md:w-1/2 p-6 lg:p-10 flex flex-col justify-center space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <StatCard title={t('calculators.oni.o2', 'O₂ Output')} value={`${o2.toFixed(0)} g/s`} colorClass="text-sky-400" />
          <StatCard title={t('calculators.oni.h2', 'H₂ Output')} value={`${h2.toFixed(0)} g/s`} colorClass="text-rose-400" />
        </div>
        <StatCard title={t('calculators.oni.dupes', 'Dupes Supported')} value={dupesSupported} subtext={t('calculators.oni.elec_need', '{{count}} Electrolyzers needed', { count: electrolyzers.toFixed(1) })} colorClass="text-emerald-400" pulse />
        <StatCard title={t('calculators.oni.power', 'Gross Power')} value={`${power.toFixed(0)} W`} colorClass="text-amber-400" />
      </div>
    </div>
  );
}

// 17. DSP
function DspCalculator() {
  const { t } = useTranslation('tools');
  const [matrix, setMatrix] = useState("blue");
  const [targetSps, setTargetSps] = useState(5);
  const [proliferator, setProliferator] = useState(0);

  const LAB_TIMES = { 
    blue: { name: t('calculators.dsp.blue', 'Blue'), time: 3 }, 
    red: { name: t('calculators.dsp.red', 'Red'), time: 6 }, 
    yellow: { name: t('calculators.dsp.yellow', 'Yellow'), time: 8 }, 
    purple: { name: t('calculators.dsp.purple', 'Purple'), time: 10 }, 
    green: { name: t('calculators.dsp.green', 'Green'), time: 24 }, 
    white: { name: t('calculators.dsp.white', 'White'), time: 15 } 
  };
  
  const sel = LAB_TIMES[matrix];
  const extraProducts = proliferator * 0.2;
  const effectiveSps = targetSps / (1 + extraProducts);
  const labsNeeded = Math.ceil(effectiveSps * sel.time);

  return (
    <div className="animate-in fade-in flex flex-col md:flex-row h-full absolute inset-0 overflow-y-auto custom-scrollbar">
      <div className="md:w-1/2 p-6 lg:p-10 border-b md:border-b-0 md:border-r border-slate-700/50 flex flex-col justify-center space-y-6 bg-slate-900/20">
        <div><h2 className="text-3xl font-extrabold text-white mb-2">{t('calculators.dsp.title', 'Matrix Lab Planner')}</h2></div>
        <SelectInput label={t('calculators.dsp.matrix', 'Matrix Type')} value={matrix} onChange={e => setMatrix(e.target.value)}>
          {Object.entries(LAB_TIMES).map(([k,v])=><option key={k} value={k}>{v.name}</option>)}
        </SelectInput>
        <NumberInput label={t('calculators.dsp.target', 'Target Science/s')} value={targetSps} onChange={setTargetSps} />
        <NumberInput label={t('calculators.dsp.prolif', 'Proliferator Level (0-3)')} value={proliferator} onChange={setProliferator} min="0" max="3" />
      </div>
      <div className="md:w-1/2 p-6 lg:p-10 flex flex-col justify-center">
        <StatCard title={t('calculators.dsp.labs', 'Active Labs Needed')} value={labsNeeded} subtext={t('calculators.dsp.extra', 'Extra products boost: +{{pct}}%', { pct: (extraProducts*100).toFixed(0) })} colorClass="text-yellow-400" pulse />
      </div>
    </div>
  );
}

// 18. SENSITIVITY CONVERTER
function SensConverter() {
  const { t } = useTranslation('tools');
  const [fromGame, setFromGame] = useState('csgo');
  const [toGame, setToGame] = useState('valorant');
  const [sens, setSens] = useState(1.0);
  const [dpi, setDpi] = useState(800);

  const GAMES = { 
    csgo: { name: 'CS2', yaw: 0.022 }, 
    valorant: { name: 'Valorant', yaw: 0.07 }, 
    overwatch: { name: 'Overwatch', yaw: 0.0066 }, 
    apex: { name: 'Apex', yaw: 0.022 }, 
    quake: { name: 'Quake', yaw: 0.022 }, 
    siege: { name: 'Siege', yaw: 0.005 } 
  };
  
  const fromYaw = GAMES[fromGame].yaw;
  const toYaw = GAMES[toGame].yaw;
  const converted = (sens * fromYaw) / toYaw;
  const cm360 = (dpi && converted) ? (360 / (converted * toYaw * dpi * 0.0254)).toFixed(1) : 'N/A';

  return (
    <div className="animate-in fade-in flex flex-col md:flex-row h-full absolute inset-0 overflow-y-auto custom-scrollbar">
      <div className="md:w-1/2 p-6 lg:p-10 border-b md:border-b-0 md:border-r border-slate-700/50 flex flex-col justify-center space-y-6 bg-slate-900/20">
        <div><h2 className="text-3xl font-extrabold text-white mb-2">{t('calculators.sens.title', 'Sensitivity Converter')}</h2></div>
        <div className="grid grid-cols-2 gap-4">
          <SelectInput label={t('calculators.sens.from', 'Convert From')} value={fromGame} onChange={e=>setFromGame(e.target.value)}>
            {Object.entries(GAMES).map(([k,v])=><option key={k} value={k}>{v.name}</option>)}
          </SelectInput>
          <SelectInput label={t('calculators.sens.to', 'Convert To')} value={toGame} onChange={e=>setToGame(e.target.value)}>
            {Object.entries(GAMES).map(([k,v])=><option key={k} value={k}>{v.name}</option>)}
          </SelectInput>
        </div>
        <NumberInput label={t('calculators.sens.current', 'Current Sensitivity')} value={sens} onChange={setSens} step="0.01" />
        <NumberInput label={t('calculators.sens.dpi', 'Mouse DPI')} value={dpi} onChange={setDpi} step="100" />
      </div>
      <div className="md:w-1/2 p-6 lg:p-10 flex flex-col justify-center space-y-6">
        <StatCard title={t('calculators.sens.converted', 'Converted Sensitivity')} value={converted.toFixed(3)} colorClass="text-yellow-400" pulse />
        <StatCard title={t('calculators.sens.cm', 'cm / 360°')} value={cm360} colorClass="text-blue-400" subtext={t('calculators.sens.cm_sub', 'Physical distance for a full turn')} />
      </div>
    </div>
  );
}

// 19. LETHAL COMPANY
function LethalCompanyCalculator() {
  const { t } = useTranslation('tools');
  const [quota, setQuota] = useState(130);
  const [currentScrap, setCurrentScrap] = useState(0);
  const [daysLeft, setDaysLeft] = useState(3);
  const [avgDaily, setAvgDaily] = useState(150);
  const [overtimeDays, setOvertimeDays] = useState(0);

  const projected = parseInt(currentScrap) + (parseInt(daysLeft) + overtimeDays) * parseInt(avgDaily);
  const diff = projected - parseInt(quota);
  const willMeet = diff >= 0;

  return (
    <div className="animate-in fade-in flex flex-col md:flex-row h-full absolute inset-0 overflow-y-auto custom-scrollbar">
      <div className="md:w-1/2 p-6 lg:p-10 border-b md:border-b-0 md:border-r border-slate-700/50 flex flex-col justify-center space-y-6 bg-slate-900/20">
        <div><h2 className="text-3xl font-extrabold text-white mb-2">{t('calculators.lethal.title', 'Quota Predictor')}</h2></div>
        <div className="grid grid-cols-2 gap-4">
          <NumberInput label={t('calculators.lethal.target', 'Target Quota')} value={quota} onChange={setQuota} />
          <NumberInput label={t('calculators.lethal.current', 'Current Scrap')} value={currentScrap} onChange={setCurrentScrap} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <NumberInput label={t('calculators.lethal.days', 'Days Left')} value={daysLeft} onChange={setDaysLeft} max="3" />
          <NumberInput label={t('calculators.lethal.avg', 'Avg Scrap/Day')} value={avgDaily} onChange={setAvgDaily} />
        </div>
        <NumberInput label={t('calculators.lethal.overtime', 'Overtime Days (after deadline)')} value={overtimeDays} onChange={setOvertimeDays} min="0" max="3" />
      </div>
      <div className="md:w-1/2 p-6 lg:p-10 flex flex-col justify-center space-y-6">
        <StatCard title={t('calculators.lethal.projected', 'Projected Total')} value={`$${projected}`} colorClass={willMeet?"text-emerald-400":"text-red-500"} pulse={willMeet} />
        <div className={`p-6 rounded-2xl border font-bold text-center text-xl backdrop-blur-md shadow-lg transition-colors ${willMeet?'bg-emerald-500/10 border-emerald-500/30 text-emerald-400':'bg-red-500/10 border-red-500/30 text-red-500'}`}>
          {willMeet ? t('calculators.lethal.secured', '✅ Quota secured (+${{diff}} surplus)', { diff }) : t('calculators.lethal.fired', '💀 Fired! Short by ${{diff}}', { diff: Math.abs(diff) })}
        </div>
      </div>
    </div>
  );
}