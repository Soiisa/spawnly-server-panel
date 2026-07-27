// pages/tools/config-generator.js
import { useState, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useTranslation } from 'next-i18next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import Navbar from '../../components/Navbar';
import ServersFooter from '../../components/ServersFooter';
import { 
  DocumentTextIcon, 
  ClipboardDocumentIcon, 
  ArrowDownTrayIcon,
  CheckIcon,
  Cog6ToothIcon,
  WrenchScrewdriverIcon,
  ServerStackIcon
} from '@heroicons/react/24/outline';

const getGames = (t) => ({
  // === STANDARD KEY=VALUE ===
  minecraft: { id: 'minecraft', name: t('config_generator.games.minecraft', 'Minecraft'), filename: 'server.properties', format: 'key_value', defaults: { 'server-name': 'Spawnly Server', 'gamemode': 'survival', 'difficulty': 'normal', 'max-players': '20', 'pvp': true, 'allow-nether': true, 'view-distance': '10', 'motd': 'Powered by Spawnly' } },
  terraria: { id: 'terraria', name: t('config_generator.games.terraria', 'Terraria'), filename: 'serverconfig.txt', format: 'key_value', defaults: { worldname: 'SpawnlyWorld', motd: 'Welcome!', password: '', maxplayers: '8', autocreate: '2', difficulty: '0' } },
  project_zomboid: { id: 'project_zomboid', name: t('config_generator.games.project_zomboid', 'Project Zomboid'), filename: 'servertest.ini', format: 'key_value', defaults: { PublicName: 'Spawnly PZ Server', MaxPlayers: '32', Password: '', PvP: false, GlobalChat: true } },
  valheim: { id: 'valheim', name: t('config_generator.games.valheim', 'Valheim'), filename: 'start_headless_server.bat', format: 'batch_args', defaults: { name: 'Spawnly Valheim', port: '2456', world: 'Dedicated', password: 'changeme', public: true } },
  
  // === INI (SECTIONS) ===
  ark_se: { id: 'ark_se', name: t('config_generator.games.ark_se', 'ARK: Survival Evolved'), filename: 'GameUserSettings.ini', format: 'ini', defaults: { SessionName: 'Spawnly ARK SE', ServerPassword: '', ServerAdminPassword: 'changeme123', MaxPlayers: '70', XPMultiplier: '2.0', TamingSpeedMultiplier: '5.0', HarvestAmountMultiplier: '3.0', bDisableStructurePlacementCollision: true } },
  ark_sa: { id: 'ark_sa', name: t('config_generator.games.ark_sa', 'ARK: Survival Ascended'), filename: 'GameUserSettings.ini', format: 'ini', defaults: { SessionName: 'Spawnly ARK SA', ServerPassword: '', ServerAdminPassword: 'changeme123', MaxPlayers: '70', XPMultiplier: '3.0', TamingSpeedMultiplier: '10.0', HarvestAmountMultiplier: '3.0', bDisableStructurePlacementCollision: true } },
  conan_exiles: { id: 'conan_exiles', name: t('config_generator.games.conan_exiles', 'Conan Exiles'), filename: 'ServerSettings.ini', format: 'ini', defaults: { ServerName: 'Spawnly Conan', MaxNudity: '2', ServerPassword: '', MaxPlayers: '40', PVPEnabled: true, IsBattlEyeEnabled: true } },
  enshrouded: { id: 'enshrouded', name: t('config_generator.games.enshrouded', 'Enshrouded'), filename: 'enshrouded_server.json', format: 'json', defaults: { name: 'Spawnly Enshrouded', password: '', saveDirectory: './savegame', logDirectory: './logs', ip: '0.0.0.0', gamePort: 15636, queryPort: 15637, slotCount: 16 } },
  dst: { id: 'dst', name: t('config_generator.games.dst', "Don't Starve Together"), filename: 'cluster.ini', format: 'ini', defaults: { cluster_name: 'Spawnly DST', cluster_password: '', cluster_intention: 'cooperative', max_players: '6', pvp: false, pause_when_empty: true } },
  
  // === PALWORLD (SPECIAL INI) ===
  palworld: { id: 'palworld', name: t('config_generator.games.palworld', 'Palworld'), filename: 'PalWorldSettings.ini', format: 'palworld', defaults: { ServerName: 'Spawnly Palworld', ServerDescription: 'Welcome!', ServerPassword: '', AdminPassword: '', MaxPlayers: '32', ExpRate: '1.000000', bIsMultiplay: true, bIsPvP: false, DropItemMaxNum: '3000' } },

  // === SOURCE ENGINE & RUST (SPACE SEPARATED) ===
  rust: { id: 'rust', name: t('config_generator.games.rust', 'Rust'), filename: 'server.cfg', format: 'source', defaults: { 'server.hostname': 'Spawnly Rust Server', 'server.description': 'Welcome!', 'server.maxplayers': '50', 'server.worldsize': '4000', 'server.seed': '123456', 'server.globalchat': true, 'server.pve': false } },
  cs2: { id: 'cs2', name: t('config_generator.games.cs2', 'Counter-Strike 2'), filename: 'server.cfg', format: 'source', defaults: { hostname: 'Spawnly CS2', sv_password: '', rcon_password: 'changeme', mp_maxrounds: '24', mp_timelimit: '40', sv_cheats: false, sv_alltalk: true } },
  gmod: { id: 'gmod', name: t('config_generator.games.gmod', "Garry's Mod"), filename: 'server.cfg', format: 'source', defaults: { hostname: 'Spawnly GMod', sv_password: '', rcon_password: 'changeme', sbox_maxprops: '5000', sbox_noclip: true, sbox_godmode: false } },
  tf2: { id: 'tf2', name: t('config_generator.games.tf2', 'Team Fortress 2'), filename: 'server.cfg', format: 'source', defaults: { hostname: 'Spawnly TF2', sv_password: '', rcon_password: 'changeme', mp_timelimit: '30', sv_cheats: false, tf_weapon_criticals: true } },
  l4d2: { id: 'l4d2', name: t('config_generator.games.l4d2', 'Left 4 Dead 2'), filename: 'server.cfg', format: 'source', defaults: { hostname: 'Spawnly L4D2', sv_password: '', rcon_password: 'changeme', sv_allow_lobby_connect_only: false, sv_cheats: false } },
  squad: { id: 'squad', name: t('config_generator.games.squad', 'Squad'), filename: 'Server.cfg', format: 'source', defaults: { ServerName: 'Spawnly Squad', MaxPlayers: '80', NumReservedSlots: '2', IsStandby: false } },
  insurgency_sandstorm: { id: 'insurgency_sandstorm', name: t('config_generator.games.insurgency_sandstorm', 'Insurgency'), filename: 'Game.ini', format: 'ini', defaults: { ServerName: 'Spawnly Insurgency', ServerPassword: '', MaxPlayers: '28', bMapVoting: true, bUseRulesVoting: true } },

  // === JSON STRICT ===
  factorio: { id: 'factorio', name: t('config_generator.games.factorio', 'Factorio'), filename: 'server-settings.json', format: 'json', defaults: { name: 'Spawnly Factory', description: 'The factory grows.', max_players: 0, game_password: '', require_user_verification: true, public_visibility: true } },
  v_rising: { id: 'v_rising', name: t('config_generator.games.v_rising', 'V Rising'), filename: 'ServerHostSettings.json', format: 'json', defaults: { Name: 'Spawnly V Rising', Description: 'Vampire rules.', Port: 9876, QueryPort: 9877, MaxConnectedUsers: 40, MaxConnectedAdmins: 4, SaveName: 'world1', Password: '' } },

  // === XML STRICT ===
  seven_days_to_die: { id: 'seven_days_to_die', name: t('config_generator.games.seven_days_to_die', '7 Days to Die'), filename: 'serverconfig.xml', format: 'xml', defaults: { ServerName: 'Spawnly 7DTD', ServerDescription: 'Survive the horde', ServerPassword: '', ServerMaxPlayerCount: '8', ServerPort: '26900', GameDifficulty: '2', DayNightLength: '60', DropOnDeath: '1' } },
});

