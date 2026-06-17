// pages/CreateServerForm.js

import { useState, useEffect } from "react";
import { supabase } from "../lib/supabaseClient"; 
import { useTranslation } from "next-i18next"; 

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

// Next-Gen Game Registry
const GAME_REGISTRY = {
  minecraft: {
    minRam: 2,
    defaultSoftware: 'vanilla',
    defaultVersion: null,
    allowHourly: true
  },
  satisfactory: {
    minRam: 4, 
    defaultSoftware: 'steamcmd',
    defaultVersion: 'public',
    allowHourly: false // Force monthly to preserve large 15GB+ Steam installations
  }
};

export default function CreateServerForm({ onClose, onCreate, credits }) {
  const { t } = useTranslation('create_server'); 
  const [name, setName] = useState("");
  
  const [game, setGame] = useState("minecraft");
  const [billingType, setBillingType] = useState("hourly");
  const [location, setLocation] = useState("nbg1");
  
  const [ram, setRam] = useState(8); 
  const [loading, setLoading] = useState(false);
  const [existingNames, setExistingNames] = useState(new Set());
  const [nameError, setNameError] = useState(null);
  const [userId, setUserId] = useState(null);

  // Dynamically calculate cost based on billing mode
  const estimatedCost = billingType === 'hourly' 
    ? ram // 1 Credit per Hour per Gigabyte of RAM
    : getApexCreditCost(ram); // Monthly Apex Matrix

  const creditsNum = Number(credits); 
  const canCreate = !nameError && name.trim();

  // Reset to allowed locations and enforce Game minRAM when switching billing types
  useEffect(() => {
    const gameConfig = GAME_REGISTRY[game] || GAME_REGISTRY.minecraft;
    const minRamForGame = gameConfig.minRam || 2;

    // Safety Catch: If somehow set to hourly but game forbids it, force to monthly
    if (!gameConfig.allowHourly && billingType === 'hourly') {
        setBillingType('monthly');
        return; 
    }

    if (billingType === 'hourly') {
      setLocation('nbg1');
      if (ram < minRamForGame) setRam(minRamForGame);
    } else {
      // Snap RAM to the closest allowed Monthly tier that also respects the game's minimum RAM
      const validTiers = monthlyTiers.filter(t => t >= minRamForGame);
      if (!validTiers.includes(ram)) {
        const closest = validTiers.reduce((prev, curr) => 
          Math.abs(curr - ram) < Math.abs(prev - ram) ? curr : prev
        );
        setRam(closest);
      }
    }
  }, [billingType, ram, game]);

  useEffect(() => {
    const fetchUserAndServers = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user?.id) {
        setUserId(session.user.id);
        const { data: servers } = await supabase
          .from('servers')
          .select('name')
          .eq('user_id', session.user.id);
        setExistingNames(new Set(servers?.map(s => s.name.toLowerCase()) || []));
      }
    };
    fetchUserAndServers();
  }, []);

  const validateName = (value) => {
    const trimmed = value.trim();
    if (!trimmed) {
      setNameError(t('errors.required', { defaultValue: 'Server name is required' }));
      return;
    }
    if (trimmed.length < 3) {
      setNameError(t('errors.min_length', { defaultValue: 'Must be at least 3 characters' }));
      return;
    }
    if (trimmed.length > 20) {
      setNameError(t('errors.max_length', { defaultValue: 'Maximum 20 characters' }));
      return;
    }
    if (!/^[a-zA-Z0-9-]+$/.test(trimmed)) {
      setNameError(t('errors.invalid_chars', { defaultValue: 'Only letters, numbers, and hyphens allowed' }));
      return;
    }
    if (existingNames.has(trimmed.toLowerCase())) {
      setNameError(t('errors.exists', { defaultValue: 'You already have a server with this name' }));
      return;
    }
    setNameError(null);
  };

  const handleNameChange = (e) => {
    setName(e.target.value);
    validateName(e.target.value);
  };

  const handleGameChange = (e) => {
    const selectedGame = e.target.value;
    setGame(selectedGame);
    
    const gameConfig = GAME_REGISTRY[selectedGame] || GAME_REGISTRY.minecraft;
    const minRamForGame = gameConfig.minRam || 2;
    
    if (!gameConfig.allowHourly && billingType === 'hourly') {
        setBillingType('monthly');
    }

    if (ram < minRamForGame) {
      if (billingType === 'monthly' || !gameConfig.allowHourly) {
         const closest = monthlyTiers.find(t => t >= minRamForGame) || minRamForGame;
         setRam(closest);
      } else {
         setRam(minRamForGame);
      }
    }
  };

  const handleRamChange = (e) => {
    if (billingType === 'monthly') {
      setRam(monthlyTiers[Number(e.target.value)]);
    } else {
      setRam(Number(e.target.value));
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    validateName(name);
    if (!name.trim() || nameError) return;

    setLoading(true);

    const gameConfig = GAME_REGISTRY[game] || GAME_REGISTRY.minecraft;

    const serverData = { 
      name: name.trim(), 
      game, 
      software: gameConfig.defaultSoftware,
      version: gameConfig.defaultVersion,
      ram, 
      costPerHour: billingType === 'hourly' ? estimatedCost : Number((estimatedCost / 720).toFixed(4)), 
      billing_type: billingType,
      location: location
    };

    onCreate(serverData);
    setLoading(false);
    onClose();
  };

  const currentConfig = GAME_REGISTRY[game] || GAME_REGISTRY.minecraft;
  const currentMinRam = currentConfig.minRam;
  const currentMinMonthlyIndex = monthlyTiers.findIndex(t => t >= currentMinRam);
  const isHourlyAllowed = currentConfig.allowHourly;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex justify-center items-center z-50 p-4">
      <form
        onSubmit={handleSubmit}
        className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-8 w-full max-w-lg space-y-6 dark:text-gray-100 max-h-[90vh] overflow-y-auto"
      >
        <div className="flex justify-between items-center">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t('title')}</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-6">
          
          {/* Server Name */}
          <div className="block">
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t('labels.name')}
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={handleNameChange}
              placeholder={t('placeholders.name')}
              className={`block w-full rounded-lg border ${nameError ? 'border-red-300 dark:border-red-700' : 'border-gray-300 dark:border-slate-600'} dark:bg-slate-700 dark:text-white shadow-sm p-3 focus:ring-indigo-500 focus:border-indigo-500`}
              required
            />
            {nameError && <p className="mt-1 text-sm text-red-600 dark:text-red-400">{nameError}</p>}
          </div>

          {/* Game Selection */}
          <div className="block">
            <label htmlFor="game" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t('labels.game')}
            </label>
            <select
              id="game"
              value={game}
              onChange={handleGameChange}
              className="block w-full rounded-lg border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white shadow-sm p-3 focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value="minecraft">{t('games.minecraft', { defaultValue: 'Minecraft' })}</option>
              <option value="satisfactory">Satisfactory</option>
              <option value="rust" disabled>{t('games.rust_soon', { defaultValue: 'Rust (Soon)' })}</option>
              <option value="palworld" disabled>{t('games.palworld_soon', { defaultValue: 'Palworld (Soon)' })}</option>
            </select>
          </div>

          {/* Billing Type Toggle */}
          <div className="block">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              {t('labels.billing_type')}
            </label>
            <div className="grid grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => isHourlyAllowed && setBillingType('hourly')}
                disabled={!isHourlyAllowed}
                className={`p-4 border rounded-xl text-left transition-all ${
                  !isHourlyAllowed 
                    ? 'opacity-50 cursor-not-allowed bg-gray-50 dark:bg-slate-800/50 border-gray-200 dark:border-slate-700'
                    : billingType === 'hourly' 
                      ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-900/30 ring-2 ring-indigo-600' 
                      : 'border-gray-200 dark:border-slate-600 hover:border-indigo-300'
                }`}
              >
                <span className="block font-bold text-gray-900 dark:text-gray-100">{t('billing.hourly_title')}</span>
                <span className="text-xs text-gray-500 dark:text-gray-400 block mt-1">
                    {!isHourlyAllowed ? 'Not available for Steam Games' : t('billing.hourly_desc')}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setBillingType('monthly')}
                className={`p-4 border rounded-xl text-left transition-all ${
                  billingType === 'monthly' 
                    ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-900/30 ring-2 ring-indigo-600' 
                    : 'border-gray-200 dark:border-slate-600 hover:border-indigo-300'
                }`}
              >
                <span className="block font-bold text-gray-900 dark:text-gray-100">{t('billing.monthly_title')}</span>
                <span className="text-xs text-gray-500 dark:text-gray-400 block mt-1">{t('billing.monthly_desc')}</span>
              </button>
            </div>
          </div>

          {/* Location Selector */}
          <div className="block">
            <label htmlFor="location" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t('labels.location')}
            </label>
            <select
              id="location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              disabled={billingType === 'hourly'}
              className="block w-full rounded-lg border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white shadow-sm p-3 focus:ring-indigo-500 focus:border-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {/* Active EU Regions */}
              <option value="nbg1">{t('locations.nbg1', { defaultValue: 'Nuremberg, Germany' })}</option>
              <option value="fsn1">{t('locations.fsn1', { defaultValue: 'Falkenstein, Germany' })}</option>
              <option value="hel1">{t('locations.hel1', { defaultValue: 'Helsinki, Finland' })}</option>
              
              {/* Disabled Non-EU Regions */}
              <option value="ash" disabled>{t('locations.ash', { defaultValue: 'Ashburn, VA' })} ({t('locations.soon', { defaultValue: 'Soon' })})</option>
              <option value="hil" disabled>{t('locations.hil', { defaultValue: 'Hillsboro, OR' })} ({t('locations.soon', { defaultValue: 'Soon' })})</option>
              <option value="sin" disabled>{t('locations.sin', { defaultValue: 'Singapore' })} ({t('locations.soon', { defaultValue: 'Soon' })})</option>
            </select>
            {billingType === 'hourly' && (
              <p className="mt-1 text-xs text-orange-600 dark:text-orange-400 font-medium">
                {t('locations.restriction_note')}
              </p>
            )}
          </div>

          {/* RAM Slider */}
          <div className="block pt-2">
            <div className="flex justify-between items-center mb-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                {t('labels.ram')}
              </label>
              <span className="text-sm font-medium text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 px-3 py-1 rounded-full">
                {ram} {t('units.gb', { defaultValue: 'GB' })}
              </span>
            </div>
            
            {billingType === 'monthly' ? (
              <input
                type="range" 
                min={currentMinMonthlyIndex} 
                max={monthlyTiers.length - 1} 
                step="1"
                value={monthlyTiers.indexOf(ram) !== -1 ? monthlyTiers.indexOf(ram) : 0}
                onChange={handleRamChange}
                className="w-full h-2 bg-gray-200 dark:bg-slate-600 rounded-lg appearance-none cursor-pointer accent-indigo-600"
              />
            ) : (
              <input
                type="range" 
                min={currentMinRam} 
                max="32" 
                step="1"
                value={ram}
                onChange={handleRamChange}
                className="w-full h-2 bg-gray-200 dark:bg-slate-600 rounded-lg appearance-none cursor-pointer accent-indigo-600"
              />
            )}
            
            <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-1">
              <span>{currentMinRam} {t('units.gb', { defaultValue: 'GB' })}</span>
              <span>32 {t('units.gb', { defaultValue: 'GB' })}</span>
            </div>
          </div>

          {/* Cost Estimation Panel */}
          <div className="bg-gray-50 dark:bg-slate-700 rounded-xl p-4 space-y-3">
            <div className="flex justify-between items-start">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300 mt-0.5">
                {billingType === 'hourly' ? t('costs.estimated_hourly') : t('costs.flat_monthly')}
              </span>
              <div className="text-right">
                <span className="text-lg font-bold text-indigo-700 dark:text-indigo-300 block">
                  {estimatedCost} {billingType === 'hourly' ? t('units.credits_per_hour') : t('units.credits_per_month', { defaultValue: 'Credits' })}
                </span>
                <span className="text-xs text-gray-400 dark:text-slate-400 font-medium block mt-0.5">
                  ≈ €{(estimatedCost / 100).toFixed(2)} {billingType === 'hourly' ? '/hr' : '/mo'}
                </span>
              </div>
            </div>
            
            <div className="flex justify-between items-start pt-3 border-t border-gray-200 dark:border-slate-600">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300 mt-0.5">{t('labels.your_credits')}</span>
              <div className="text-right">
                <span className="text-sm font-semibold text-green-600 dark:text-green-400 block">
                  {creditsNum.toFixed(2)} {t('units.credits')}
                </span>
                <span className="text-xs text-gray-400 dark:text-slate-400 block mt-0.5">
                  ≈ €{(creditsNum / 100).toFixed(2)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-end space-x-3 pt-4 border-t border-gray-100 dark:border-slate-700">
          <button
            type="button"
            onClick={onClose}
            className="bg-white dark:bg-slate-700 border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-gray-200 py-2 px-5 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-600 transition font-medium"
          >
            {t('buttons.cancel')}
          </button>
          <button
            type="submit"
            disabled={loading || !canCreate}
            className={`${
              canCreate 
                ? "bg-indigo-600 hover:bg-indigo-700" 
                : "bg-gray-300 dark:bg-slate-600 cursor-not-allowed"
            } text-white py-2 px-5 rounded-lg transition font-medium flex items-center justify-center`}
          >
            {loading ? (
              <>
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                {t('buttons.creating')}
              </>
            ) : (
              canCreate ? t('buttons.create') : nameError ? t('buttons.fix_errors') : t('buttons.create')
            )}
          </button>
        </div>
      </form>
    </div>
  );
}