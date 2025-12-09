// pages/pricing.js
import Link from "next/link";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import { CheckIcon } from "@heroicons/react/24/solid";

const tiers = [
  { 
    ram: 2, 
    creditsPerHour: 1, 
    desc: "Good for small vanilla worlds & lightweight mods.",
    recommended: false 
  },
  { 
    ram: 4, 
    creditsPerHour: 2, 
    desc: "Standard choice for small friend groups.",
    recommended: true 
  },
  { 
    ram: 8, 
    creditsPerHour: 4, 
    desc: "Great for modded servers & heavier plugins.",
    recommended: false 
  },
  { 
    ram: 16, 
    creditsPerHour: 8, 
    desc: "XL power for big communities and modpacks.",
    recommended: false 
  },
];

export default function Pricing() {
  return (
    <div className="min-h-screen flex flex-col bg-gray-50 font-sans text-slate-900">
      <Navbar />

      <main className="flex-grow py-16 px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h1 className="text-4xl font-extrabold text-gray-900 sm:text-5xl">
            Flexible, transparent pricing
          </h1>
          <p className="mt-4 text-xl text-gray-500">
            Choose the RAM you need. Servers are billed hourly from your credit balance.
            <br />
            <span className="text-indigo-600 font-medium">Credits are deducted every minute the server runs.</span>
          </p>
        </div>

        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {tiers.map((tier) => (
            <div 
              key={tier.ram} 
              className={`relative flex flex-col bg-white rounded-2xl shadow-sm border ${
                tier.recommended 
                  ? 'border-indigo-600 ring-2 ring-indigo-600 ring-opacity-50 shadow-xl scale-105 z-10' 
                  : 'border-gray-200'
              }`}
            >
              {tier.recommended && (
                <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-indigo-600 text-white px-4 py-1 rounded-full text-xs font-bold uppercase tracking-wide">
                  Most Popular
                </div>
              )}

              <div className="p-6 border-b border-gray-100 flex-grow">
                <h3 className="text-lg font-semibold text-gray-900">{tier.ram} GB RAM</h3>
                <p className="mt-4 flex items-baseline">
                  <span className="text-4xl font-extrabold tracking-tight text-gray-900">{tier.creditsPerHour}</span>
                  <span className="ml-1 text-xl font-medium text-gray-500">credits/hr</span>
                </p>
                <p className="mt-1 text-sm text-gray-400">
                  (~€{(tier.creditsPerHour * 0.01).toFixed(2)} / hr)
                </p>
                <p className="mt-6 text-gray-500 text-sm leading-relaxed">
                  {tier.desc}
                </p>

                <ul className="mt-6 space-y-4">
                  <li className="flex items-start">
                    <CheckIcon className="h-5 w-5 text-green-500 shrink-0" />
                    <span className="ml-3 text-sm text-gray-600">Full FTP/File Access</span>
                  </li>
                  <li className="flex items-start">
                    <CheckIcon className="h-5 w-5 text-green-500 shrink-0" />
                    <span className="ml-3 text-sm text-gray-600">DDoS Protection</span>
                  </li>
                  <li className="flex items-start">
                    <CheckIcon className="h-5 w-5 text-green-500 shrink-0" />
                    <span className="ml-3 text-sm text-gray-600">Unlimited Slots</span>
                  </li>
                </ul>
              </div>

              <div className="p-6 bg-gray-50 rounded-b-2xl">
                <Link 
                  href="/register"
                  className={`block w-full text-center px-4 py-3 rounded-xl font-semibold transition-all ${
                    tier.recommended
                      ? 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-md hover:shadow-lg'
                      : 'bg-white text-indigo-600 border border-gray-200 hover:bg-gray-50 hover:border-gray-300'
                  }`}
                >
                  Deploy {tier.ram}GB Server
                </Link>
              </div>
            </div>
          ))}
        </div>

        {/* FAQ or Additional Info */}
        <div className="max-w-3xl mx-auto mt-20 text-center">
          <h3 className="text-lg font-semibold text-gray-900">How do credits work?</h3>
          <p className="mt-2 text-gray-500">
            1 Credit ≈ €0.01. You can purchase credits in the dashboard. 
            When you stop your server, billing stops immediately. Your files are kept safe for free.
          </p>
        </div>
      </main>

      <Footer />
    </div>
  );
}