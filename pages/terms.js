// pages/terms.js
import Head from "next/head";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import Link from "next/link";
import { serverSideTranslations } from 'next-i18next/serverSideTranslations'; // <--- IMPORTED

export default function TermsOfService() {
  const lastUpdated = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-slate-950 font-sans text-slate-900 dark:text-slate-100 transition-colors duration-300">
      <Head>
        <title>Terms of Service | Spawnly</title>
      </Head>

      <Navbar />

      <main className="flex-grow container mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="max-w-4xl mx-auto bg-white dark:bg-slate-800 p-8 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700">
          
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">Terms of Service</h1>
          <p className="text-gray-500 dark:text-gray-400 mb-8">Last Updated: {lastUpdated}</p>

          <div className="prose prose-slate dark:prose-invert max-w-none text-gray-700 dark:text-gray-300 space-y-6">
            
            <section>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-3">1. Acceptance of Terms</h2>
              <p>
                By creating an account and using Spawnly ("the Service"), you agree to be bound by these Terms of Service. 
                If you do not agree to these terms, you must strictly stop using our services and delete your account.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-3">2. Service Description & Hosting</h2>
              <p>
                Spawnly provides on-demand Minecraft server hosting. 
                You acknowledge that our infrastructure is provisioned via third-party providers, primarily <strong>Hetzner Online GmbH</strong>. 
                By using our services, you also agree to comply with Hetzner's Acceptable Use Policy.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-3">3. Billing & Credits</h2>
              <ul className="list-disc pl-5 space-y-2">
                <li>
                  <strong>Credit System:</strong> Services are paid for using pre-purchased "Credits." 
                  One (1) Credit is approximately equal to €0.01 in purchasing power, though this exchange rate may vary based on active promotions or bulk discounts.
                </li>
                <li>
                  <strong>Pay-As-You-Go:</strong> Credits are deducted from your account balance every minute your server status is <strong>"Running."</strong>
                </li>
                <li>
                  <strong>Stopped Servers:</strong> We do not charge credits while your server is in a <strong>"Stopped"</strong> state, although we reserve the right to charge a small fee for storage of large files if they are kept inactive for extended periods (currently free).
                </li>
                <li>
                  <strong>Refunds:</strong> Credits are non-refundable once purchased, except where required by law.
                </li>
              </ul>
            </section>

            {/* Dark Mode adjusted Warning Box */}
            <section className="bg-red-50 dark:bg-red-900/20 p-4 rounded-lg border border-red-100 dark:border-red-900/30">
              <h2 className="text-xl font-bold text-red-800 dark:text-red-300 mb-3">4. Automatic Termination (Kill Switch)</h2>
              <p className="text-red-700 dark:text-red-200 font-medium">
                It is your responsibility to maintain a positive Credit balance.
              </p>
              <p className="text-red-700 dark:text-red-200 mt-2">
                If your Credit balance drops below zero or becomes insufficient to cover the current hour of usage:
              </p>
              <ul className="list-disc pl-5 mt-2 space-y-1 text-red-700 dark:text-red-200">
                <li>Your server will be <strong>automatically stopped</strong> immediately without prior notice.</li>
                <li>If the balance remains unpaid for an extended period (e.g., 30 days), we reserve the right to <strong>permanently delete</strong> your server files and data to free up storage space.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-3">5. Acceptable Use Policy (AUP)</h2>
              <p>You may strictly NOT use our servers for:</p>
              <ul className="list-disc pl-5 space-y-2">
                <li>Cryptocurrency mining or any other compute-intensive non-gaming tasks.</li>
                <li>Launching DDoS attacks, port scanning, or network intrusion activities.</li>
                <li>Hosting illegal content, malware, or phishing sites.</li>
                <li>Bypassing Mojang's EULA (e.g., selling "pay-to-win" items in violation of Minecraft's commercial usage guidelines).</li>
              </ul>
              <p className="mt-2">
                Violation of these rules will result in immediate account suspension without refund.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-3">6. Uptime & Liability</h2>
              <p>
                While we aim for 99.9% platform uptime, we do not guarantee uninterrupted service. 
                We are not liable for data loss, revenue loss, or "downtime" caused by:
              </p>
              <ul className="list-disc pl-5 space-y-2">
                <li>Third-party provider outages (e.g., Hetzner, AWS, Supabase).</li>
                <li>User error (e.g., installing corrupted mods or plugins).</li>
                <li>Force Majeure events.</li>
              </ul>
              <p className="mt-2">
                THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTY OF ANY KIND.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-3">7. User Content & Backups</h2>
              <p>
                You retain ownership of the world files and data you upload. 
                However, you grant us a license to host, copy, and modify these files solely for the purpose of running your server.
                We provide backup tools, but <strong>you are ultimately responsible</strong> for maintaining local copies of your data. We are not liable for corrupted or lost world saves.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-3">8. Governing Law</h2>
              <p>
                These Terms shall be governed by the laws of Portugal and the European Union. 
                Any disputes arising from these terms shall be resolved in the courts of [Your City], Portugal.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-3">9. Contact</h2>
              <p>
                For legal inquiries, please contact us at <a href="mailto:support@spawnly.net" className="text-teal-600 dark:text-teal-400 hover:underline">support@spawnly.net</a>.
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