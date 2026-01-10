// pages/privacy.js
import Head from "next/head";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';

export default function PrivacyPolicy() {
  const lastUpdated = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-slate-950 font-sans text-slate-900 dark:text-slate-100 transition-colors duration-300">
      <Head>
        <title>Privacy Policy | Spawnly</title>
      </Head>
      <Navbar />
      <main className="flex-grow container mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="max-w-4xl mx-auto bg-white dark:bg-slate-800 p-8 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700">
          
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">Privacy Policy</h1>
          <p className="text-gray-500 dark:text-gray-400 mb-8">Last Updated: {lastUpdated}</p>

          <div className="prose prose-slate dark:prose-invert max-w-none text-gray-700 dark:text-gray-300 space-y-6">
            
            <section>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-3">1. Introduction</h2>
              <p>
                <strong>Spawnly</strong> ("we") values your privacy. This policy details how we handle your data in compliance with the General Data Protection Regulation (GDPR).
                By using our services, you consent to the data practices described in this policy.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-3">2. Data We Collect</h2>
              <ul className="list-disc pl-5 space-y-2">
                <li><strong>Identity Data:</strong> Email address, encrypted passwords, and OAuth provider IDs (Google).</li>
                <li><strong>Financial Data:</strong> Transaction history and payment identifiers. <strong>Note:</strong> We do not store full credit card numbers; these are handled directly by Stripe.</li>
                <li><strong>Technical Data:</strong> IP addresses, browser type, login timestamps, and server resource usage logs (CPU/RAM metrics).</li>
                <li><strong>User Content:</strong> Minecraft world files, properties files, and server logs uploaded to our infrastructure.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-3">3. Infrastructure & Sub-processors</h2>
              <p>To provide our service, we use the following third-party providers. We have Data Processing Agreements (DPA) in place where applicable.</p>
              
              <div className="overflow-x-auto mt-4">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-gray-100 dark:bg-slate-700">
                    <tr>
                      <th className="p-3 font-semibold">Provider</th>
                      <th className="p-3 font-semibold">Purpose</th>
                      <th className="p-3 font-semibold">Location</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-slate-700">
                    <tr>
                      <td className="p-3"><strong>Hetzner Online GmbH</strong></td>
                      <td className="p-3">Primary Hosting (App, Database, Game Servers)</td>
                      <td className="p-3">Germany / Finland (EU)</td>
                    </tr>
                    <tr>
                      <td className="p-3"><strong>AWS (S3)</strong></td>
                      <td className="p-3">Encrypted Backups & File Storage</td>
                      <td className="p-3">EU Regions</td>
                    </tr>
                    <tr>
                      <td className="p-3"><strong>Stripe</strong></td>
                      <td className="p-3">Payment Processing</td>
                      <td className="p-3">Global</td>
                    </tr>
                    <tr>
                      <td className="p-3"><strong>Google</strong></td>
                      <td className="p-3">Optional Social Login</td>
                      <td className="p-3">Global</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="text-sm mt-2 italic">
                * Note: Our database is self-hosted on Hetzner infrastructure. We do not share your database records with "Supabase Inc."
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-3">4. How We Use Your Data</h2>
              <p>We use your data solely to:</p>
              <ul className="list-disc pl-5">
                <li>Provision and manage Minecraft server instances.</li>
                <li>Process payments and maintain billing ledgers.</li>
                <li>Prevent fraud and abuse (e.g., detecting multiple accounts to bypass free tier restrictions).</li>
                <li>Comply with legal obligations (e.g., tax laws).</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-3">5. Data Retention</h2>
              <p>
                <strong>Account Data:</strong> Retained for the lifetime of your account. Inactive accounts may be pruned after 12 months of inactivity. <br/>
                <strong>Server Data:</strong> Retained as long as the server exists. Deleting a server via the dashboard immediately schedules the associated S3 data for permanent deletion.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-3">6. Your Rights (GDPR)</h2>
              <p>You have the right to:</p>
              <ul className="list-disc pl-5 space-y-1">
                <li><strong>Access:</strong> Request a copy of the personal data we hold about you.</li>
                <li><strong>Rectification:</strong> Correct inaccurate data.</li>
                <li><strong>Erasure ("Right to be Forgotten"):</strong> Request deletion of your account and all associated data, provided we have no legal obligation to keep it (e.g., tax records).</li>
                <li><strong>Portability:</strong> Receive your data in a structured, commonly used format.</li>
              </ul>
              <p className="mt-2">
                Contact <a href="mailto:support@spawnly.net" className="text-indigo-600 hover:underline">support@spawnly.net</a> to exercise these rights.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-3">7. Cookies</h2>
              <p>
                We use essential cookies for authentication (maintaining your login session) and security (CSRF protection). We do not use third-party tracking cookies for advertising purposes.
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