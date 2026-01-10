// pages/terms.js
import Head from "next/head";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';

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
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-3">1. Agreement to Terms</h2>
              <p>
                These Terms of Service ("Terms") constitute a legally binding agreement made between you, whether personally or on behalf of an entity ("you") and <strong>Spawnly</strong> ("we," "us," or "our"), concerning your access to and use of the Spawnly website and hosting services.
                By registering for an account, you agree that you have read, understood, and agreed to be bound by all of these Terms.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-3">2. Service Provision & Infrastructure</h2>
              <p>
                Spawnly provides managed hosting services for Minecraft. You acknowledge and agree that:
              </p>
              <ul className="list-disc pl-5 space-y-1">
                <li>We utilize third-party infrastructure providers, primarily <strong>Hetzner Online GmbH</strong> (Compute) and <strong>Amazon Web Services</strong> (Storage).</li>
                <li>Your use of the service is subject to the acceptable use policies of our upstream providers.</li>
                <li>We reserve the right to modify, suspend, or discontinue the Service (or any part thereof) with or without notice for maintenance, security updates, or other operational reasons.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-3">3. Billing, Credits, and Payments</h2>
              <ul className="list-disc pl-5 space-y-2">
                <li>
                  <strong>Credit System:</strong> Services are purchased via a proprietary "Credit" system. Credits are a digital license to use our platform and have no monetary value outside of the Spawnly ecosystem.
                </li>
                <li>
                  <strong>Pay-As-You-Go:</strong> Usage is calculated and deducted from your balance in real-time (per minute) while server instances are in a "Running" state.
                </li>
                <li>
                  <strong>Negative Balance:</strong> We allow a grace period of 1 hour for negative balances. If your balance remains negative, your services will be suspended immediately.
                </li>
                <li>
                  <strong>Inactive Storage Fees:</strong> We reserve the right to charge a storage fee (deducted from Credits) for stopped servers that consume significant disk space for over 30 days.
                </li>
              </ul>
            </section>

            <section className="bg-red-50 dark:bg-red-900/20 p-4 rounded-lg border border-red-100 dark:border-red-900/30">
              <h2 className="text-xl font-bold text-red-800 dark:text-red-300 mb-3">4. Termination & Data Deletion</h2>
              <p className="text-red-700 dark:text-red-200 font-medium">
                We prioritize system health and resource availability.
              </p>
              <ul className="list-disc pl-5 mt-2 space-y-1 text-red-700 dark:text-red-200">
                <li>
                  <strong>Insufficient Funds:</strong> If your Credit balance is insufficient to cover active usage, your server will be automatically stopped.
                </li>
                <li>
                  <strong>Data Abandonment:</strong> If an account remains inactive (no login or active server) with a zero or negative balance for more than <strong>30 days</strong>, we reserve the right to permanently delete all associated server files, backups, and configurations to reclaim storage space. This action is irreversible.
                </li>
                <li>
                  <strong>Suspension for Cause:</strong> We may terminate your access immediately, without prior notice or liability, for any breach of these Terms, specifically the Acceptable Use Policy.
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-3">5. User Content & Licensing</h2>
              <p>
                You retain full ownership of the world files, configurations, and data you upload ("User Content"). 
                By uploading User Content, you grant Spawnly a non-exclusive, worldwide, royalty-free license to host, copy, back up, and display said content solely as necessary to provide the Service to you.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-3">6. Limitation of Liability</h2>
              <p className="uppercase font-semibold text-sm mb-2 text-gray-500">Read this section carefully.</p>
              <p>
                To the fullest extent permitted by applicable law, in no event will Spawnly, its affiliates, directors, or employees be liable to you for any lost profits, lost data, costs of procurement of substitute goods, or any indirect, consequential, exemplary, incidental, or punitive damages.
              </p>
              <p className="mt-2">
                Our liability for any claim arising out of these Terms or the Service is limited to the amount paid by you to Spawnly during the one (1) month period prior to the cause of action. 
                <strong>We are not responsible for data loss caused by corruption, hardware failure (Hetzner/AWS), or failed backups. You are responsible for maintaining your own local backups.</strong>
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-3">7. Indemnification</h2>
              <p>
                You agree to defend, indemnify, and hold us harmless from and against any loss, damage, liability, claim, or demand, including reasonable attorneys’ fees and expenses, made by any third party due to or arising out of: (1) your User Content; (2) your violation of these Terms; or (3) your violation of any rights of a third party, including intellectual property rights (e.g., hosting pirated content).
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-3">8. Governing Law & Dispute Resolution</h2>
              <p>
                These Terms are governed by the laws of Portugal. Any legal action of whatever nature brought by either you or us shall be commenced or prosecuted in the courts of Portugal, and you hereby consent to active jurisdiction.
              </p>
              <p className="mt-2 text-sm text-gray-500">
                <strong>European ODR:</strong> If you reside in the EU, the European Commission provides an online dispute resolution platform: <a href="https://ec.europa.eu/consumers/odr" className="underline">https://ec.europa.eu/consumers/odr</a>.
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