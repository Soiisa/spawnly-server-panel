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
          <p className="text-gray-500 dark:text-gray-400 mb-8">Effective Date: July 9, 2026</p>

          <div className="prose prose-slate dark:prose-invert max-w-none text-gray-700 dark:text-gray-300 space-y-6">
            
            <section className="bg-yellow-50 dark:bg-yellow-900/20 p-4 rounded-lg border border-yellow-100 dark:border-yellow-900/30">
              <h2 className="text-lg font-bold text-yellow-800 dark:text-yellow-200 mb-2">Important Notice Regarding Digital Goods</h2>
              <p className="text-yellow-700 dark:text-yellow-300 text-sm">
                Spawnly "Credits" and Server Hosting services are digital goods that are delivered and consumed immediately upon purchase or provision.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-3">1. Waiver of Right of Withdrawal (EU Consumers)</h2>
              <p>
                <strong>Vital Information for EU Customers:</strong>
              </p>
              <p className="mt-2">
                Spawnly Credits and Subscriptions are digital content that is not supplied on a tangible medium. By purchasing Credits or enabling Automatic Refills, you expressly:
              </p>
              <ul className="list-disc pl-5 space-y-1 mt-2">
                <li>Consent to the immediate performance of the contract (instant delivery of credits).</li>
                <li>Acknowledge that you lose your right of withdrawal (the "14-day cooling-off period") once the download or supply of digital content has begun.</li>
              </ul>
              <p className="mt-2">
                Once credits are added to your account balance (manually or via auto-refill), the service is deemed fully delivered, and the purchase becomes final and non-refundable.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-3">2. Refund Eligibility & Rules</h2>
              <p>While generally non-refundable, we enforce the following specific rules regarding our billing systems:</p>
              
              <ul className="list-disc pl-5 space-y-2 mt-4">
                <li>
                  <strong>Automatic Credit Refills (Subscriptions):</strong> If you have enabled automatic credit refills, it is solely your responsibility to disable the subscription before the next trigger occurs. We will <strong>not</strong> refund auto-refills that have successfully processed because you "forgot" to turn them off.
                </li>
                <li>
                  <strong>Monthly Server Deletions:</strong> Monthly servers are billed a flat fee in Credits upfront for 30 days of uptime. If you choose to completely delete or cancel a monthly server before the 30-day cycle concludes, you will <strong>not</strong> receive a pro-rated refund of Credits for the unused time.
                </li>
                <li>
                  <strong>Server Downgrades (Proration):</strong> If you choose to downgrade the resources (RAM) of an active Monthly Server, the system will calculate the pro-rated difference and return the remaining value as <strong>Spawnly Credits</strong> to your virtual account balance. These returned Credits cannot be withdrawn, cashed out, or refunded to your original payment method (bank/credit card).
                </li>
              </ul>

              <p className="mt-4 font-semibold">We may evaluate refunds (back to original payment method) strictly under these conditions:</p>
              <ul className="list-disc pl-5 space-y-2">
                <li><strong>Billing Errors:</strong> Double-charges or system errors where you were charged via Stripe but did not receive Credits.</li>
                <li><strong>Service Failure:</strong> If we are completely unable to provision services for your account due to a technical fault on our end for a prolonged period (72+ hours).</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-3">3. Chargebacks & Disputes</h2>
              <p>
                Initiating a payment dispute or chargeback with your bank, PayPal, or Stripe without contacting support first is a direct violation of these terms. 
                <strong>We reserve the right to permanently suspend accounts and delete all associated server data for users that initiate unjustified chargebacks.</strong>
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