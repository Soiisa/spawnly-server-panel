// pages/aup.js
import Head from "next/head";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';

export default function AcceptableUsePolicy() {
  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-slate-950 font-sans text-slate-900 dark:text-slate-100 transition-colors duration-300">
      <Head>
        <title>Acceptable Use Policy | Spawnly</title>
      </Head>
      <Navbar />
      <main className="flex-grow container mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="max-w-4xl mx-auto bg-white dark:bg-slate-800 p-8 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700">
          
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">Acceptable Use Policy (AUP)</h1>
          <p className="text-gray-500 dark:text-gray-400 mb-8">Strictly Enforced. Zero Tolerance.</p>

          <div className="prose prose-slate dark:prose-invert max-w-none text-gray-700 dark:text-gray-300 space-y-6">
            
            <section className="bg-red-50 dark:bg-red-900/20 p-4 rounded-lg border border-red-100 dark:border-red-900/30">
              <h2 className="text-lg font-bold text-red-800 dark:text-red-300 mb-2">Enforcement</h2>
              <p className="text-red-700 dark:text-red-200 text-sm">
                We employ automated monitoring systems to detect abuse. Violations of this AUP will result in <strong>immediate server termination</strong> and account suspension without refund. Serious offenses will be reported to relevant authorities (e.g., Hetzner Abuse, Law Enforcement).
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-3">1. Prohibited Technical Activities</h2>
              <p>You may not use Spawnly infrastructure for:</p>
              <ul className="list-disc pl-5 space-y-2">
                <li>
                  <strong>Cryptocurrency Mining:</strong> Mining Bitcoin, Monero, Ethereum, or any other Proof-of-Work activities.
                </li>
                <li>
                  <strong>DDoS / Network Attacks:</strong> Launching attacks, operating booter services, or using the server to scan ports/vulnerabilities on the internet (e.g., `zmap`, `masscan`).
                </li>
                <li>
                  <strong>Abusive Resource Usage:</strong> Deliberately "pinning" CPU cores at 100% for extended periods unrelated to normal gameplay (e.g., synthetic benchmarks, mathematical modeling).
                </li>
                <li>
                  <strong>Proxies/VPNs:</strong> Running public tor exit nodes, open proxies, or VPN services meant to bypass censorship or geolocation blocks.
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-3">2. Prohibited Content</h2>
              <ul className="list-disc pl-5 space-y-2">
                <li><strong>Illegal Content:</strong> Hosting CSAM (Child Sexual Abuse Material), terrorist propaganda, or content promoting violence. (Reported immediately to NCMEC/Authorities).</li>
                <li><strong>Malware:</strong> Hosting Command & Control (C2) servers, distributing viruses, ransomware, or spyware.</li>
                <li><strong>Phishing:</strong> Hosting fake login pages or scam sites.</li>
                <li><strong>Copyright Infringement:</strong> Distributing cracked software ("Warez"), movies, or music without license.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-3">3. Mojang & Game Compliance</h2>
              <p>
                You must comply with the <a href="https://account.mojang.com/documents/minecraft_eula" target="_blank" className="text-indigo-600 hover:underline">Minecraft EULA</a>.
              </p>
              <ul className="list-disc pl-5 mt-2">
                <li>Do not sell "pay-to-win" items that give competitive advantages for real money.</li>
                <li>Do not misuse Mojang's brand or assets.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-3">4. Reporting Abuse</h2>
              <p>
                To report a violation, email <a href="mailto:abuse@spawnly.net" className="text-indigo-600 hover:underline">abuse@spawnly.net</a>. Please include the Server IP/Subdomain, timestamp, and evidence (logs/screenshots).
              </p>
            </section>

          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}

export async function getStaticProps({ locale }) {
  return {
    props: { ...(await serverSideTranslations(locale, ['common'])) },
  };
}