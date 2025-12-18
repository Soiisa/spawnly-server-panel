// pages/refund-policy.js
import Head from "next/head";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";

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
          <p className="text-gray-500 dark:text-gray-400 mb-8">Last Updated: {new Date().toLocaleDateString()}</p>

          <div className="prose prose-slate dark:prose-invert max-w-none text-gray-700 dark:text-gray-300 space-y-6">
            
            <section>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-3">1. General Policy</h2>
              <p>
                Due to the nature of our service (instant provisioning of digital server resources), <strong>all credit purchases are generally final and non-refundable</strong>.
                By purchasing credits, you acknowledge that the service execution begins immediately, and you waive your right of withdrawal once the credits have been added to your account balance.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-3">2. Exceptions</h2>
              <p>We may consider refund requests under the following specific circumstances:</p>
              <ul className="list-disc pl-5 space-y-2">
                <li>
                  <strong>Technical Failure:</strong> If you were charged but credits were not applied to your account due to a system error.
                </li>
                <li>
                  <strong>Duplicate Charge:</strong> If you were accidentally charged twice for the same transaction within a short timeframe.
                </li>
              </ul>
              <p className="mt-2">
                Subjective dissatisfaction (e.g., "I don't need the server anymore") is not grounds for a refund.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-3">3. EU Right of Withdrawal</h2>
              <p>
                If you are a consumer in the European Union, you typically have a right of withdrawal for 14 days. However, by purchasing digital credits which are immediately available for use, you expressly agree that the performance of the contract begins immediately and you acknowledge that you lose your right of withdrawal.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-3">4. Requesting a Refund</h2>
              <p>
                If you believe you qualify for an exception, please contact us at <a href="mailto:support@spawnly.net" className="text-indigo-600 dark:text-indigo-400 hover:underline">support@spawnly.net</a> within 7 days of the transaction. Please include:
              </p>
              <ul className="list-disc pl-5">
                <li>Transaction ID / Date</li>
                <li>Account Email Address</li>
                <li>Reason for the request</li>
              </ul>
            </section>

          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}