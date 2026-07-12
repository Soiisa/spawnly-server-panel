// lib/config.js

// ---------------------------------------------------------
// 1. GLOBAL PRICING & RAM TIERS
// ---------------------------------------------------------
export const PRICING_MATRIX = {
    2: 649,
    3: 849,
    4: 1049,
    5: 1399,
    6: 1599,
    8: 1999,
    10: 2799,
    12: 3199,
    14: 3599,
    16: 3999,
    20: 5399,
    24: 6199,
    28: 6999,
    32: 7799
};

// ---------------------------------------------------------
// 2. INFRASTRUCTURE MAPPING (Hetzner)
// ---------------------------------------------------------
export const HETZNER_MAPPINGS = {
    standard: [
        { maxRam: 3, type: 'cx23' },
        { maxRam: 7, type: 'cx33' },
        { maxRam: 15, type: 'cx43' },
        { maxRam: 999, type: 'cx53' } 
    ],
    premium: [
        { maxRam: 4, type: 'cx23' },
        { maxRam: 8, type: 'cx33' },
        { maxRam: 16, type: 'cx43' },
        { maxRam: 999, type: 'cx53' }
    ]
};

// ---------------------------------------------------------
// 3. GAME REGISTRY
// ---------------------------------------------------------
export const GAME_REGISTRY = {
    // ==========================================
    // EXISTING GAMES
    // ==========================================
    minecraft: { 
        id: 'minecraft', 
        name: 'Minecraft', 
        defaultPort: 25565, 
        engine: 'java',
        minRam: 2,
        defaultSoftware: 'vanilla',
        defaultVersion: null,
        allowHourly: true,
        logo: '/games/minecraft-logo.webp' 
    },
    satisfactory: { 
        id: 'satisfactory', 
        name: 'Satisfactory', 
        defaultPort: 7777, 
        engine: 'steamcmd',
        minRam: 4, 
        defaultSoftware: 'steamcmd',
        defaultVersion: 'public',
        allowHourly: false,
        logo: '/games/satisfactory-logo.png' 
    },
    rust: { 
        id: 'rust', 
        name: 'Rust', 
        defaultPort: 28015, 
        engine: 'steamcmd',
        minRam: 6,
        defaultSoftware: 'steamcmd',
        defaultVersion: 'public',
        allowHourly: false,
        logo: '/games/rust-logo.png' 
    },
    palworld: { 
        id: 'palworld', 
        name: 'Palworld', 
        defaultPort: 8211, 
        engine: 'steamcmd',
        minRam: 8,
        defaultSoftware: 'steamcmd',
        defaultVersion: 'public',
        allowHourly: false,
        logo: '/games/palworld-logo.jpg',
        //disabled: true
    },
    valheim: { 
        id: 'valheim', 
        name: 'Valheim', 
        defaultPort: 2456, 
        engine: 'steamcmd',
        minRam: 4,
        defaultSoftware: 'steamcmd',
        defaultVersion: 'public',
        allowHourly: false,
        logo: '/games/valheim-logo.jpg',
        //disabled: true
    },
    ark_sa: { 
        id: 'ark_sa', 
        name: 'ARK: Survival Ascended', 
        defaultPort: 7777, 
        engine: 'steamcmd',
        minRam: 10,
        defaultSoftware: 'steamcmd',
        defaultVersion: 'public',
        allowHourly: false,
        logo: '/games/ark_sa-logo.jpg',
        //disabled: true
    },
    ark_se: { 
        id: 'ark_se', 
        name: 'ARK: Survival Evolved', 
        defaultPort: 7777, 
        engine: 'steamcmd',
        minRam: 6,
        defaultSoftware: 'steamcmd',
        defaultVersion: 'public',
        allowHourly: false,
        logo: '/games/ark_se-logo.jpg',
        disabled: true
    },
    factorio: { 
        id: 'factorio', 
        name: 'Factorio', 
        defaultPort: 34197, 
        engine: 'standalone',
        minRam: 2,
        defaultSoftware: 'standalone',
        defaultVersion: 'latest',
        allowHourly: false,
        logo: '/games/factorio-logo.jpg',
        //disabled: true
    },
    project_zomboid: { 
        id: 'project_zomboid', 
        name: 'Project Zomboid', 
        defaultPort: 16261, 
        engine: 'steamcmd',
        minRam: 4,
        defaultSoftware: 'steamcmd',
        defaultVersion: 'public',
        allowHourly: false,
        logo: '/games/project_zomboid-logo.jpg',
        //disabled: true
    },
    gmod: { 
        id: 'gmod', 
        name: 'Garry\'s Mod', 
        defaultPort: 27015, 
        engine: 'steamcmd',
        minRam: 2,
        defaultSoftware: 'steamcmd',
        defaultVersion: 'public',
        allowHourly: false,
        logo: '/games/gmod-logo.jpg',
        //disabled: true
    },
    cs2: { 
        id: 'cs2', 
        name: 'Counter-Strike 2', 
        defaultPort: 27015, 
        engine: 'steamcmd',
        minRam: 2,
        defaultSoftware: 'steamcmd',
        defaultVersion: 'public',
        allowHourly: false,
        logo: '/games/cs2-logo.jpg',
        disabled: true
    },
    arma3: { 
        id: 'arma3', 
        name: 'Arma 3', 
        defaultPort: 2302, 
        engine: 'steamcmd',
        minRam: 4,
        defaultSoftware: 'steamcmd',
        defaultVersion: 'public',
        allowHourly: false,
        logo: '/games/arma3-logo.jpg',
        disabled: false
    },
    arma_reforger: { 
        id: 'arma_reforger', 
        name: 'Arma Reforger', 
        defaultPort: 19999, 
        engine: 'steamcmd',
        minRam: 4,
        defaultSoftware: 'steamcmd',
        defaultVersion: 'public',
        allowHourly: false,
        logo: '/games/arma_reforger-logo.jpg',
        //disabled: true
    },
    space_engineers: { 
        id: 'space_engineers', 
        name: 'Space Engineers', 
        defaultPort: 27016, 
        engine: 'steamcmd',
        minRam: 6,
        defaultSoftware: 'steamcmd',
        defaultVersion: 'public',
        allowHourly: false,
        logo: '/games/space_engineers-logo.jpg',
        disabled: true
    },

    // ==========================================
    // NEW: HIGH-DEMAND SURVIVAL
    // ==========================================
    seven_days_to_die: {
        id: 'seven_days_to_die',
        name: '7 Days to Die',
        defaultPort: 26900,
        engine: 'steamcmd',
        minRam: 4,
        defaultSoftware: 'steamcmd',
        defaultVersion: 'public',
        allowHourly: false,
        logo: '/games/7dtd-logo.jpg'
    },
    conan_exiles: {
        id: 'conan_exiles',
        name: 'Conan Exiles',
        defaultPort: 7777,
        engine: 'steamcmd', // Wine compatibility layer triggered during provision
        minRam: 6,
        defaultSoftware: 'steamcmd',
        defaultVersion: 'public',
        allowHourly: false,
        logo: '/games/conan_exiles-logo.jpg',
        disabled: true
    },
    dayz: {
        id: 'dayz',
        name: 'DayZ',
        defaultPort: 2302,
        engine: 'steamcmd',
        minRam: 6,
        defaultSoftware: 'steamcmd',
        defaultVersion: 'public',
        allowHourly: false,
        logo: '/games/dayz-logo.jpg',
        disabled: true
    },
    enshrouded: {
        id: 'enshrouded',
        name: 'Enshrouded',
        defaultPort: 15636,
        engine: 'steamcmd', // Wine compatibility layer
        minRam: 8,
        defaultSoftware: 'steamcmd',
        defaultVersion: 'public',
        allowHourly: false,
        logo: '/games/enshrouded-logo.png',
        disabled: true
    },
    sons_of_the_forest: {
        id: 'sons_of_the_forest',
        name: 'Sons of the Forest',
        defaultPort: 8766,
        engine: 'steamcmd', // Wine compatibility layer
        minRam: 8,
        defaultSoftware: 'steamcmd',
        defaultVersion: 'public',
        allowHourly: false,
        logo: '/games/sotf-logo.png',
        disabled: true
    },
    v_rising: {
        id: 'v_rising',
        name: 'V Rising',
        defaultPort: 9876,
        engine: 'steamcmd', // Wine compatibility layer
        minRam: 6,
        defaultSoftware: 'steamcmd',
        defaultVersion: 'public',
        allowHourly: false,
        logo: '/games/vrising-logo.png',
        disabled: true
    },

    // ==========================================
    // NEW: FACTORY & AUTOMATION
    // ==========================================
    core_keeper: {
        id: 'core_keeper',
        name: 'Core Keeper',
        defaultPort: 27015,
        engine: 'steamcmd',
        minRam: 2,
        defaultSoftware: 'steamcmd',
        defaultVersion: 'public',
        allowHourly: false,
        logo: '/games/core_keeper-logo.jpg'
    },
    mindustry: {
        id: 'mindustry',
        name: 'Mindustry',
        defaultPort: 6567,
        engine: 'java', // Reuses Minecraft backend logic
        minRam: 2,
        defaultSoftware: 'vanilla',
        defaultVersion: 'latest',
        allowHourly: false,
        logo: '/games/mindustry-logo.png',
        disabled: true
    },

    // ==========================================
    // NEW: TACTICAL SHOOTERS
    // ==========================================
    squad: {
        id: 'squad',
        name: 'Squad',
        defaultPort: 7787,
        engine: 'steamcmd',
        minRam: 6,
        defaultSoftware: 'steamcmd',
        defaultVersion: 'public',
        allowHourly: false,
        logo: '/games/squad-logo.png'
    },
    insurgency_sandstorm: {
        id: 'insurgency_sandstorm',
        name: 'Insurgency: Sandstorm',
        defaultPort: 27102,
        engine: 'steamcmd',
        minRam: 4,
        defaultSoftware: 'steamcmd',
        defaultVersion: 'public',
        allowHourly: false,
        logo: '/games/insurgency-logo.png'
    },

    // ==========================================
    // NEW: FREE TO PLAY & SOURCE
    // ==========================================
    unturned: {
        id: 'unturned',
        name: 'Unturned',
        defaultPort: 27015,
        engine: 'steamcmd',
        minRam: 2,
        defaultSoftware: 'steamcmd',
        defaultVersion: 'public',
        allowHourly: false,
        logo: '/games/unturned-logo.png'
    },
    tf2: {
        id: 'tf2',
        name: 'Team Fortress 2',
        defaultPort: 27015,
        engine: 'steamcmd',
        minRam: 2,
        defaultSoftware: 'steamcmd',
        defaultVersion: 'public',
        allowHourly: false,
        logo: '/games/tf2-logo.png'
    },
    l4d2: {
        id: 'l4d2',
        name: 'Left 4 Dead 2',
        defaultPort: 27015,
        engine: 'steamcmd',
        minRam: 2,
        defaultSoftware: 'steamcmd',
        defaultVersion: 'public',
        allowHourly: false,
        logo: '/games/l4d2-logo.png'
    },

    // ==========================================
    // NEW: INDIE & DIRECT DOWNLOAD
    // ==========================================
    dst: {
        id: 'dst',
        name: "Don't Starve Together",
        defaultPort: 10999,
        engine: 'steamcmd',
        minRam: 2,
        defaultSoftware: 'steamcmd',
        defaultVersion: 'public',
        allowHourly: false,
        logo: '/games/dst-logo.webp'
    },
    terraria: {
        id: 'terraria',
        name: 'Terraria (TShock)',
        defaultPort: 7777,
        engine: 'standalone', // Direct GitHub release download
        minRam: 2,
        defaultSoftware: 'standalone',
        defaultVersion: 'latest',
        allowHourly: false,
        logo: '/games/terraria-logo.png'
    },
    stardew_valley: {
        id: 'stardew_valley',
        name: 'Stardew Valley',
        defaultPort: 24642,
        engine: 'standalone', // Direct download wrapper
        minRam: 2,
        defaultSoftware: 'standalone',
        defaultVersion: 'latest',
        allowHourly: false,
        logo: '/games/stardew-logo.webp',
        disabled: true
    }
};

// ---------------------------------------------------------
// HELPER FUNCTIONS (Exported for UI & API routes to use)
// ---------------------------------------------------------

export const getAvailableRamTiers = () => Object.keys(PRICING_MATRIX).map(Number).sort((a, b) => a - b);

export const getMonthlyCreditCost = (ram) => {
    const tiers = getAvailableRamTiers();
    const targetTier = tiers.find(tier => tier >= ram) || tiers[tiers.length - 1];
    return PRICING_MATRIX[targetTier];
};

export const getHourlyCreditCost = (ram) => {
    return Number((getMonthlyCreditCost(ram) / 720).toFixed(4));
};

export const getHetznerType = (ram, isPremium = false) => {
    const pool = isPremium ? HETZNER_MAPPINGS.premium : HETZNER_MAPPINGS.standard;
    return pool.find(tier => ram <= tier.maxRam)?.type || pool[pool.length - 1].type;
};