// pages/imprint.js
import Head from "next/head";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';

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
            
            {/* Service Provider Section - ENI COMPLIANT */}
            <section>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Service Provider</h2>
              <p>
                <strong>Spawnly</strong><br />
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  (Operated by Entrepreneur in Individual Name / Empresário em Nome Individual)
                </span>
              </p>
              <p className="mt-2">
                <strong>Legal Representative:</strong><br />
                [YOUR FULL LEGAL NAME]<br /> {/* e.g., João Silva */}
              </p>
              <p className="mt-2">
                <strong>Address:</strong><br />
                [YOUR P.O. BOX OR VIRTUAL OFFICE ADDRESS]<br />
                [POSTAL CODE] [CITY]<br />
                Portugal
              </p>
            </section>

            {/* Contact Section */}
            <section>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Contact</h2>
              <p>
                <strong>Email:</strong> <a href="mailto:support@spawnly.net" className="text-indigo-600 dark:text-indigo-400 hover:underline">support@spawnly.net</a><br />
                <strong>Web:</strong> https://spawnly.net
              </p>
            </section>

            {/* Legal / Tax Information */}
            <section>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Legal Information</h2>
              <p>
                <strong>VAT ID (NIF):</strong> [YOUR PORTUGUESE NIF]<br />
                <strong>Economic Activity (CAE):</strong> 63110 - Data processing, hosting and related activities<br />
                <strong>Registered Authority:</strong> Autoridade Tributária e Aduaneira (Portugal)
              </p>
            </section>

            {/* Dispute Resolution - UPDATED 2026 COMPLIANT */}
            <section>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Consumer Dispute Resolution</h2>
              <p className="mb-4">
                <strong>Electronic Complaints Book (Livro de Reclamações):</strong><br />
                Consumers can submit complaints via the official Portuguese platform: <a href="https://www.livroreclamacoes.pt" target="_blank" rel="noopener noreferrer" className="text-indigo-600 dark:text-indigo-400 hover:underline">www.livroreclamacoes.pt</a>.
              </p>
              <p>
                <strong>Alternative Dispute Resolution (RAL):</strong><br />
                In the event of a consumer dispute, the consumer may have recourse to an Alternative Dispute Resolution Entity. The list of Alternative Dispute Resolution entities is available at: <a href="https://consumer-redress.ec.europa.eu/dispute-resolution-bodies" target="_blank" rel="noopener noreferrer" className="text-indigo-600 dark:text-indigo-400 hover:underline">European Consumer Redress</a> or via the Portuguese Consumer Portal at <a href="https://www.consumidor.gov.pt" target="_blank" rel="noopener noreferrer" className="text-indigo-600 dark:text-indigo-400 hover:underline">www.consumidor.gov.pt</a>.
              </p>
            </section>

            {/* Liability Disclaimer */}
            <section>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Liability Disclaimer</h2>
              <p>
                <strong>Content Liability:</strong> As an individual service provider, we are responsible for our own content on these pages in accordance with general laws. However, we are not obligated to monitor transmitted or stored third-party information or to investigate circumstances that indicate illegal activity.
              </p>
              <p className="mt-2">
                <strong>External Links:</strong> Our service contains links to external third-party websites. We have no influence on the contents of those websites, therefore we cannot assume any liability for such external content.
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