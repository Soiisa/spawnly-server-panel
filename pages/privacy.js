// pages/privacy.js
import Head from "next/head";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import Link from "next/link"; // Added Link import for consistency

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
                Welcome to <strong>Spawnly</strong> ("we," "our," or "us"). We are committed to protecting your personal information and your right to privacy. 
                This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our website and hosting services.
              </p>
              <p>
                By accessing or using our services, you consent to the data practices described in this policy. If you do not agree with the terms of this privacy policy, please do not use our services.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-3">2. Information We Collect</h2>
              <ul className="list-disc pl-5 space-y-2">
                <li>
                  <strong>Account Information:</strong> When you register, we collect your email address and authentication credentials. If you sign up via Google, we receive your email and basic profile info from them.
                </li>
                <li>
                  <strong>Server Data:</strong> We host the files you upload or generate (e.g., Minecraft world files, logs, properties). 
                </li>
                <li>
                  <strong>Usage Data:</strong> We monitor server runtime (start/stop times) and resource usage (CPU/RAM) to calculate billing credits accurately.
                </li>
                <li>
                  <strong>Payment Information:</strong> We do not store full credit card numbers. Payment data is processed securely by our payment provider (Stripe).
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-3">3. How We Use Your Data</h2>
              <p>We use your information to:</p>
              <ul className="list-disc pl-5 space-y-2">
                <li>Provision and manage your Virtual Private Servers (VPS).</li>
                <li>Process payments and manage your credit balance ("Credits").</li>
                <li>Authenticate your identity and secure your account.</li>
                <li>Send administrative information, such as billing summaries or critical service updates.</li>
                <li>Comply with legal obligations (e.g., tax laws).</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-3">4. Third-Party Service Providers (Sub-processors)</h2>
              <p>
                To provide our services, we trust reputable third-party providers. We have Data Processing Agreements (DPA) in place where necessary to ensure GDPR compliance.
              </p>
              
              <div className="mt-4 overflow-x-auto rounded-lg border border-gray-200 dark:border-slate-700">
                <table className="min-w-full text-sm text-left">
                  <thead className="bg-gray-100 dark:bg-slate-900 text-gray-900 dark:text-white font-semibold">
                    <tr>
                      <th className="px-4 py-3">Service</th>
                      <th className="px-4 py-3">Purpose</th>
                      <th className="px-4 py-3">Location</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-slate-700 bg-white dark:bg-slate-800">
                    <tr>
                      <td className="px-4 py-2 font-medium text-gray-900 dark:text-white">Hetzner Online GmbH</td>
                      <td className="px-4 py-2">Server Hosting (VPS) & Object Storage</td>
                      <td className="px-4 py-2">European Union (Germany/Finland)</td>
                    </tr>
                    <tr>
                      <td className="px-4 py-2 font-medium text-gray-900 dark:text-white">Supabase Inc.</td>
                      <td className="px-4 py-2">Database & Authentication</td>
                      <td className="px-4 py-2">Global (AWS Infrastructure)</td>
                    </tr>
                    <tr>
                      <td className="px-4 py-2 font-medium text-gray-900 dark:text-white">Stripe</td>
                      <td className="px-4 py-2">Payment Processing</td>
                      <td className="px-4 py-2">Global (USA/EU)</td>
                    </tr>
                    <tr>
                      <td className="px-4 py-2 font-medium text-gray-900 dark:text-white">Google</td>
                      <td className="px-4 py-2">OAuth (Social Login)</td>
                      <td className="px-4 py-2">Global</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>

            <section>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-3">5. Data Retention</h2>
              <p>
                We retain your personal information only for as long as necessary. 
              </p>
              <ul className="list-disc pl-5 space-y-2">
                <li><strong>Account Data:</strong> Retained as long as your account is active.</li>
                <li><strong>Server Files:</strong> Retained while your server exists. If you delete a server, files are permanently removed from our storage provider.</li>
                <li><strong>Inactive Accounts:</strong> We reserve the right to delete accounts and associated data after an extended period of inactivity (e.g., 12 months) with no credit balance.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-3">6. Your Rights (GDPR)</h2>
              <p>If you are located in the European Economic Area (EEA), you have the following rights:</p>
              <ul className="list-disc pl-5 space-y-2">
                <li><strong>Right to Access:</strong> Request a copy of the data we hold about you.</li>
                <li><strong>Right to Rectification:</strong> Correct inaccurate data (e.g., changing your email in the dashboard).</li>
                <li><strong>Right to Deletion:</strong> Request that we delete your account and all associated data ("Right to be Forgotten").</li>
                <li><strong>Right to Portability:</strong> Request your data in a structured, commonly used format.</li>
              </ul>
              <p className="mt-2">
                To exercise these rights, please contact us at the email provided below.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-3">7. Cookies & Local Storage</h2>
              <p>
                We use "Local Storage" and necessary cookies to maintain your login session and save interface preferences (such as Dark Mode). We do not use third-party tracking cookies for advertising purposes.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-3">8. Contact Us</h2>
              <p>
                If you have questions or comments about this policy, you may email us at:
              </p>
              <div className="mt-4 p-4 bg-gray-50 dark:bg-slate-700/50 rounded-lg border border-gray-200 dark:border-slate-600 inline-block">
                <p className="font-medium text-indigo-600 dark:text-indigo-400">support@spawnly.net</p>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  Spawnly / [Your Legal Entity Name] <br />
                  [Your Physical Address, Portugal]
                </p>
              </div>
            </section>

          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}