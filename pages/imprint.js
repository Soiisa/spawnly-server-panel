// pages/imprint.js
import Head from "next/head";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';

export default function Imprint() {
  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-slate-950 font-sans text-slate-900 dark:text-slate-100 transition-colors duration-300">
      <Head>
        <title>Imprint (Aviso Legal) | Spawnly</title>
      </Head>
      <Navbar />
      <main className="flex-grow container mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="max-w-4xl mx-auto bg-white dark:bg-slate-800 p-8 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700">
          
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">Imprint (Aviso Legal)</h1>

          <div className="prose prose-slate dark:prose-invert max-w-none text-gray-700 dark:text-gray-300 space-y-6">
            
            {/* Service Provider Section */}
            <section>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Service Provider</h2>
              <p>
                <strong>Spawnly</strong><br />
                Rodrigo Santos Sousa (Empresário em Nome Individual)
              </p>
              <p className="mt-2">
                <strong>Address:</strong><br />
                Rua Ponte de Anta Nº 264 3º Esq<br />
                4500-088 Espinho<br />
                Portugal
              </p>
            </section>

            {/* Contact Section */}
            <section>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Contact</h2>
              <p>
                <strong>Email:</strong> <a href="mailto:support@spawnly.net" className="text-indigo-600 dark:text-indigo-400 hover:underline">support@spawnly.net</a><br />
                <strong>Web:</strong> <a href="https://spawnly.net" className="text-indigo-600 dark:text-indigo-400 hover:underline">https://spawnly.net</a>
              </p>
            </section>

            {/* Legal / Tax Information */}
            <section>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Legal Information</h2>
              <p>
                <strong>VAT ID (NIF):</strong> 259112500
              </p>
              <p className="text-sm mt-2">
                Regime de Isenção de IVA ao abrigo do Artigo 53.º do CIVA.
              </p>
            </section>

            {/* Dispute Resolution - Mandatory for EU/PT B2C */}
            <section>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Consumer Dispute Resolution</h2>
              <p className="mb-4">
                <strong>Electronic Complaints Book (Livro de Reclamações Eletrónico):</strong><br />
                Consumers can submit complaints via the official Portuguese platform: <a href="https://www.livroreclamacoes.pt" target="_blank" rel="noopener noreferrer" className="text-indigo-600 dark:text-indigo-400 hover:underline">www.livroreclamacoes.pt</a>.
              </p>
              <p className="mb-4">
                <strong>Alternative Dispute Resolution (RAL):</strong><br />
                In case of dispute, the consumer may resort to an Alternative Dispute Resolution Entity: 
                CICAP - Centro de Informação de Consumo e Arbitragem do Porto (<a href="https://www.cicap.pt" target="_blank" rel="noopener noreferrer" className="text-indigo-600 dark:text-indigo-400 hover:underline">www.cicap.pt</a>).
              </p>
              <p>
                <strong>EU Online Dispute Resolution (ODR):</strong><br />
                The European Commission provides a platform for online dispute resolution available at: <a href="https://ec.europa.eu/consumers/odr" target="_blank" rel="noopener noreferrer" className="text-indigo-600 dark:text-indigo-400 hover:underline">https://ec.europa.eu/consumers/odr</a>.
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