export default function ConfigGeneratorTool() {
  const { t } = useTranslation('tools');
  const GAMES = getGames(t);

  const [activeGame, setActiveGame] = useState('minecraft');
  const [config, setConfig] = useState(GAMES['minecraft'].defaults);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setConfig(GAMES[activeGame].defaults);
    setCopied(false);
  }, [activeGame, GAMES]);

  const handleChange = (key, value) => setConfig(prev => ({ ...prev, [key]: value }));

  const generateOutput = () => {
    const gameDef = GAMES[activeGame];
    const format = gameDef.format;

    if (format === 'key_value') {
      return Object.entries(config).map(([k, v]) => `${k}=${v}`).join('\n');
    }
    if (format === 'ini') {
      const settings = Object.entries(config).map(([k, v]) => `${k}=${typeof v === 'boolean' ? (v ? 'True' : 'False') : v}`).join('\n');
      return `[ServerSettings]\n${settings}`;
    }
    if (format === 'batch_args') {
      return `valheim_server.exe -nographics -batchmode -name "${config.name}" -port ${config.port} -world "${config.world}" -password "${config.password}" -public ${config.public ? '1' : '0'}`;
    }
    if (format === 'palworld') {
      const settings = Object.entries(config).map(([k, v]) => {
        if (typeof v === 'boolean') return `${k}=${v ? 'True' : 'False'}`;
        if (['ServerName', 'ServerDescription', 'ServerPassword', 'AdminPassword'].includes(k)) return `${k}="${v}"`;
        return `${k}=${v}`;
      }).join(',');
      return `[/Script/Pal.PalGameMode]\nOptionSettings=(${settings})`;
    }
    if (format === 'source') {
      return Object.entries(config).map(([k, v]) => {
        if (['hostname', 'ServerName', 'server.hostname', 'server.description', 'sv_password', 'rcon_password'].includes(k)) return `${k} "${v}"`;
        if (typeof v === 'boolean') return `${k} ${v ? '1' : '0'}`;
        return `${k} ${v}`;
      }).join('\n');
    }
    if (format === 'json') {
      const jsonOutput = { ...config };
      Object.keys(jsonOutput).forEach(k => {
        if (!isNaN(jsonOutput[k]) && jsonOutput[k] !== '') jsonOutput[k] = Number(jsonOutput[k]);
      });
      return JSON.stringify(jsonOutput, null, 2);
    }
    if (format === 'xml') {
      const xmlProps = Object.entries(config).map(([k, v]) => `  <property name="${k}" value="${v}"/>`).join('\n');
      return `<?xml version="1.0"?>\n<ServerSettings>\n${xmlProps}\n</ServerSettings>`;
    }
    return '';
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(generateOutput());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const element = document.createElement("a");
    const file = new Blob([generateOutput()], {type: 'text/plain'});
    element.href = URL.createObjectURL(file);
    element.download = GAMES[activeGame].filename;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  // SEO Schema Markup
  const schemaMarkup = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "name": t('config_generator.seo.schema_name', 'Spawnly Server Config Generator'),
    "applicationCategory": "DeveloperApplication",
    "operatingSystem": "WebBrowser",
    "offers": {
      "@type": "Offer",
      "price": "0",
      "priceCurrency": "USD"
    },
    "description": t('config_generator.seo.schema_desc', 'A free visual UI generator to create perfectly formatted server.properties, server.cfg, PalWorldSettings.ini, and JSON configuration files for 30+ game servers.')
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col selection:bg-indigo-500/30">
      <Head>
        <title>{t('config_generator.seo.title', 'Server Config Generator (INI, JSON, XML) | Spawnly Free Tools')}</title>
        <meta name="description" content={t('config_generator.seo.description', 'Free visual UI generator to create perfectly formatted server.properties, server.cfg, PalWorldSettings.ini, and JSON files for over 30 games.')} />
        <link rel="canonical" href="https://spawnly.net/tools/config-generator" />
        
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://spawnly.net/tools/config-generator" />
        <meta property="og:title" content={t('config_generator.seo.title', 'Server Config Generator (INI, JSON, XML) | Spawnly Free Tools')} />
        <meta property="og:description" content={t('config_generator.seo.description', 'Free visual UI generator to create perfectly formatted server.properties, server.cfg, PalWorldSettings.ini, and JSON files for over 30 games.')} />
        
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schemaMarkup) }} />
      </Head>

      <Navbar />

      <main className="flex-grow w-full max-w-7xl mx-auto py-12 px-4 sm:px-6">
        
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center p-3 bg-indigo-500/10 rounded-2xl mb-4 border border-indigo-500/20">
            <Cog6ToothIcon className="w-8 h-8 text-indigo-400" />
          </div>
          <h1 className="text-4xl md:text-5xl font-extrabold text-white mb-4 tracking-tight">
            {t('config_generator.hero.title', 'Server Config Generator')}
          </h1>
          <p className="text-lg text-slate-400 max-w-2xl mx-auto">
            {t('config_generator.hero.subtitle', 'Stop breaking your server with syntax errors. Select a game and let us generate perfectly formatted code.')}
          </p>
        </div>

        <div className="max-w-md mx-auto mb-10 relative">
          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
             <ServerStackIcon className="w-5 h-5 text-indigo-400" />
          </div>
          <select 
            value={activeGame}
            onChange={(e) => setActiveGame(e.target.value)}
            className="w-full pl-12 pr-4 py-4 bg-slate-900 border-2 border-indigo-500/30 rounded-xl text-white font-bold text-lg focus:ring-4 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none appearance-none cursor-pointer hover:border-indigo-500/50 transition-colors"
          >
            {Object.entries(GAMES)
              .sort((a, b) => a[1].name.localeCompare(b[1].name))
              .map(([id, game]) => (
              <option key={id} value={id}>{game.name}</option>
            ))}
          </select>
          <div className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none">
            <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl flex flex-col lg:flex-row">
          
          {/* LEFT COLUMN: VISUAL EDITOR */}
          <div className="lg:w-[55%] bg-slate-950/50 border-b lg:border-b-0 lg:border-r border-slate-800 p-6 md:p-8 flex flex-col min-h-[600px] lg:h-[750px]">
            <div className="mb-6 flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <WrenchScrewdriverIcon className="w-6 h-6 text-indigo-400" />
                <h2 className="text-xl font-bold text-white">{t('config_generator.editor.title', 'Visual Settings')}</h2>
              </div>
              <span className="px-3 py-1 bg-slate-800 rounded-full text-xs font-bold text-slate-400 uppercase">
                {t('config_generator.editor.format', '{{format}} Format', { format: GAMES[activeGame].format.replace('_', ' ') })}
              </span>
            </div>
            
            <div className="space-y-4 flex-grow overflow-y-auto pr-2 custom-scrollbar animate-in fade-in">
              {Object.entries(config).map(([key, value]) => {
                const isBoolean = typeof value === 'boolean';
                return (
                  <div key={key}>
                    {isBoolean ? (
                      <Toggle label={key} value={value} onChange={(v) => handleChange(key, v)} />
                    ) : (
                      <Input label={key} value={value} onChange={(v) => handleChange(key, v)} />
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* RIGHT COLUMN: PREVIEW */}
          <div className="lg:w-[45%] p-6 md:p-8 flex flex-col bg-slate-900 lg:h-[750px]">
            <div className="flex items-center justify-between mb-4 border-b border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <DocumentTextIcon className="w-6 h-6 text-slate-400" />
                <h2 className="text-xl font-bold text-white font-mono">{GAMES[activeGame].filename}</h2>
              </div>
              
              <div className="flex gap-2">
                <button onClick={handleCopy} className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white text-sm font-medium rounded-lg transition-colors">
                  {copied ? <CheckIcon className="w-4 h-4 text-emerald-400" /> : <ClipboardDocumentIcon className="w-4 h-4" />}
                  {copied ? t('config_generator.preview.copied', 'Copied!') : t('config_generator.preview.copy', 'Copy')}
                </button>
                <button onClick={handleDownload} className="flex items-center gap-2 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors">
                  <ArrowDownTrayIcon className="w-4 h-4" />
                  {t('config_generator.preview.download', 'Download')}
                </button>
              </div>
            </div>

            <div className="flex-grow bg-slate-950 rounded-xl border border-slate-800 p-4 overflow-auto relative custom-scrollbar">
              <pre className="text-sm font-mono leading-relaxed text-emerald-400 whitespace-pre-wrap word-break">
                {generateOutput()}
              </pre>
            </div>

            <div className="mt-6 bg-gradient-to-r from-indigo-900/40 to-slate-900 border border-indigo-500/30 p-5 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-4">
              <div>
                <h4 className="text-white font-bold text-sm">{t('config_generator.preview.upsell_title', 'Hate editing text files?')}</h4>
                <p className="text-slate-400 text-xs mt-1">{t('config_generator.preview.upsell_desc', "Spawnly's control panel features a built-in visual editor.")}</p>
              </div>
              <Link href="/pricing" className="px-5 py-2 bg-indigo-500 hover:bg-indigo-400 text-white text-sm font-bold rounded-lg transition-colors whitespace-nowrap">
                {t('config_generator.preview.host_btn', 'Host {{game}}', { game: GAMES[activeGame].name })}
              </Link>
            </div>
          </div>
        </div>

        {/* SEO Text Content */}
        <section className="mt-20 max-w-4xl mx-auto text-center border-t border-slate-800 pt-16">
          <h2 className="text-2xl font-bold text-white mb-4">{t('config_generator.seo_section.title', 'How to use the Config Generator')}</h2>
          <p 
            className="text-slate-400 leading-relaxed" 
            dangerouslySetInnerHTML={{ __html: t('config_generator.seo_section.desc', "Formatting errors are the #1 reason game servers crash on startup. Whether you're trying to format a tricky <code>PalWorldSettings.ini</code> array, ensuring strict JSON syntax for <code>server-settings.json</code> in Factorio, or just generating a basic <code>server.properties</code> file for Minecraft, our tool guarantees correct syntax. Simply select your game, adjust the toggles, and click download. Upload the file to your server's root directory and restart your game.") }} 
          />
        </section>

      </main>

      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(51, 65, 85, 0.8); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(79, 70, 229, 0.8); }
      `}</style>
      <ServersFooter />
    </div>
  );
}

function Input({ label, value, onChange, type = "text" }) {
  return (
    <div>
      <label className="block text-xs font-bold text-slate-400 font-mono tracking-wider mb-2">{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all" />
    </div>
  );
}

function Toggle({ label, value, onChange }) {
  return (
    <label className="flex items-center justify-between cursor-pointer p-4 bg-slate-900 rounded-lg border border-slate-800 hover:border-slate-700 transition-colors">
      <span className="text-sm font-bold text-white font-mono">{label}</span>
      <div className="relative">
        <input type="checkbox" className="sr-only" checked={value} onChange={(e) => onChange(e.target.checked)} />
        <div className={`block w-10 h-6 rounded-full transition-colors ${value ? 'bg-indigo-500' : 'bg-slate-700'}`}></div>
        <div className={`dot absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform ${value ? 'translate-x-4' : ''}`}></div>
      </div>
    </label>
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