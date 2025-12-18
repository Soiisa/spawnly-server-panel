// pages/imprint.js
import Head from "next/head";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";

export default function Imprint() {
  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-slate-950 font-sans text-slate-900 dark:text-slate-100 transition-colors duration-300">
      <Head>
        <title>Imprint (Legal Notice) | Spawnly</title>
      </Head>

      <Navbar />

      <main className="flex-grow container mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="max-w-4xl mx-auto bg-white dark:bg-slate-800 p-8 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700">
          
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">Imprint (Aviso Legal)</h1>

          <div className="prose prose-slate dark:prose-invert max-w-none text-gray-700 dark:text-gray-300 space-y-6">
            
            <section>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Service Provider</h2>
              <p>
                <strong>Spawnly</strong><br />
                [YOUR LEGAL COMPANY NAME, e.g., Spawnly Unipessoal Lda.]<br />
                [YOUR STREET ADDRESS]<br />
                [YOUR POSTAL CODE] [YOUR CITY]<br />
                Portugal
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Contact Information</h2>
              <p>
                <strong>Email:</strong> <a href="mailto:support@spawnly.net" className="text-indigo-600 dark:text-indigo-400 hover:underline">support@spawnly.net</a><br />
                <strong>Phone:</strong> [OPTIONAL: +351 ...]
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Legal Details</h2>
              <p>
                <strong>Managing Director:</strong> [YOUR NAME]<br />
                <strong>VAT ID (NIF):</strong> [YOUR PORTUGUESE NIF]<br />
                <strong>Dispute Resolution:</strong> The European Commission provides a platform for online dispute resolution (OS): <a href="https://ec.europa.eu/consumers/odr" target="_blank" rel="noopener noreferrer" className="text-indigo-600 dark:text-indigo-400 hover:underline">https://ec.europa.eu/consumers/odr</a>. We are not obligated to participate in dispute settlement proceedings before a consumer arbitration board.
              </p>
            </section>

            <section className="text-sm text-gray-500 border-t pt-4 border-gray-200 dark:border-slate-700 mt-8">
              <p>Information according to § 5 TMG (German Telemedia Act) / Portuguese Decree-Law no. 7/2004.</p>
            </section>

          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}