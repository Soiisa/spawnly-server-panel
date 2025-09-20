// pages/pricing.js
import Link from "next/link";

const tiers = [
  { ram: 1, creditsPerHour: 0.5, desc: "Small (good for tiny servers / testing)" },
  { ram: 2, creditsPerHour: 1, desc: "Basic (small vanilla worlds & lightweight mods)" },
  { ram: 4, creditsPerHour: 2, desc: "Standard (recommended for small friend groups)" },
  { ram: 8, creditsPerHour: 4, desc: "Large (modded servers / heavier plugins)" },
  { ram: 16, creditsPerHour: 8, desc: "XL (big communities, heavy modpacks)" },
];

export default function Pricing() {
  return (
    <div className="container mx-auto px-6 py-16">
      <div className="max-w-3xl mx-auto text-center">
        <h1 className="text-4xl font-bold text-indigo-900 mb-4">Pricing built for flexibility</h1>
        <p className="text-neutral-600 mb-8">Choose the RAM amount you need. Servers are billed hourly — credits deducted every 5 minutes.</p>
      </div>

      <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-6">
        {tiers.map((t) => (
          <div key={t.ram} className="bg-white rounded-xl shadow p-6 flex flex-col justify-between">
            <div>
              <h3 className="text-xl font-semibold text-indigo-900">{t.ram} GB</h3>
              <p className="text-neutral-600 mt-2">{t.desc}</p>
            </div>

            <div className="mt-6">
              <p className="text-2xl font-bold">{t.creditsPerHour} credits / hr</p>
              <p className="text-sm text-neutral-500 mt-1">(~€{(t.creditsPerHour * 0.01).toFixed(2)} / hr)</p>
              <Link href="/register" className="inline-block mt-4 bg-teal-500 hover:bg-teal-400 text-white font-semibold py-2 px-4 rounded">
                Spawn — {t.creditsPerHour}c/hr
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
