// pages/tools/ram-calculator.js
import { useState, useEffect, useMemo } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useTranslation } from 'next-i18next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import Navbar from '../../components/Navbar';
import ServersFooter from '../../components/ServersFooter';
import { 
  CpuChipIcon,
  ServerStackIcon,
  UserGroupIcon,
  PuzzlePieceIcon,
  ChartBarIcon
} from '@heroicons/react/24/outline';

const getGameProfiles = (t) => ({
  // === SURVIVAL & CRAFTING ===
  minecraft: { id: 'minecraft', name: 'Minecraft', baseRam: 2, perPlayerRam: 0.1, maxPlayers: 100, defaultPlayers: 10, modLevels: [{ id: 'vanilla', name: t('ram_calculator.mods.vanilla', 'Vanilla / Spigot'), multiplier: 1, add: 0 }, { id: 'light', name: t('ram_calculator.mods.light_mods', 'Light Mods (1-30)'), multiplier: 1.2, add: 1 }, { id: 'heavy', name: t('ram_calculator.mods.heavy_mods', 'Heavy Mods (30-100)'), multiplier: 1.5, add: 3 }, { id: 'massive', name: t('ram_calculator.mods.massive_mods', 'Massive Modpacks (200+)'), multiplier: 2.0, add: 6 }] },
  palworld: { id: 'palworld', name: 'Palworld', baseRam: 8, perPlayerRam: 0.25, maxPlayers: 32, defaultPlayers: 8, modLevels: [{ id: 'vanilla', name: t('ram_calculator.mods.std_rates', 'Standard Rates'), multiplier: 1, add: 0 }, { id: 'heavy', name: t('ram_calculator.mods.high_spawn', 'High Spawn Rates / Late Game'), multiplier: 1.2, add: 4 }] },
  rust: { id: 'rust', name: 'Rust', baseRam: 6, perPlayerRam: 0.05, maxPlayers: 200, defaultPlayers: 50, modLevels: [{ id: 'vanilla', name: t('ram_calculator.mods.small_map', 'Small Map (3k)'), multiplier: 1, add: 0 }, { id: 'light', name: t('ram_calculator.mods.med_map', 'Medium Map (4k)'), multiplier: 1.1, add: 2 }, { id: 'heavy', name: t('ram_calculator.mods.large_map', 'Large Map (5k+)'), multiplier: 1.3, add: 4 }] },
  ark_se: { id: 'ark_se', name: 'ARK: Survival Evolved', baseRam: 6, perPlayerRam: 0.1, maxPlayers: 70, defaultPlayers: 20, modLevels: [{ id: 'vanilla', name: t('ram_calculator.mods.island', 'The Island (Base)'), multiplier: 1, add: 0 }, { id: 'light', name: t('ram_calculator.mods.light_mods', 'Light Mods'), multiplier: 1, add: 2 }, { id: 'heavy', name: t('ram_calculator.mods.heavy_gen2', 'Heavy Mods / Gen2'), multiplier: 1.2, add: 6 }] },
  ark_sa: { id: 'ark_sa', name: 'ARK: Survival Ascended', baseRam: 10, perPlayerRam: 0.15, maxPlayers: 70, defaultPlayers: 20, modLevels: [{ id: 'vanilla', name: t('ram_calculator.mods.std_server', 'Standard Server'), multiplier: 1, add: 0 }, { id: 'heavy', name: t('ram_calculator.mods.heavy_modded', 'Heavy Modded'), multiplier: 1.2, add: 4 }] },
  valheim: { id: 'valheim', name: 'Valheim', baseRam: 4, perPlayerRam: 0.1, maxPlayers: 10, defaultPlayers: 5, modLevels: [{ id: 'vanilla', name: t('ram_calculator.mods.vanilla_map', 'Vanilla'), multiplier: 1, add: 0 }, { id: 'modded', name: t('ram_calculator.mods.valheim_plus', 'Valheim Plus / Heavy Mods'), multiplier: 1, add: 2 }] },
  seven_days_to_die: { id: 'seven_days_to_die', name: '7 Days to Die', baseRam: 4, perPlayerRam: 0.2, maxPlayers: 30, defaultPlayers: 8, modLevels: [{ id: 'vanilla', name: t('ram_calculator.mods.vanilla_map', 'Vanilla map'), multiplier: 1, add: 0 }, { id: 'overhaul', name: t('ram_calculator.mods.overhauls', 'Darkness Falls / Overhauls'), multiplier: 1.3, add: 4 }] },
  conan_exiles: { id: 'conan_exiles', name: 'Conan Exiles', baseRam: 6, perPlayerRam: 0.1, maxPlayers: 40, defaultPlayers: 10, modLevels: [{ id: 'vanilla', name: t('ram_calculator.mods.vanilla_map', 'Vanilla'), multiplier: 1, add: 0 }, { id: 'modded', name: t('ram_calculator.mods.aoc_mods', 'Age of Calamitous / Mods'), multiplier: 1.2, add: 4 }] },
  dayz: { id: 'dayz', name: 'DayZ', baseRam: 6, perPlayerRam: 0.05, maxPlayers: 100, defaultPlayers: 40, modLevels: [{ id: 'vanilla', name: t('ram_calculator.mods.vanilla_chernarus', 'Vanilla Chernarus'), multiplier: 1, add: 0 }, { id: 'heavy', name: t('ram_calculator.mods.expansion_mods', 'Expansion / Heavy Mods'), multiplier: 1.2, add: 4 }] },
  enshrouded: { id: 'enshrouded', name: 'Enshrouded', baseRam: 8, perPlayerRam: 0.2, maxPlayers: 16, defaultPlayers: 8, modLevels: [{ id: 'vanilla', name: t('ram_calculator.mods.std_server', 'Standard Server'), multiplier: 1, add: 0 }] },
  sons_of_the_forest: { id: 'sons_of_the_forest', name: 'Sons of the Forest', baseRam: 8, perPlayerRam: 0.2, maxPlayers: 8, defaultPlayers: 8, modLevels: [{ id: 'vanilla', name: t('ram_calculator.mods.std_server', 'Standard Server'), multiplier: 1, add: 0 }] },
  v_rising: { id: 'v_rising', name: 'V Rising', baseRam: 6, perPlayerRam: 0.1, maxPlayers: 40, defaultPlayers: 10, modLevels: [{ id: 'vanilla', name: t('ram_calculator.mods.std_server', 'Standard Server'), multiplier: 1, add: 0 }] },

  // === FACTORY & SIMULATION ===
  satisfactory: { id: 'satisfactory', name: 'Satisfactory', baseRam: 4, perPlayerRam: 0.3, maxPlayers: 8, defaultPlayers: 4, modLevels: [{ id: 'vanilla', name: t('ram_calculator.mods.early_factory', 'Early/Mid Game Factory'), multiplier: 1, add: 0 }, { id: 'late', name: t('ram_calculator.mods.mega_factory', 'Mega Factory (Late Game)'), multiplier: 1.5, add: 4 }] },
  factorio: { id: 'factorio', name: 'Factorio', baseRam: 2, perPlayerRam: 0.1, maxPlayers: 50, defaultPlayers: 10, modLevels: [{ id: 'vanilla', name: t('ram_calculator.mods.std_factory', 'Standard Factory'), multiplier: 1, add: 0 }, { id: 'space_exploration', name: t('ram_calculator.mods.space_exp', 'Space Exploration / Krastorio'), multiplier: 1.5, add: 4 }] },
  space_engineers: { id: 'space_engineers', name: 'Space Engineers', baseRam: 6, perPlayerRam: 0.2, maxPlayers: 16, defaultPlayers: 8, modLevels: [{ id: 'vanilla', name: t('ram_calculator.mods.std_solar', 'Standard Solar System'), multiplier: 1, add: 0 }, { id: 'heavy', name: t('ram_calculator.mods.heavy_grids', 'Heavy Grids / Mods'), multiplier: 1.2, add: 4 }] },
  project_zomboid: { id: 'project_zomboid', name: 'Project Zomboid', baseRam: 4, perPlayerRam: 0.15, maxPlayers: 64, defaultPlayers: 16, modLevels: [{ id: 'vanilla', name: t('ram_calculator.mods.vanilla_map', 'Vanilla'), multiplier: 1, add: 0 }, { id: 'heavy', name: t('ram_calculator.mods.heavy_vehicles', 'Heavy Map Mods / Vehicles'), multiplier: 1.2, add: 4 }] },

  // === SOURCE & TACTICAL ===
  cs2: { id: 'cs2', name: 'Counter-Strike 2', baseRam: 2, perPlayerRam: 0.05, maxPlayers: 24, defaultPlayers: 10, modLevels: [{ id: 'vanilla', name: t('ram_calculator.mods.std_match', 'Standard Matchmaking'), multiplier: 1, add: 0 }] },
  tf2: { id: 'tf2', name: 'Team Fortress 2', baseRam: 2, perPlayerRam: 0.05, maxPlayers: 32, defaultPlayers: 24, modLevels: [{ id: 'vanilla', name: t('ram_calculator.mods.std_match', 'Standard'), multiplier: 1, add: 0 }] },
  gmod: { id: 'gmod', name: "Garry's Mod", baseRam: 2, perPlayerRam: 0.1, maxPlayers: 64, defaultPlayers: 16, modLevels: [{ id: 'vanilla', name: t('ram_calculator.mods.sandbox', 'Sandbox'), multiplier: 1, add: 0 }, { id: 'darkrp', name: t('ram_calculator.mods.darkrp', 'DarkRP / Heavy Addons'), multiplier: 1.5, add: 2 }] },
  squad: { id: 'squad', name: 'Squad', baseRam: 6, perPlayerRam: 0.05, maxPlayers: 100, defaultPlayers: 80, modLevels: [{ id: 'vanilla', name: t('ram_calculator.mods.std_50v50', 'Standard 50v50'), multiplier: 1, add: 0 }] },
  arma3: { id: 'arma3', name: 'Arma 3', baseRam: 4, perPlayerRam: 0.1, maxPlayers: 100, defaultPlayers: 40, modLevels: [{ id: 'vanilla', name: t('ram_calculator.mods.vanilla_light', 'Vanilla / Light Scenarios'), multiplier: 1, add: 0 }, { id: 'heavy', name: t('ram_calculator.mods.heavy_ai', 'Antistasi / ALiVE / Heavy AI'), multiplier: 1.3, add: 4 }] },
  arma_reforger: { id: 'arma_reforger', name: 'Arma Reforger', baseRam: 4, perPlayerRam: 0.1, maxPlayers: 64, defaultPlayers: 32, modLevels: [{ id: 'vanilla', name: t('ram_calculator.mods.vanilla_map', 'Vanilla'), multiplier: 1, add: 0 }] },

  // === INDIE & 2D ===
  terraria: { id: 'terraria', name: 'Terraria (TShock)', baseRam: 2, perPlayerRam: 0.05, maxPlayers: 32, defaultPlayers: 8, modLevels: [{ id: 'vanilla', name: t('ram_calculator.mods.vanilla_small', 'Vanilla / Small Map'), multiplier: 1, add: 0 }, { id: 'large', name: t('ram_calculator.mods.calamity', 'Large Map / Calamity Mod'), multiplier: 1, add: 2 }] },
  dst: { id: 'dst', name: "Don't Starve Together", baseRam: 2, perPlayerRam: 0.1, maxPlayers: 16, defaultPlayers: 6, modLevels: [{ id: 'vanilla', name: t('ram_calculator.mods.caves', 'Standard Caves + Overworld'), multiplier: 1, add: 0 }] },
  stardew_valley: { id: 'stardew_valley', name: 'Stardew Valley', baseRam: 2, perPlayerRam: 0.05, maxPlayers: 8, defaultPlayers: 4, modLevels: [{ id: 'vanilla', name: t('ram_calculator.mods.std_farm', 'Standard Farm'), multiplier: 1, add: 0 }] },
  core_keeper: { id: 'core_keeper', name: 'Core Keeper', baseRam: 2, perPlayerRam: 0.05, maxPlayers: 8, defaultPlayers: 4, modLevels: [{ id: 'vanilla', name: t('ram_calculator.mods.std_server', 'Standard'), multiplier: 1, add: 0 }] },
});

