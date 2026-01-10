// pages/refund-policy.js
import Head from "next/head";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';

export default function RefundPolicy() {
  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-slate-950 font-sans text-slate-900 dark:text-slate-100 transition-colors duration-300">
      <Head>
        <title>Refund Policy | Spawnly</title>
      </Head>
      <Navbar />
      <main className="flex-grow container mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="max-w-4xl mx-auto bg-white dark:bg-slate-800 p-8 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700">
          
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">Refund Policy</h1>
          <p className="text-gray-500 dark:text-gray-400 mb-8">Effective Date: {new Date().toLocaleDateString()}</p>

          <div className="prose prose-slate dark:prose-invert max-w-none text-gray-700 dark:text-gray-300 space-y-6">
            
            <section className="bg-yellow-50 dark:bg-yellow-900/20 p-4 rounded-lg border border-yellow-100 dark:border-yellow-900/30">
              <h2 className="text-lg font-bold text-yellow-800 dark:text-yellow-200 mb-2">Important Notice Regarding Digital Goods</h2>
              <p className="text-yellow-700 dark:text-yellow-300 text-sm">
                Spawnly "Credits" are digital goods that are delivered and consumed immediately upon purchase.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-3">1. Waiver of Right of Withdrawal (EU Consumers)</h2>
              <p>
                Under EU Consumer Law (Directive 2011/83/EU), consumers typically have a 14-day right of withdrawal. 
                <strong>However, by purchasing Credits on Spawnly, you expressly consent to the immediate performance of the contract and acknowledge that you thereby lose your right of withdrawal.</strong>
              </p>
              <p>
                Once credits are added to your account balance, the service is deemed fully delivered, and the purchase becomes final and non-refundable.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-3">2. Refund Eligibility</h2>
              <p>While generally non-refundable, we may evaluate refunds on a case-by-case basis strictly under these conditions:</p>
              <ul className="list-disc pl-5 space-y-2">
                <li>
                  <strong>Billing Errors:</strong> Double-charges or system errors where you were charged but did not receive Credits.
                </li>
                <li>
                  <strong>Service Failure:</strong> If we are completely unable to provision services for your account due to a technical fault on our end for a prolonged period (72+ hours).
                </li>
              </ul>
              <p className="mt-2">
                We do <strong>not</strong> provide refunds for:
              </p>
              <ul className="list-disc pl-5">
                <li>User error (e.g., deleting your own server or files).</li>
                <li>Performance issues caused by user-installed mods/plugins.</li>
                <li>Account bans due to AUP violations.</li>
                <li>Unused credits left in your account.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-3">3. Chargebacks & Disputes</h2>
              <p>
                Initiating a payment dispute or chargeback with your bank or Stripe without contacting support first is a violation of these terms. 
                <strong>We reserve the right to permanently suspend accounts that initiate unjustified chargebacks.</strong>
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-3">4. Contact Us</h2>
              <p>
                If you believe you have been charged in error, contact us immediately at <a href="mailto:support@spawnly.net" className="text-indigo-600 dark:text-indigo-400 hover:underline">support@spawnly.net</a> with your transaction ID.
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