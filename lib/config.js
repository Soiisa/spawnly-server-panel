// lib/config.js

// ---------------------------------------------------------
// 1. GLOBAL PRICING & RAM TIERS
// ---------------------------------------------------------
// Keys are RAM in GB. Values are the monthly Credit Cost.
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
// Maps requested RAM to the exact physical Hetzner instance type.
export const HETZNER_MAPPINGS = {
    standard: [
        { maxRam: 3, type: 'cx23' },
        { maxRam: 7, type: 'cx33' },
        { maxRam: 15, type: 'cx43' },
        { maxRam: 999, type: 'cx53' } // Fallback for massive servers
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
    minecraft: { 
        id: 'minecraft', 
        name: 'Minecraft', 
        defaultPort: 25565, 
        engine: 'java'
    },
    satisfactory: { 
        id: 'satisfactory', 
        name: 'Satisfactory', 
        defaultPort: 7777, 
        engine: 'steamcmd'
    },
    rust: { 
        id: 'rust', 
        name: 'Rust', 
        defaultPort: 28015, 
        engine: 'steamcmd'
    },
    palworld: { 
        id: 'palworld', 
        name: 'Palworld', 
        defaultPort: 8211, 
        engine: 'steamcmd'
    }
};

// ---------------------------------------------------------
// HELPER FUNCTIONS (Exported for UI & API routes to use)
// ---------------------------------------------------------

// Returns [3, 4, 5, 6, 8, 10...] for UI dropdowns
export const getAvailableRamTiers = () => Object.keys(PRICING_MATRIX).map(Number).sort((a, b) => a - b);

// Safely calculates monthly cost based on the exact tier requested
export const getMonthlyCreditCost = (ram) => {
    const tiers = getAvailableRamTiers();
    const targetTier = tiers.find(tier => tier >= ram) || tiers[tiers.length - 1];
    return PRICING_MATRIX[targetTier];
};

// Returns the hourly cost (Monthly cost / 720 hours)
export const getHourlyCreditCost = (ram) => {
    return Number((getMonthlyCreditCost(ram) / 720).toFixed(4));
};

// Maps Ram to Hetzner Instance String
export const getHetznerType = (ram, isPremium = false) => {
    const pool = isPremium ? HETZNER_MAPPINGS.premium : HETZNER_MAPPINGS.standard;
    return pool.find(tier => ram <= tier.maxRam)?.type || pool[pool.length - 1].type;
};