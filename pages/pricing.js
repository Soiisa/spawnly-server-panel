import { useState } from "react";
import Link from "next/link";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import { 
  CheckIcon, 
  CurrencyDollarIcon, 
  AdjustmentsHorizontalIcon 
} from "@heroicons/react/24/outline";

export default function Pricing() {
  const [ram, setRam] = useState(4);

  // Pricing Logic: 1 Credit = 1 GB RAM per hour
  const creditsPerHour = ram;
  const pricePerHourEuro = (creditsPerHour * 0.01).toFixed(2);

  const features = [
    "DDoS Protection Included",
    "Unlimited Player Slots",
    "File Access",
    "Mod & Plugin Support",
    "Instant Setup",
    "99.9% Platform Uptime", // Changed from "24/7 Uptime" to be more accurate for on-demand
  ];

  // Dynamic recommendation text based on RAM
  const getRecommendation = (gb) => {
    if (gb <= 2) return "Good for small Vanilla servers with up to 5 friends. Not recommended for mods.";
    if (gb <= 4) return "Perfect for Vanilla with up to 10 friends, or lightweight modpacks (approx. 50 mods).";
    if (gb <= 8) return "Great for standard modpacks (100+ mods) or Vanilla servers with 20+ players.";
    if (gb <= 12) return "Ideal for heavy modpacks (200+ mods) or larger communities (40+ players).";
    if (gb <= 16) return "Powerful performance for very heavy modpacks (300+ mods) or 60+ players.";
    return "Enterprise-grade power for massive networks, 100+ players, or the most demanding modpacks.";
  };

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-slate-950 font-sans text-slate-900 dark:text-slate-100">
      <Navbar />

      <main className="flex-grow">
        
        {/* Header Section */}
        <section className="bg-indigo-900 text-white py-20 px-4 sm:px-6 lg:px-8 text-center relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none">
            <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
              <path d="M0 100 C 20 0 50 0 100 100 Z" fill="white" />
            </svg>
          </div>
          <div className="relative z-10 max-w-3xl mx-auto">
            <h1 className="text-4xl font-extrabold sm:text-5xl mb-6">
              Simple, Transparent Pricing
            </h1>
            <p className="text-xl text-indigo-100 max-w-2xl mx-auto">
              We believe in paying only for the resources you use. 
              <br />
              <span className="font-semibold text-white">1 Credit = 1 GB RAM per hour.</span>
            </p>
          </div>
        </section>

        {/* Calculator Section */}
        <section className="relative -mt-16 px-4 sm:px-6 lg:px-8 pb-16">
          <div className="max-w-5xl mx-auto bg-white dark:bg-slate-800 rounded-3xl shadow-xl border border-gray-100 dark:border-slate-700 overflow-hidden">
            <div className="grid grid-cols-1 lg:grid-cols-2">
              
              {/* Left: Interactive Sliders */}
              <div className="p-8 md:p-12">
                <div className="flex items-center gap-3 mb-8">
                  <div className="p-3 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl text-indigo-600 dark:text-indigo-400">
                    <AdjustmentsHorizontalIcon className="w-8 h-8" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Customize Your Server</h2>
                    <p className="text-gray-500 dark:text-gray-400">Slide to adjust RAM allocation</p>
                  </div>
                </div>

                <div className="mb-10">
                  <div className="flex justify-between items-end mb-4">
                    <label htmlFor="ram-slider" className="text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
                      Memory (RAM)
                    </label>
                    <div className="text-3xl font-bold text-indigo-600 dark:text-indigo-400">
                      {ram} <span className="text-lg text-gray-500 dark:text-gray-400 font-medium">GB</span>
                    </div>
                  </div>
                  
                  <input
                    id="ram-slider"
                    type="range"
                    min="2"
                    max="32"
                    step="1"
                    value={ram}
                    onChange={(e) => setRam(Number(e.target.value))}
                    className="w-full h-3 bg-gray-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                  />
                  <div className="flex justify-between text-xs text-gray-400 dark:text-gray-500 mt-2 font-medium">
                    <span>2 GB</span>
                    <span>16 GB</span>
                    <span>32 GB</span>
                  </div>
                </div>

                <div className="bg-gray-50 dark:bg-slate-700/50 rounded-xl p-6 border border-gray-100 dark:border-slate-600 transition-all duration-300">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Capabilities:</h3>
                  <p className="text-gray-700 dark:text-gray-300 text-sm leading-relaxed font-medium">
                    {getRecommendation(ram)}
                  </p>
                </div>
              </div>

              {/* Right: Cost Breakdown */}
              <div className="bg-slate-900 p-8 md:p-12 text-white flex flex-col justify-between">
                <div>
                  <h3 className="text-lg font-medium text-slate-300 mb-6">Estimated Cost</h3>
                  
                  <div className="space-y-6">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <CurrencyDollarIcon className="w-6 h-6 text-teal-400" />
                        <span className="text-lg">Hourly Rate</span>
                      </div>
                      <div className="text-right">
                        <p className="text-3xl font-bold text-white">{creditsPerHour} <span className="text-base font-normal text-slate-400">credits</span></p>
                        <p className="text-sm text-slate-400">~ €{pricePerHourEuro}</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-10">
                  <Link 
                    href="/register"
                    className="block w-full text-center bg-teal-500 hover:bg-teal-400 text-slate-900 font-bold py-4 px-6 rounded-xl transition-all transform hover:-translate-y-1 shadow-lg shadow-teal-900/20"
                  >
                    Deploy {ram}GB Server Now
                  </Link>
                  <p className="text-center text-xs text-slate-500 mt-4">
                    No credit card required to sign up.
                  </p>
                </div>
              </div>

            </div>
          </div>
        </section>

        {/* Features List */}
        <section className="py-16 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature, idx) => (
              <div key={idx} className="flex items-center gap-3 p-4 bg-white dark:bg-slate-800 rounded-lg border border-gray-100 dark:border-slate-700 shadow-sm">
                <div className="p-1 bg-green-100 dark:bg-green-900/30 rounded-full">
                  <CheckIcon className="w-4 h-4 text-green-600 dark:text-green-400" />
                </div>
                <span className="text-gray-700 dark:text-gray-300 font-medium">{feature}</span>
              </div>
            ))}
          </div>
        </section>

        {/* FAQ Section */}
        <section className="bg-gray-100 dark:bg-slate-900 py-16 px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">How does billing work?</h2>
            <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
              Spawnly uses a credit-based system. You purchase credits (1 Credit ≈ €0.01), and we deduct them from your balance every minute your server is <strong>Running</strong>. 
              If you <strong>Stop</strong> your server, billing pauses immediately, but your files are kept safe for free.
            </p>
          </div>
        </section>

      </main>

      <Footer />
    </div>
  );
}