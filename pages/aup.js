// pages/aup.js
import Head from "next/head";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import { serverSideTranslations } from 'next-i18next/serverSideTranslations'; // <--- IMPORTED

export default function AcceptableUsePolicy() {
  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-slate-950 font-sans text-slate-900 dark:text-slate-100 transition-colors duration-300">
      <Head>
        <title>Acceptable Use Policy | Spawnly</title>
      </Head>

      <Navbar />

      <main className="flex-grow container mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="max-w-4xl mx-auto bg-white dark:bg-slate-800 p-8 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700">
          
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">Acceptable Use Policy</h1>
          <p className="text-gray-500 dark:text-gray-400 mb-8">Strictly Enforced</p>

          <div className="prose prose-slate dark:prose-invert max-w-none text-gray-700 dark:text-gray-300 space-y-6">
            
            <section className="bg-red-50 dark:bg-red-900/20 p-4 rounded-lg border border-red-100 dark:border-red-900/30">
              <h2 className="text-lg font-bold text-red-800 dark:text-red-300 mb-2">Zero Tolerance Policy</h2>
              <p className="text-red-700 dark:text-red-200 text-sm">
                Violation of this AUP will result in the <strong>immediate termination</strong> of your server and suspension of your account without refund. We cooperate fully with law enforcement for illegal activities.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-3">1. Prohibited Resource Usage</h2>
              <ul className="list-disc pl-5 space-y-2">
                <li><strong>Crypto Mining:</strong> Any form of cryptocurrency mining (Bitcoin, Monero, etc.) or blockchain plotting.</li>
                <li><strong>Network Abuse:</strong> IP spoofing, port scanning, or using the server as a proxy/VPN for illicit purposes.</li>
                <li><strong>Botnets:</strong> Using the server to control or participate in a botnet.</li>
                <li><strong>Attacks:</strong> Launching Denial of Service (DoS) or Distributed Denial of Service (DDoS) attacks.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-3">2. Content Restrictions</h2>
              <p>You may not host or distribute:</p>
              <ul className="list-disc pl-5 space-y-2">
                <li>Phishing sites or scam pages.</li>
                <li>Malware, viruses, or exploit kits.</li>
                <li>Child Sexual Abuse Material (CSAM).</li>
                <li>Copyrighted material without authorization (Warez).</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-3">3. Minecraft EULA Compliance</h2>
              <p>
                As a Minecraft server host, we respect Mojang Studios' commercial usage guidelines. 
                You agree not to use Spawnly servers to sell "pay-to-win" items or features that violate the <a href="https://account.mojang.com/documents/minecraft_eula" target="_blank" className="text-indigo-600 hover:underline">Minecraft EULA</a>.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-3">4. Reporting Abuse</h2>
              <p>
                If you suspect a Spawnly server is violating this policy, please report it immediately to <a href="mailto:abuse@spawnly.net" className="text-indigo-600 hover:underline">abuse@spawnly.net</a> with the server IP/subdomain and timestamp.
              </p>
            </section>

          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}

// --- REQUIRED FOR NAVBAR/FOOTER TRANSLATIONS ---
export async function getStaticProps({ locale }) {
  return {
    props: {
      ...(await serverSideTranslations(locale, ['common'])),
    },
  };
}