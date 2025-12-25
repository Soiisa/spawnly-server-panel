// components/Footer.js
import Link from "next/link";
import { useTranslation } from "next-i18next"; // <--- IMPORTED

export default function Footer() {
  const { t } = useTranslation('common'); // <--- INITIALIZED

  return (
    <footer className="bg-indigo-900 text-neutral-50 py-4 fixed bottom-0 left-0 w-full z-50 border-t border-indigo-800 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]">
      <div className="container mx-auto px-6">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
          
          {/* Copyright */}
          <div className="text-sm opacity-80">
            &copy; {new Date().getFullYear()} {t('brand')}. {t('footer.rights')} {/* <--- TRANSLATED */}
          </div>

          {/* Legal Navigation */}
          <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm font-medium">
            <Link href="/imprint" className="hover:text-teal-400 transition-colors">
              {t('footer.imprint')}
            </Link>
            <Link href="/terms" className="hover:text-teal-400 transition-colors">
              {t('footer.terms')}
            </Link>
            <Link href="/privacy" className="hover:text-teal-400 transition-colors">
              {t('footer.privacy')}
            </Link>
            <Link href="/aup" className="hover:text-teal-400 transition-colors">
              {t('footer.aup')}
            </Link>
            <Link href="/refund-policy" className="hover:text-teal-400 transition-colors">
              {t('footer.refunds')}
            </Link>
            <a href="mailto:support@spawnly.net" className="hover:text-teal-400 transition-colors">
              {t('footer.support')}
            </a>
          </div>

        </div>
      </div>
    </footer>
  );
}