const STANDARD_TIERS = [2, 3, 4, 6, 8, 12, 16, 24, 32, 64];

export default function RamCalculatorTool() {
  const { t } = useTranslation('tools');
  
  // 1. Stable memoization prevents getGameProfiles from returning a new object on every render
  const GAME_PROFILES = useMemo(() => getGameProfiles(t), [t]);

  const [activeGameId, setActiveGameId] = useState('minecraft');
  const [players, setPlayers] = useState(GAME_PROFILES['minecraft'].defaultPlayers);
  const [modLevelId, setModLevelId] = useState('vanilla');

  const activeGame = GAME_PROFILES[activeGameId] || GAME_PROFILES['minecraft'];
  const activeModLevel = activeGame.modLevels.find(m => m.id === modLevelId) || activeGame.modLevels[0];

  // 2. Only reset state when activeGameId specifically changes
  useEffect(() => {
    if (GAME_PROFILES[activeGameId]) {
      setPlayers(GAME_PROFILES[activeGameId].defaultPlayers);
      setModLevelId(GAME_PROFILES[activeGameId].modLevels[0].id);
    }
  }, [activeGameId, GAME_PROFILES]);

  const calculatedRam = useMemo(() => {
    let rawRam = activeGame.baseRam + (players * activeGame.perPlayerRam);
    rawRam = (rawRam * activeModLevel.multiplier) + activeModLevel.add;
    if (rawRam < activeGame.baseRam) rawRam = activeGame.baseRam;

    const recommended = STANDARD_TIERS.find(tier => tier >= rawRam) || STANDARD_TIERS[STANDARD_TIERS.length - 1];
    
    return { raw: parseFloat(rawRam.toFixed(1)), recommended: recommended };
  }, [activeGame, players, activeModLevel]);

  // Combined Schema Markup (Tool + FAQ)
  const schemaMarkup = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "SoftwareApplication",
        "name": t('ram_calculator.seo.schema_name', 'Spawnly Server RAM Calculator'),
        "applicationCategory": "UtilityApplication",
        "operatingSystem": "WebBrowser",
        "offers": { "@type": "Offer", "price": "0", "priceCurrency": "USD" },
        "description": t('ram_calculator.seo.schema_desc', 'Calculate exactly how much RAM your game server needs based on player slots and modpacks for 30+ games including Minecraft, Palworld, and Rust.')
      },
      {
        "@type": "FAQPage",
        "mainEntity": [
          {
            "@type": "Question",
            "name": t('ram_calculator.faq.q1', 'Why does Palworld need so much RAM?'),
            "acceptedAnswer": {
              "@type": "Answer",
              "text": t('ram_calculator.faq.a1', 'Palworld is built on Unreal Engine 5 and heavily utilizes memory for AI pathing and base rendering. It also currently suffers from memory leaks over time. We recommend a minimum of 8GB, though 12GB+ is safer for larger groups.')
            }
          },
          {
            "@type": "Question",
            "name": t('ram_calculator.faq.q2', 'Do Minecraft mods use a lot of memory?'),
            "acceptedAnswer": {
              "@type": "Answer",
              "text": t('ram_calculator.faq.a2', 'Yes. While Vanilla Minecraft runs fine on 2-3GB of RAM for small groups, large modpacks (like All The Mods or Better MC) load thousands of new assets and scripts into the memory on startup, requiring 8GB+ just to boot.')
            }
          }
        ]
      }
    ]
  };

  return (
    <div className="min-h-screen bg-[#020617] bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-[#020617] to-[#020617] flex flex-col selection:bg-indigo-500/30">
      <Head>
        <title>{t('ram_calculator.seo.title', 'Game Server RAM Calculator (Minecraft, Palworld, Rust) | Spawnly')}</title>
        <meta name="description" content={t('ram_calculator.seo.desc', 'Calculate exactly how much RAM your dedicated server needs based on game engine, active players, and modpack sizes. Supports over 30 games.')} />
        <link rel="canonical" href="https://spawnly.net/tools/ram-calculator" />
        
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://spawnly.net/tools/ram-calculator" />
        <meta property="og:title" content={t('ram_calculator.seo.og_title', 'Game Server RAM Calculator | Spawnly')} />
        <meta property="og:description" content={t('ram_calculator.seo.og_desc', 'Calculate exactly how much RAM your game server needs for Minecraft, Rust, Palworld, and 30+ more.')} />
        
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schemaMarkup) }} />
      </Head>

      <Navbar />

      <main className="flex-grow w-full max-w-7xl mx-auto py-12 px-4 sm:px-6 relative">
        
        {/* Glow behind title */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3/4 h-64 bg-sky-500/10 blur-[100px] rounded-full pointer-events-none"></div>

        <div className="text-center mb-10 animate-in fade-in slide-in-from-bottom-4 duration-700 relative z-10">
          <div className="inline-flex items-center justify-center p-3 bg-sky-500/10 rounded-2xl mb-5 border border-sky-500/20 shadow-[0_0_30px_rgba(14,165,233,0.15)]">
            <CpuChipIcon className="w-8 h-8 text-sky-400" />
          </div>
          <h1 className="text-4xl md:text-5xl font-extrabold text-white mb-4 tracking-tight">{t('ram_calculator.hero.title', 'Server RAM Calculator')}</h1>
          <p className="text-lg text-slate-400 max-w-2xl mx-auto">
            {t('ram_calculator.hero.subtitle', 'Stop guessing. Select from our 30+ supported games to find your perfect server size instantly.')}
          </p>
        </div>

        <div className="bg-[#0f172a]/80 backdrop-blur-2xl border border-slate-700/50 rounded-[2rem] overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.5)] ring-1 ring-white/5 flex flex-col lg:flex-row max-w-5xl mx-auto relative z-10">
          
          {/* LEFT COLUMN: INPUTS */}
          <div className="lg:w-[55%] bg-slate-900/50 border-b lg:border-b-0 lg:border-r border-slate-700/50 p-8 md:p-10 flex flex-col justify-center">
            <div className="space-y-10">
              
              <div>
                <label className="flex items-center gap-2 text-sm font-black text-slate-500 uppercase tracking-widest mb-3">
                  <ServerStackIcon className="w-5 h-5 text-indigo-400" /> {t('ram_calculator.inputs.select_game', 'Select Game')}
                </label>
                <div className="relative">
                  <select 
                    value={activeGameId}
                    onChange={(e) => setActiveGameId(e.target.value)}
                    className="w-full pl-4 pr-10 py-4 bg-slate-900/80 backdrop-blur-md border border-slate-700/50 rounded-xl text-white font-bold text-lg focus:ring-2 focus:ring-indigo-500/50 outline-none appearance-none cursor-pointer hover:border-slate-500/50 transition-all shadow-sm"
                  >
                    {Object.entries(GAME_PROFILES).sort((a, b) => a[1].name.localeCompare(b[1].name)).map(([id, game]) => (
                      <option key={id} value={id}>{game.name}</option>
                    ))}
                  </select>
                  <div className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none">
                    <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                  </div>
                </div>
              </div>

              <div className="animate-in fade-in">
                <label className="flex items-center justify-between text-sm font-black text-slate-500 uppercase tracking-widest mb-3">
                  <span className="flex items-center gap-2"><UserGroupIcon className="w-5 h-5 text-emerald-400" /> {t('ram_calculator.inputs.player_count', 'Player Count')}</span>
                  <span className="text-emerald-400 font-black text-lg bg-emerald-500/10 px-3 py-1 rounded-lg border border-emerald-500/20 shadow-[0_0_10px_rgba(16,185,129,0.1)]">{players}</span>
                </label>
                <input type="range" min="1" max={activeGame.maxPlayers} value={players} onChange={(e) => setPlayers(parseInt(e.target.value))} className="w-full h-2.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500 hover:bg-slate-700 transition-colors" />
                <div className="flex justify-between text-xs text-slate-500 mt-3 font-bold">
                  <span>1 {t('ram_calculator.inputs.player', 'Player')}</span>
                  <span>{activeGame.maxPlayers} {t('ram_calculator.inputs.players', 'Players')}</span>
                </div>
              </div>

              <div className="animate-in fade-in">
                <label className="flex items-center gap-2 text-sm font-black text-slate-500 uppercase tracking-widest mb-3">
                  <PuzzlePieceIcon className="w-5 h-5 text-rose-400" /> {t('ram_calculator.inputs.scope_mods', 'Server Scope / Mods')}
                </label>
                <div className="space-y-3">
                  {activeGame.modLevels.map(mod => {
                    const isActive = modLevelId === mod.id;
                    return (
                      <button 
                        key={mod.id} 
                        onClick={() => setModLevelId(mod.id)} 
                        className={`w-full text-left px-5 py-4 rounded-xl font-bold text-sm transition-all duration-300 border flex items-center justify-between shadow-sm ${
                          isActive 
                            ? 'bg-rose-500/10 text-rose-300 border-rose-500/50 shadow-[0_0_15px_rgba(244,63,94,0.1)] ring-1 ring-rose-500/20' 
                            : 'bg-slate-800/40 border-slate-700/50 text-slate-400 hover:border-slate-500/50 hover:bg-slate-800/80 hover:text-slate-200'
                        }`}
                      >
                        {mod.name}
                        {isActive && <div className="w-2.5 h-2.5 rounded-full bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.8)]"></div>}
                      </button>
                    )
                  })}
                </div>
              </div>

            </div>
          </div>

          {/* RIGHT COLUMN: RESULTS */}
          <div className="lg:w-[45%] p-8 md:p-10 flex flex-col bg-slate-900/20 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-80 h-80 bg-sky-500/10 rounded-full blur-[100px] -mr-20 -mt-20 pointer-events-none"></div>
            
            <div className="mb-6 flex items-center gap-2 text-sm font-black text-slate-500 uppercase tracking-widest relative z-10">
              <ChartBarIcon className="w-5 h-5 text-sky-400" /> {t('ram_calculator.results.recommendation', 'Recommendation')}
            </div>

            <div className="flex-grow flex flex-col justify-center relative z-10">
              <div className="text-center mb-8">
                <p className="text-slate-400 font-bold mb-2">{t('ram_calculator.results.need_at_least', 'You need a server with at least')}</p>
                <div className="flex items-baseline justify-center gap-2 text-transparent bg-clip-text bg-gradient-to-r from-sky-400 to-indigo-400 drop-shadow-sm">
                  <span className="text-7xl md:text-8xl font-black">{calculatedRam.recommended}</span>
                  <span className="text-3xl md:text-4xl font-bold tracking-tight">GB RAM</span>
                </div>
              </div>

              <div className="bg-slate-950/50 backdrop-blur-sm rounded-2xl border border-slate-700/50 p-6 mb-8 shadow-inner">
                <h4 className="text-white font-bold mb-4 text-sm border-b border-slate-800 pb-3">{t('ram_calculator.results.breakdown', 'Usage Breakdown')}</h4>
                <div className="space-y-3.5 text-sm">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400 font-medium">{t('ram_calculator.results.base_os', 'Engine / Base OS:')}</span>
                    <span className="text-white font-mono font-bold">{activeGame.baseRam.toFixed(1)} GB</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400 font-medium">{t('ram_calculator.results.player_overhead', 'Player Overhead:')}</span>
                    <span className="text-white font-mono font-bold">+{(players * activeGame.perPlayerRam).toFixed(1)} GB</span>
                  </div>
                  {activeModLevel.multiplier > 1 || activeModLevel.add > 0 ? (
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400 font-medium">{t('ram_calculator.results.mods_scope', 'Mods / Scope:')}</span>
                      <span className="text-white font-mono font-bold">
                        +{((calculatedRam.raw) - (activeGame.baseRam + (players * activeGame.perPlayerRam))).toFixed(1)} GB
                      </span>
                    </div>
                  ) : null}
                  <div className="pt-4 mt-4 border-t border-slate-800 flex justify-between items-center">
                    <span className="text-slate-300 font-bold">{t('ram_calculator.results.est_raw', 'Estimated Raw Usage:')}</span>
                    <span className="text-sky-400 font-mono font-black text-base">{calculatedRam.raw} GB</span>
                  </div>
                </div>
              </div>

              <Link href={`/pricing?game=${activeGameId}&ram=${calculatedRam.recommended}`} className="w-full group relative inline-flex items-center justify-center px-8 py-5 bg-sky-600 hover:bg-sky-500 text-white font-bold text-lg rounded-2xl transition-all duration-300 shadow-[0_0_30px_rgba(14,165,233,0.3)] hover:shadow-[0_0_40px_rgba(14,165,233,0.5)] hover:-translate-y-1 overflow-hidden ring-1 ring-white/10 hover:ring-white/20">
                <span className="relative z-10 flex items-center gap-2">
                  {t('ram_calculator.results.view_plans', 'View {{ram}}GB Plans', { ram: calculatedRam.recommended })} 
                  <svg className="w-5 h-5 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                </span>
              </Link>
            </div>
          </div>
        </div>

        {/* SEO FAQ Section */}
        <section className="max-w-4xl mx-auto mt-24 space-y-8 relative z-10">
          <h2 className="text-3xl font-extrabold text-white mb-8 text-center tracking-tight">{t('ram_calculator.faq.title', 'Frequently Asked Questions')}</h2>
          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-slate-800/30 backdrop-blur-sm border border-slate-700/50 p-6 lg:p-8 rounded-3xl shadow-sm hover:border-slate-600/50 transition-colors">
              <h3 className="text-lg font-bold text-white mb-3">{t('ram_calculator.faq.q1', 'Why does Palworld need so much RAM?')}</h3>
              <p className="text-slate-400 text-sm leading-relaxed font-medium">
                {t('ram_calculator.faq.a1', 'Palworld is built on Unreal Engine 5 and heavily utilizes memory for AI pathing and base rendering. It also currently suffers from memory leaks over time. We recommend a minimum of 8GB, though 12GB+ is safer for larger groups.')}
              </p>
            </div>
            <div className="bg-slate-800/30 backdrop-blur-sm border border-slate-700/50 p-6 lg:p-8 rounded-3xl shadow-sm hover:border-slate-600/50 transition-colors">
              <h3 className="text-lg font-bold text-white mb-3">{t('ram_calculator.faq.q2', 'Do Minecraft mods use a lot of memory?')}</h3>
              <p className="text-slate-400 text-sm leading-relaxed font-medium">
                {t('ram_calculator.faq.a2', 'Yes. While Vanilla Minecraft runs fine on 2-3GB of RAM for small groups, large modpacks (like All The Mods or Better MC) load thousands of new assets and scripts into the memory on startup, requiring 8GB+ just to boot.')}
              </p>
            </div>
            <div className="bg-slate-800/30 backdrop-blur-sm border border-slate-700/50 p-6 lg:p-8 rounded-3xl shadow-sm hover:border-slate-600/50 transition-colors">
              <h3 className="text-lg font-bold text-white mb-3">{t('ram_calculator.faq.q3', 'What happens if I run out of RAM?')}</h3>
              <p className="text-slate-400 text-sm leading-relaxed font-medium">
                {t('ram_calculator.faq.a3', 'If your server hits its RAM limit, the operating system will trigger an OOM (Out of Memory) kill event. Your server will instantly crash without saving, and players will be disconnected.')}
              </p>
            </div>
            <div className="bg-slate-800/30 backdrop-blur-sm border border-slate-700/50 p-6 lg:p-8 rounded-3xl shadow-sm hover:border-slate-600/50 transition-colors">
              <h3 className="text-lg font-bold text-white mb-3">{t('ram_calculator.faq.q4', 'Can I upgrade my RAM later?')}</h3>
              <p className="text-slate-400 text-sm leading-relaxed font-medium">
                {t('ram_calculator.faq.a4', 'Absolutely. Spawnly allows you to scale your server\'s RAM up or down instantly from the control panel. Your files and IP address remain exactly the same.')}
              </p>
            </div>
          </div>
        </section>

      </main>

      <style jsx global>{`
        input[type=range]::-webkit-slider-thumb { 
          -webkit-appearance: none; 
          height: 22px; 
          width: 22px; 
          border-radius: 50%; 
          background: #10b981; 
          cursor: pointer; 
          margin-top: -7px; 
          box-shadow: 0 0 15px rgba(16, 185, 129, 0.6); 
          transition: transform 0.1s;
        }
        input[type=range]::-webkit-slider-thumb:hover {
          transform: scale(1.1);
        }
        input[type=range]::-webkit-slider-runnable-track { 
          width: 100%; 
          height: 8px; 
          cursor: pointer; 
          background: rgba(30, 41, 59, 0.8); 
          border-radius: 4px; 
          border: 1px solid rgba(51, 65, 85, 0.5);
        }
        input[type=range]:focus::-webkit-slider-runnable-track { 
          background: rgba(51, 65, 85, 0.8); 
        }
      `}</style>
      <ServersFooter />
    </div>
  );
}

// Ensure SSR Translations are loaded
export async function getStaticProps({ locale }) {
  return {
    props: {
      ...(await serverSideTranslations(locale, ['common', 'tools', 'navbar', 'footer'])),
    },
  };
}