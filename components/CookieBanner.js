// components/CookieBanner.js
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useTranslation, Trans } from 'next-i18next'; // <--- IMPORTED

export default function CookieBanner() {
  const { t } = useTranslation('common'); // <--- INITIALIZED
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    // Check if user has already consented
    const consent = localStorage.getItem('cookie_consent');
    if (!consent) {
      setShowBanner(true);
    }
  }, []);

  const acceptCookies = () => {
    // Save consent to local storage so the banner doesn't show again
    localStorage.setItem('cookie_consent', 'true');
    setShowBanner(false);
  };

  if (!showBanner) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 p-4 bg-white dark:bg-slate-900 border-t border-gray-200 dark:border-slate-800 shadow-2xl animate-slide-up">
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
        
        <div className="text-sm text-gray-600 dark:text-gray-300 text-center sm:text-left">
          <p>
            <Trans
              i18nKey="cookie.text"
              components={[
                <span key="0" />,
                <Link href="/privacy" key="1" className="text-teal-600 dark:text-teal-400 hover:underline font-medium" />,
                <span key="2" />,
                <Link href="/terms" key="3" className="text-teal-600 dark:text-teal-400 hover:underline font-medium" />
              ]}
            />
          </p>
        </div>

        <div className="flex gap-3">
          <button
            onClick={acceptCookies}
            className="whitespace-nowrap px-6 py-2 bg-teal-500 hover:bg-teal-400 text-white text-sm font-bold rounded-lg transition-colors shadow-sm"
          >
            {t('cookie.accept')} {/* <--- TRANSLATED */}
          </button>
        </div>

      </div>
    </div>
  );
}