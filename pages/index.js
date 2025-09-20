// pages/index.js
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col bg-neutral-50 text-neutral-900">
      <Navbar />
      <main className="flex-grow container mx-auto px-6 flex flex-col items-center justify-center text-center py-20">
        {/* Hero Section */}
        <h1 className="text-5xl font-bold mb-6 text-indigo-900">Spawn a server in seconds</h1>
        <p className="text-xl mb-8 text-neutral-700 max-w-xl">
          Pay only for the hours you use. RAM-based pricing. Credits system. Launch Minecraft or other game servers instantly, fully managed.
        </p>
        <div className="flex space-x-4">
          <a href="/register" className="bg-teal-500 hover:bg-teal-400 text-white font-semibold py-3 px-8 rounded-lg shadow-lg transition">
            Get Started
          </a>
          <a href="/pricing" className="bg-indigo-900 hover:bg-indigo-800 text-white font-semibold py-3 px-8 rounded-lg shadow-lg transition">
            View Pricing
          </a>
        </div>

        {/* Features Section */}
        <div className="mt-20 grid grid-cols-1 md:grid-cols-3 gap-10">
          <div className="bg-white rounded-xl shadow p-6">
            <h3 className="text-xl font-semibold mb-2 text-indigo-900">Instant Deployment</h3>
            <p className="text-neutral-700">Spawn your server in under a minute, fully configured and ready to play.</p>
          </div>
          <div className="bg-white rounded-xl shadow p-6">
            <h3 className="text-xl font-semibold mb-2 text-indigo-900">RAM-Based Pricing</h3>
            <p className="text-neutral-700">Choose the RAM you need. More RAM = more power, billed per hour.</p>
          </div>
          <div className="bg-white rounded-xl shadow p-6">
            <h3 className="text-xl font-semibold mb-2 text-indigo-900">Persistent Storage</h3>
            <p className="text-neutral-700">Your world files are saved securely and ready when you start the server again.</p>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
