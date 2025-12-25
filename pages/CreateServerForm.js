// pages/CreateServerForm.js

import { useState, useEffect } from "react";
import { supabase } from "../lib/supabaseClient"; 
import { useTranslation } from "next-i18next"; // <--- IMPORTED

export default function CreateServerForm({ onClose, onCreate, credits }) {
  const { t } = useTranslation('create_server'); // <--- INITIALIZED
  const [name, setName] = useState("");
  const [game, setGame] = useState("minecraft");
  const [software, setSoftware] = useState("vanilla");
  const [ram, setRam] = useState(8); 
  const [loading, setLoading] = useState(false);
  const [softwareOptions, setSoftwareOptions] = useState([]);
  const [existingNames, setExistingNames] = useState(new Set());
  const [nameError, setNameError] = useState(null);
  const [userId, setUserId] = useState(null);

  // Example pricing per GB per hour
  const pricePerGB = 1;
  const costPerHour = Number((ram * pricePerGB).toFixed(2)); 
  const creditsNum = Number(credits); 
  const canCreate = creditsNum >= costPerHour && !nameError && name.trim();

  // Updated software options with Translations
  const gameSoftwareOptions = {
    minecraft: [
      { id: "vanilla", name: "Vanilla", description: t('software_desc.vanilla') },
      { id: "paper", name: "Paper", description: t('software_desc.paper') },
      { id: "purpur", name: "Purpur", description: t('software_desc.purpur') },
      { id: "folia", name: "Folia", description: t('software_desc.folia') },
      { id: "spigot", name: "Spigot", description: t('software_desc.spigot') },
      { id: "forge", name: "Forge", description: t('software_desc.forge') },
      { id: "neoforge", name: "NeoForge", description: t('software_desc.neoforge') },
      { id: "fabric", name: "Fabric", description: t('software_desc.fabric') },
      { id: "quilt", name: "Quilt", description: t('software_desc.quilt') },
      { id: "velocity", name: "Velocity", description: t('software_desc.velocity') },
      { id: "waterfall", name: "Waterfall", description: t('software_desc.waterfall') },
    ],
    valheim: [
      { id: "vanilla", name: "Vanilla", description: t('software_desc.vanilla') },
      { id: "plus", name: "Valheim Plus", description: t('software_desc.enhanced') },
    ],
    rust: [
      { id: "vanilla", name: "Vanilla", description: t('software_desc.vanilla') },
      { id: "oxide", name: "Oxide", description: t('software_desc.modding') },
    ],
    terraria: [
      { id: "vanilla", name: "Vanilla", description: t('software_desc.vanilla') },
      { id: "tmodloader", name: "tModLoader", description: t('software_desc.modding') },
    ],
    ark: [
      { id: "vanilla", name: "Vanilla", description: t('software_desc.vanilla') },
    ],
  };

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

  useEffect(() => {
    // Set default software when game changes
    setSoftwareOptions(gameSoftwareOptions[game] || []);
    if (gameSoftwareOptions[game]?.length > 0) {
      setSoftware(gameSoftwareOptions[game][0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game]); // Removed gameSoftwareOptions dependency to avoid loop, strictly usually safe here if t doesn't change often

  const validateName = (value) => {
    const trimmed = value.trim();
    if (!trimmed) {
      setNameError(t('errors.required'));
      return;
    }
    if (trimmed.length < 3) {
      setNameError(t('errors.min_length'));
      return;
    }
    if (trimmed.length > 20) {
      setNameError(t('errors.max_length'));
      return;
    }
    if (!/^[a-zA-Z0-9-]+$/.test(trimmed)) {
      setNameError(t('errors.invalid_chars'));
      return;
    }
    if (existingNames.has(trimmed.toLowerCase())) {
      setNameError(t('errors.exists'));
      return;
    }
    setNameError(null);
  };

  const handleNameChange = (e) => {
    setName(e.target.value);
    validateName(e.target.value);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    validateName(name);
    if (!name.trim()) {
      alert(t('errors.valid_name'));
      return;
    }
    if (nameError) {
      alert(nameError);
      return;
    }
    if (creditsNum < costPerHour) {
      alert(t('errors.credits'));
      return;
    }

    setLoading(true);

    const serverData = { 
      name: name.trim(), 
      game, 
      software,
      ram, 
      costPerHour,
    };

    onCreate(serverData);
    setLoading(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex justify-center items-center z-50">
      <form
        onSubmit={handleSubmit}
        className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-8 w-full max-w-lg space-y-6 dark:text-gray-100"
      >
        <div className="flex justify-between items-center">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t('title')}</h2> {/* <--- TRANSLATED */}
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
          <div className="block">
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t('labels.name')} {/* <--- TRANSLATED */}
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
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {t('hints.name_rules')} {/* <--- TRANSLATED */}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="block">
              <label htmlFor="game" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {t('labels.game')} {/* <--- TRANSLATED */}
              </label>
              <select
                id="game"
                value={game}
                onChange={(e) => setGame(e.target.value)}
                className="block w-full rounded-lg border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white shadow-sm p-3 focus:ring-indigo-500 focus:border-indigo-500"
              >
                {Object.keys(gameSoftwareOptions).map(key => (
                  <option key={key} value={key}>{t(`games.${key}`)}</option> // <--- TRANSLATED
                ))}
              </select>
            </div>
            
            <div className="block">
              <label htmlFor="software" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {t('labels.software')} {/* <--- TRANSLATED */}
              </label>
              <select
                id="software"
                value={software}
                onChange={(e) => setSoftware(e.target.value)}
                className="block w-full rounded-lg border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white shadow-sm p-3 focus:ring-indigo-500 focus:border-indigo-500"
                disabled={softwareOptions.length === 0}
              >
                {softwareOptions.map(option => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          
          {softwareOptions.length > 0 && (
            <div className="bg-indigo-50 dark:bg-indigo-900/30 p-4 rounded-lg">
              <p className="text-sm text-indigo-800 dark:text-indigo-200">
                {softwareOptions.find(opt => opt.id === software)?.description}
              </p>
            </div>
          )}

          <div className="block">
            <div className="flex justify-between items-center mb-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                {t('labels.ram')} {/* <--- TRANSLATED */}
              </label>
              <span className="text-sm font-medium text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 px-3 py-1 rounded-full">
                {ram} GB
              </span>
            </div>
            <input
              type="range" min="2" max="32" step="1"
              value={ram}
              onChange={(e) => setRam(Number(e.target.value))}
              className="w-full h-2 bg-gray-200 dark:bg-slate-600 rounded-lg appearance-none cursor-pointer accent-indigo-600"
            />
            <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-1">
              <span>2 GB</span>
              <span>32 GB</span>
            </div>
          </div>

          <div className="bg-gray-50 dark:bg-slate-700 rounded-lg p-4 space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('labels.cost_est')}</span>
              <span className="text-lg font-bold text-indigo-700 dark:text-indigo-300">
                {costPerHour} credits/hr
              </span>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {t('hints.cost_basis', { price: pricePerGB.toFixed(2) })} {/* <--- TRANSLATED */}
            </p>
            
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('labels.your_credits')}</span>
              <span className={`text-sm font-medium ${creditsNum >= costPerHour ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                {creditsNum.toFixed(2)} credits
              </span>
            </div>
            
            {creditsNum < costPerHour && (
              <p className="text-red-500 dark:text-red-400 text-sm">
                 {t('hints.insufficient_credits', { cost: costPerHour })} {/* <--- TRANSLATED */}
              </p>
            )}
          </div>
        </div>

        <div className="flex justify-end space-x-3 pt-6">
          <button
            type="button"
            onClick={onClose}
            className="bg-white dark:bg-slate-700 border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-gray-200 py-3 px-6 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-600 transition font-medium"
          >
            {t('buttons.cancel')} {/* <--- TRANSLATED */}
          </button>
          <button
            type="submit"
            disabled={loading || !canCreate}
            className={`${
              canCreate 
                ? "bg-indigo-600 hover:bg-indigo-700" 
                : "bg-gray-300 dark:bg-slate-600 cursor-not-allowed"
            } text-white py-3 px-6 rounded-lg transition font-medium flex items-center justify-center`}
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
              canCreate ? t('buttons.create') : nameError ? t('buttons.fix_errors') : t('buttons.insufficient')
            )}
          </button>
        </div>
      </form>
    </div>
  );
}