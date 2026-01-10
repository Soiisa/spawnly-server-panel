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
            
            <section>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Service Provider</h2>
              <p>
                <strong>Spawnly</strong><br />
                [YOUR LEGAL ENTITY NAME, e.g., Spawnly Unipessoal Lda.]<br />
                [STREET ADDRESS]<br />
                [POSTAL CODE] [CITY]<br />
                Portugal
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Contact</h2>
              <p>
                <strong>Email:</strong> <a href="mailto:support@spawnly.net" className="text-indigo-600 dark:text-indigo-400 hover:underline">support@spawnly.net</a><br />
                <strong>Web:</strong> https://spawnly.net
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Legal Information</h2>
              <p>
                <strong>Managing Director / CEO:</strong> [YOUR NAME]<br />
                <strong>VAT ID (NIF):</strong> [YOUR PORTUGUESE NIF]<br />
                <strong>Registered at:</strong> [Registry Court/Conservatória if applicable]
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">EU Dispute Resolution</h2>
              <p>
                The European Commission provides a platform for Online Dispute Resolution (ODR): <a href="https://ec.europa.eu/consumers/odr" target="_blank" rel="noopener noreferrer" className="text-indigo-600 dark:text-indigo-400 hover:underline">https://ec.europa.eu/consumers/odr</a>.<br/>
                We are neither willing nor obligated to participate in dispute settlement proceedings before a consumer arbitration board.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Liability Disclaimer</h2>
              <p>
                <strong>Content Liability:</strong> As a service provider, we are responsible for our own content on these pages in accordance with general laws. However, we are not obligated to monitor transmitted or stored third-party information or to investigate circumstances that indicate illegal activity.
              </p>
              <p className="mt-2">
                <strong>Link Liability:</strong> Our offer contains links to external third-party websites. We have no influence on the contents of those websites, therefore we cannot assume any liability for such external content. The respective provider or operator of the pages is always responsible for the content of the linked pages.
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