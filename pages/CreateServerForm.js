// pages/CreateServerForm.js
import { useState, useEffect } from "react";
import { supabase } from "../lib/supabaseClient"; 
import { useTranslation } from "next-i18next"; 
import { GAME_REGISTRY, getAvailableRamTiers, getMonthlyCreditCost } from "../lib/config";
import { 
  XMarkIcon,
  ServerStackIcon,
  ClockIcon,
  CalendarDaysIcon,
  MapPinIcon,
  CpuChipIcon,
  CurrencyDollarIcon
} from "@heroicons/react/24/outline";
import { CheckCircleIcon as CheckCircleIconSolid } from "@heroicons/react/24/solid";

export default function CreateServerForm({ onClose, onCreate, credits }) {
  const { t } = useTranslation('create_server'); 
  const [name, setName] = useState("");
  
  const [game, setGame] = useState("minecraft");
  const [billingType, setBillingType] = useState("hourly");
  // Changed default to EU
  const [location, setLocation] = useState("EU");
  
  const [ram, setRam] = useState(8); 
  const [loading, setLoading] = useState(false);
  const [existingNames, setExistingNames] = useState(new Set());
  const [nameError, setNameError] = useState(null);
  const [userId, setUserId] = useState(null);

  const monthlyTiers = getAvailableRamTiers();

  const estimatedCost = billingType === 'hourly' 
    ? ram 
    : getMonthlyCreditCost(ram); 

  const creditsNum = Number(credits); 
  const canCreate = !nameError && name.trim();

  useEffect(() => {
    const gameConfig = GAME_REGISTRY[game] || GAME_REGISTRY.minecraft;
    const minRamForGame = gameConfig?.minRam || 2;
    const isHourlyAllowed = gameConfig?.allowHourly !== false;

    if (!isHourlyAllowed && billingType === 'hourly') {
        setBillingType('monthly');
        return; 
    }

    if (billingType === 'hourly') {
      setLocation('EU'); // Lock to EU for hourly
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
  }, [billingType, ram, game, monthlyTiers]);

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

  const handleGameChange = (selectedGameKey) => {
    setGame(selectedGameKey);
    
    const gameConfig = GAME_REGISTRY[selectedGameKey] || GAME_REGISTRY.minecraft;
    const minRamForGame = gameConfig?.minRam || 2;
    const isHourlyAllowed = gameConfig?.allowHourly !== false;
    
    if (!isHourlyAllowed && billingType === 'hourly') {
        setBillingType('monthly');
    }

    if (ram < minRamForGame) {
      if (billingType === 'monthly' || !isHourlyAllowed) {
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
      software: gameConfig.defaultSoftware || 'vanilla',
      version: gameConfig.defaultVersion || null,
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
  const currentMinRam = currentConfig?.minRam || 2;
  const currentMinMonthlyIndex = monthlyTiers.findIndex(t => t >= currentMinRam);
  const isHourlyAllowed = currentConfig?.allowHourly !== false;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex justify-center items-center z-50 p-4 sm:p-6 animate-in fade-in duration-200">
      <form
        onSubmit={handleSubmit}
        className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200/60 dark:border-slate-700/60 w-full max-w-5xl max-h-[85vh] lg:max-h-[750px] flex flex-col overflow-hidden dark:text-slate-100 animate-in zoom-in-95 duration-200"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center shrink-0 bg-white dark:bg-slate-900">
          <div className="flex items-center gap-3">
            <div className="p-1.5 bg-indigo-50 dark:bg-indigo-500/10 rounded-lg">
              <ServerStackIcon className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">{t('title')}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 dark:hover:text-slate-300 rounded-full transition-colors"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Content Body - Two Columns */}
        <div className="flex flex-col md:flex-row flex-1 overflow-hidden min-h-0 bg-slate-50/50 dark:bg-slate-900/50">
          
          {/* LEFT COLUMN: Games */}
          <div className="w-full md:w-5/12 p-5 overflow-y-auto border-b md:border-b-0 md:border-r border-slate-200/60 dark:border-slate-800 custom-scrollbar bg-slate-50/50 dark:bg-slate-900/30">
            <label className="block text-sm font-semibold text-slate-800 dark:text-slate-200 mb-3">
              {t('labels.game')}
            </label>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-2.5">
              {Object.entries(GAME_REGISTRY).map(([key, config]) => {
                const isActive = game === key;
                return (
                  <button
                    key={key}
                    type="button"
                    disabled={config.disabled}
                    onClick={() => handleGameChange(key)}
                    className={`relative flex flex-col items-center gap-2 p-2.5 rounded-xl border transition-all duration-200 text-center group ${
                      isActive
                        ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-500/10 shadow-sm ring-1 ring-indigo-500/50'
                        : 'border-slate-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-700/50 hover:shadow-sm bg-white dark:bg-slate-800/80'
                    } ${config.disabled ? 'opacity-50 cursor-not-allowed grayscale' : ''}`}
                  >
                    <div className={`w-10 h-10 flex-shrink-0 rounded-xl border flex items-center justify-center overflow-hidden transition-colors ${isActive ? 'border-indigo-200 dark:border-indigo-500/30' : 'border-slate-100 dark:border-slate-700 group-hover:border-indigo-100 dark:group-hover:border-indigo-500/20'} bg-white dark:bg-slate-900`}>
                      {config.logo ? (
                        <img src={config.logo} alt={config.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full bg-slate-100 dark:bg-slate-800" />
                      )}
                    </div>
                    <div className="flex-1 w-full flex flex-col items-center justify-center">
                      <h3 className={`font-semibold text-xs leading-tight line-clamp-2 ${isActive ? 'text-indigo-900 dark:text-indigo-200' : 'text-slate-700 dark:text-slate-300'}`}>
                        {t(`games.${key}.name`, { defaultValue: config.name })}
                      </h3>
                      {config.disabled && (
                        <span className="block text-[9px] uppercase tracking-wider font-bold text-amber-500 mt-1">
                          {t('locations.soon', { defaultValue: 'Soon' })}
                        </span>
                      )}
                    </div>
                    {isActive && (
                      <div className="absolute top-1.5 right-1.5 text-indigo-600 dark:text-indigo-400">
                        <CheckCircleIconSolid className="h-4 w-4" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* RIGHT COLUMN: Settings */}
          <div className="w-full md:w-7/12 p-5 overflow-y-auto flex flex-col space-y-5 custom-scrollbar bg-white dark:bg-slate-900">
            
            {/* Server Name */}
            <div className="block">
              <label htmlFor="name" className="block text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1.5">
                {t('labels.name')}
              </label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={handleNameChange}
                placeholder={t('placeholders.name')}
                className={`block w-full rounded-xl border ${nameError ? 'border-red-300 dark:border-red-600 focus:border-red-500 focus:ring-red-500' : 'border-slate-300 dark:border-slate-700 focus:border-indigo-500 focus:ring-indigo-500'} bg-white dark:bg-slate-950 dark:text-white shadow-sm px-3 py-2.5 text-sm transition-shadow outline-none focus:ring-1 font-medium placeholder:font-normal placeholder:text-slate-400`}
                required
              />
              {nameError && <p className="mt-1 text-[12px] font-medium text-red-500">{nameError}</p>}
            </div>

            {/* Billing Type Toggle */}
            <div className="block">
              <label className="block text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1.5">
                {t('labels.billing_type')}
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => isHourlyAllowed && setBillingType('hourly')}
                  disabled={!isHourlyAllowed}
                  className={`relative p-3 rounded-xl text-left transition-all border ${
                    !isHourlyAllowed 
                      ? 'opacity-60 cursor-not-allowed bg-slate-50 dark:bg-slate-800/30 border-slate-200 dark:border-slate-800'
                      : billingType === 'hourly' 
                        ? 'border-indigo-600 bg-indigo-50/30 dark:bg-indigo-500/5 ring-1 ring-indigo-600 shadow-sm' 
                        : 'border-slate-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-slate-500 bg-white dark:bg-slate-800/50'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <ClockIcon className={`h-4 w-4 ${billingType === 'hourly' ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400'}`} />
                    <span className={`block font-bold text-sm ${billingType === 'hourly' ? 'text-indigo-900 dark:text-indigo-100' : 'text-slate-900 dark:text-slate-100'}`}>
                      {t('billing.hourly_title')}
                    </span>
                  </div>
                  <span className={`text-[12px] block ${billingType === 'hourly' ? 'text-indigo-700/80 dark:text-indigo-300/80' : 'text-slate-500 dark:text-slate-400'}`}>
                      {!isHourlyAllowed ? 'Not available for this Game' : t('billing.hourly_desc')}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setBillingType('monthly')}
                  className={`relative p-3 rounded-xl text-left transition-all border ${
                    billingType === 'monthly' 
                      ? 'border-indigo-600 bg-indigo-50/30 dark:bg-indigo-500/5 ring-1 ring-indigo-600 shadow-sm' 
                      : 'border-slate-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-slate-500 bg-white dark:bg-slate-800/50'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <CalendarDaysIcon className={`h-4 w-4 ${billingType === 'monthly' ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400'}`} />
                    <span className={`block font-bold text-sm ${billingType === 'monthly' ? 'text-indigo-900 dark:text-indigo-100' : 'text-slate-900 dark:text-slate-100'}`}>
                      {t('billing.monthly_title')}
                    </span>
                  </div>
                  <span className={`text-[12px] block ${billingType === 'monthly' ? 'text-indigo-700/80 dark:text-indigo-300/80' : 'text-slate-500 dark:text-slate-400'}`}>
                    {t('billing.monthly_desc')}
                  </span>
                </button>
              </div>
            </div>

            {/* Location Region Selector */}
            <div className="block">
              <label htmlFor="location" className="block text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1.5">
                {t('labels.location', { defaultValue: 'Region' })}
              </label>
              <div className="relative">
                <MapPinIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                <select
                  id="location"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  disabled={billingType === 'hourly'}
                  className="block w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 dark:text-white shadow-sm pl-9 pr-10 py-2.5 text-sm focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none font-medium disabled:opacity-60 disabled:bg-slate-50 disabled:dark:bg-slate-900 disabled:cursor-not-allowed appearance-none"
                >
                  <option value="EU">
                    {t('locations.eu', { defaultValue: 'Europe (EU)' })}
                  </option>
                  <option value="NA" disabled>
                    {t('locations.na', { defaultValue: 'North America (NA)' })} ({t('locations.soon', { defaultValue: 'Soon' })})
                  </option>
                  <option value="ASIA" disabled>
                    {t('locations.asia', { defaultValue: 'Asia' })} ({t('locations.soon', { defaultValue: 'Soon' })})
                  </option>
                </select>
                <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                  <svg className="h-4 w-4 text-slate-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                    <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                  </svg>
                </div>
              </div>
              {billingType === 'hourly' && (
                <p className="mt-1.5 text-[12px] text-amber-600 dark:text-amber-400/90 font-medium flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                  {t('locations.restriction_note', { defaultValue: '* Hourly nodes are restricted to Europe.' })}
                </p>
              )}
            </div>

            {/* RAM Slider */}
            <div className="block pt-1">
              <div className="flex justify-between items-center mb-3">
                <label className="flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-200">
                  <CpuChipIcon className="h-4 w-4 text-slate-500" />
                  {t('labels.ram')}
                </label>
                <span className="text-xs font-bold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-100 dark:border-indigo-500/20 px-2.5 py-1 rounded-md shadow-sm">
                  {ram} {t('units.gb', { defaultValue: 'GB' })}
                </span>
              </div>
              
              {billingType === 'monthly' ? (
                <input
                  type="range" 
                  min={Math.max(0, currentMinMonthlyIndex)} 
                  max={monthlyTiers.length - 1} 
                  step="1"
                  value={monthlyTiers.indexOf(ram) !== -1 ? monthlyTiers.indexOf(ram) : 0}
                  onChange={handleRamChange}
                  className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-600 dark:accent-indigo-500"
                />
              ) : (
                <input
                  type="range" 
                  min={currentMinRam} 
                  max="32" 
                  step="1"
                  value={ram}
                  onChange={handleRamChange}
                  className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-600 dark:accent-indigo-500"
                />
              )}
              
              <div className="flex justify-between text-[11px] font-bold text-slate-400 dark:text-slate-500 mt-2 px-1">
                <span>{currentMinRam} {t('units.gb', { defaultValue: 'GB' })}</span>
                <span>32 {t('units.gb', { defaultValue: 'GB' })}</span>
              </div>
            </div>

            {/* Cost Estimation Panel */}
            <div className="bg-slate-50 dark:bg-slate-800/40 rounded-xl p-4 border border-slate-200/60 dark:border-slate-700/60 space-y-3">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-1.5">
                  <CurrencyDollarIcon className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                  <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                    {billingType === 'hourly' ? t('costs.estimated_hourly') : t('costs.flat_monthly')}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-xl font-black text-slate-900 dark:text-white block leading-none">
                    {estimatedCost} <span className="text-[12px] font-bold text-slate-500">{billingType === 'hourly' ? t('units.credits_per_hour') : t('units.credits_per_month', { defaultValue: 'Cr / mo' })}</span>
                  </span>
                  <span className="text-[12px] text-slate-500 dark:text-slate-400 font-semibold block mt-1">
                    ≈ €{(estimatedCost / 100).toFixed(2)} {billingType === 'hourly' ? '/hr' : '/mo'}
                  </span>
                </div>
              </div>
              
              <div className="flex justify-between items-center pt-3 border-t border-slate-200 dark:border-slate-700/80">
                <span className="text-xs font-medium text-slate-600 dark:text-slate-400">{t('labels.your_credits')}</span>
                <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 px-2 py-0.5 rounded-md">
                  {creditsNum.toFixed(2)} {t('units.credits')}
                </span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="mt-auto flex justify-end items-center gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="text-slate-600 dark:text-slate-300 py-2 px-4 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition font-semibold text-sm"
              >
                {t('buttons.cancel')}
              </button>
              <button
                type="submit"
                disabled={loading || !canCreate}
                className={`${
                  canCreate 
                    ? "bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 shadow-md hover:shadow-lg shadow-indigo-500/20" 
                    : "bg-slate-300 dark:bg-slate-700 text-slate-500 dark:text-slate-400 cursor-not-allowed"
                } text-white py-2 px-6 rounded-xl transition-all duration-200 font-bold text-sm flex items-center justify-center`}
              >
                {loading ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
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

          </div>
        </div>
      </form>

      {/* Global style injection to ensure scrollbar remains thin and styling is neat for internal panes */}
      <style dangerouslySetInnerHTML={{__html: `
        .custom-scrollbar::-webkit-scrollbar {
          width: 5px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background-color: rgba(148, 163, 184, 0.4);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background-color: rgba(148, 163, 184, 0.6);
        }
        .dark .custom-scrollbar::-webkit-scrollbar-thumb {
          background-color: rgba(51, 65, 85, 0.6);
        }
        .dark .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background-color: rgba(71, 85, 105, 0.8);
        }
      `}} />
    </div>
  );
}