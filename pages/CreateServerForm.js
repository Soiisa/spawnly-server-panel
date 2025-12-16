// pages/CreateServerForm.js

import { useState, useEffect } from "react";
import { supabase } from "../lib/supabaseClient"; 

export default function CreateServerForm({ onClose, onCreate, credits }) {
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

  // Updated software options for Minecraft
  const gameSoftwareOptions = {
    minecraft: [
      { id: "vanilla", name: "Vanilla", description: "Official Minecraft server" },
      { id: "paper", name: "Paper", description: "High-performance Spigot fork" },
      { id: "purpur", name: "Purpur", description: "Paper fork with more features" },
      { id: "folia", name: "Folia", description: "Experimental multithreaded server" },
      { id: "spigot", name: "Spigot", description: "Standard plugin server" },
      { id: "forge", name: "Forge", description: "Classic mod loader" },
      { id: "neoforge", name: "NeoForge", description: "Modern mod loader" },
      { id: "fabric", name: "Fabric", description: "Lightweight mod loader" },
      { id: "quilt", name: "Quilt", description: "Community-driven mod loader" },
      { id: "arclight", name: "Arclight", description: "Forge/NeoForge + Plugins" },
      { id: "mohist", name: "Mohist", description: "Forge + Plugins" },
      { id: "magma", name: "Magma", description: "Forge + Plugins" },
      { id: "velocity", name: "Velocity", description: "Proxy server" },
      { id: "waterfall", name: "Waterfall", description: "Legacy proxy server" },
    ],
    valheim: [
      { id: "vanilla", name: "Vanilla", description: "Official Valheim server" },
      { id: "plus", name: "Valheim Plus", description: "Enhanced with quality-of-life features" },
    ],
    rust: [
      { id: "vanilla", name: "Vanilla", description: "Official Rust server" },
      { id: "oxide", name: "Oxide", description: "Modding framework with plugins" },
    ],
    terraria: [
      { id: "vanilla", name: "Vanilla", description: "Official Terraria server" },
      { id: "tmodloader", name: "tModLoader", description: "Modding platform" },
    ],
    ark: [
      { id: "vanilla", name: "Vanilla", description: "Official ARK server" },
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
  }, [game]);

  const validateName = (value) => {
    const trimmed = value.trim();
    if (!trimmed) {
      setNameError("Server name is required");
      return;
    }
    if (trimmed.length < 3) {
      setNameError("Name must be at least 3 characters");
      return;
    }
    if (trimmed.length > 20) {
      setNameError("Name must be at most 20 characters");
      return;
    }
    if (!/^[a-zA-Z0-9-]+$/.test(trimmed)) {
      setNameError("Name can only contain letters, numbers, and hyphens");
      return;
    }
    if (existingNames.has(trimmed.toLowerCase())) {
      setNameError("A server with this name already exists");
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
      alert("Please enter a valid server name");
      return;
    }
    if (nameError) {
      alert(nameError);
      return;
    }
    if (creditsNum < costPerHour) {
      alert("You don't have enough credits for this server");
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
      {/* UPDATED: Added dark mode classes for modal container */}
      <form
        onSubmit={handleSubmit}
        className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-8 w-full max-w-lg space-y-6 dark:text-gray-100"
      >
        <div className="flex justify-between items-center">
          {/* UPDATED: Added dark mode class for text */}
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Create New Server</h2>
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
            {/* UPDATED: Added dark mode class for label */}
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Server Name
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={handleNameChange}
              placeholder="my-awesome-server"
              // UPDATED: Added dark mode classes for input
              className={`block w-full rounded-lg border ${nameError ? 'border-red-300 dark:border-red-700' : 'border-gray-300 dark:border-slate-600'} dark:bg-slate-700 dark:text-white shadow-sm p-3 focus:ring-indigo-500 focus:border-indigo-500`}
              required
            />
            {nameError && <p className="mt-1 text-sm text-red-600 dark:text-red-400">{nameError}</p>}
            {/* UPDATED: Added dark mode class for hint text */}
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              3-20 characters, letters, numbers, and hyphens only. Must be unique.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="block">
              {/* UPDATED: Added dark mode class for label */}
              <label htmlFor="game" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Game
              </label>
              <select
                id="game"
                value={game}
                onChange={(e) => setGame(e.target.value)}
                // UPDATED: Added dark mode classes for select
                className="block w-full rounded-lg border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white shadow-sm p-3 focus:ring-indigo-500 focus:border-indigo-500"
              >
                <option value="minecraft">Minecraft</option>
                <option value="valheim">Valheim</option>
                <option value="rust">Rust</option>
                <option value="terraria">Terraria</option>
                <option value="ark">ARK: Survival Evolved</option>
              </select>
            </div>
            
            <div className="block">
              {/* UPDATED: Added dark mode class for label */}
              <label htmlFor="software" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Software
              </label>
              <select
                id="software"
                value={software}
                onChange={(e) => setSoftware(e.target.value)}
                // UPDATED: Added dark mode classes for select
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
            // UPDATED: Added dark mode classes for info box
            <div className="bg-indigo-50 dark:bg-indigo-900/30 p-4 rounded-lg">
              <p className="text-sm text-indigo-800 dark:text-indigo-200">
                {softwareOptions.find(opt => opt.id === software)?.description}
              </p>
            </div>
          )}

          <div className="block">
            <div className="flex justify-between items-center mb-2">
              {/* UPDATED: Added dark mode class for label */}
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                RAM Allocation
              </label>
              {/* UPDATED: Added dark mode classes for badge */}
              <span className="text-sm font-medium text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 px-3 py-1 rounded-full">
                {ram} GB
              </span>
            </div>
            <input
              type="range"
              min="2"
              max="32"
              step="1"
              value={ram}
              onChange={(e) => setRam(Number(e.target.value))}
              // UPDATED: Added dark mode class for range input
              className="w-full h-2 bg-gray-200 dark:bg-slate-600 rounded-lg appearance-none cursor-pointer accent-indigo-600"
            />
            {/* UPDATED: Added dark mode class for range labels */}
            <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-1">
              <span>2 GB</span>
              <span>32 GB</span>
            </div>
          </div>

          {/* UPDATED: Added dark mode classes for cost summary */}
          <div className="bg-gray-50 dark:bg-slate-700 rounded-lg p-4 space-y-2">
            <div className="flex justify-between items-center">
              {/* UPDATED: Added dark mode class for text */}
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Estimated Cost</span>
              {/* UPDATED: Added dark mode class for text */}
              <span className="text-lg font-bold text-indigo-700 dark:text-indigo-300">
                {costPerHour} credits/hr
              </span>
            </div>
            {/* UPDATED: Added dark mode class for text */}
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Based on {pricePerGB.toFixed(2)} credits per GB per hour
            </p>
            
            <div className="flex justify-between items-center">
              {/* UPDATED: Added dark mode class for text */}
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Your Credits</span>
              {/* UPDATED: Added dark mode classes for credit text */}
              <span className={`text-sm font-medium ${creditsNum >= costPerHour ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                {creditsNum.toFixed(2)} credits
              </span>
            </div>
            
            {creditsNum < costPerHour && (
              // UPDATED: Added dark mode class for text
              <p className="text-red-500 dark:text-red-400 text-sm">
                You need at least {costPerHour} credits for this server
              </p>
            )}
          </div>
        </div>

        <div className="flex justify-end space-x-3 pt-6">
          <button
            type="button"
            onClick={onClose}
            // UPDATED: Added dark mode classes for cancel button
            className="bg-white dark:bg-slate-700 border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-gray-200 py-3 px-6 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-600 transition font-medium"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading || !canCreate}
            // UPDATED: Added dark mode classes for submit button
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
                Creating...
              </>
            ) : (
              canCreate ? "Create Server" : nameError ? "Fix Name Errors" : "Insufficient Credits"
            )}
          </button>
        </div>
      </form>
    </div>
  );
}