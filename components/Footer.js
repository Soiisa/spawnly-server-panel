// components/Footer.js
export default function Footer() {
  return (
    <footer className="bg-indigo-900 text-neutral-50 py-6 mt-20">
      <div className="container mx-auto px-6 flex flex-col md:flex-row justify-between items-center">
        <p className="text-sm">&copy; {new Date().getFullYear()} Spawnly. All rights reserved.</p>
        <div className="space-x-4 mt-2 md:mt-0">
          <a href="#" className="hover:text-teal-400">Terms</a>
          <a href="#" className="hover:text-teal-400">Privacy</a>
          <a href="#" className="hover:text-teal-400">Support</a>
        </div>
      </div>
    </footer>
  );
}
