import { useRouter } from 'next/router';
import Link from 'next/link';
import { ChatBubbleLeftRightIcon } from '@heroicons/react/24/outline';
import { useTranslation } from 'next-i18next';

export default function SupportWidget() {
  const router = useRouter();
  const { t } = useTranslation('common');

  // Hide the widget if:
  // 1. We are already on the support page
  // 2. We are in the Admin panel
  // 3. We are on the login/register pages
  const isHidden = 
    router.pathname.startsWith('/support') || 
    router.pathname.startsWith('/admin') ||
    router.pathname === '/login' ||
    router.pathname === '/register';

  if (isHidden) return null;

  return (
    <Link
      href="/support"
      className="fixed bottom-10 right-6 z-[60] flex items-center justify-center w-14 h-14 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full shadow-lg hover:shadow-indigo-500/30 transition-all hover:scale-110 active:scale-95 group"
      aria-label={t('support.contact', { defaultValue: 'Contact Support' })}
    >
      {/* Icon */}
      <ChatBubbleLeftRightIcon className="w-7 h-7" />
      
      {/* Tooltip Label (Appears on Hover) */}
      <span className="absolute right-full mr-4 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-bold rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none shadow-xl transform translate-x-2 group-hover:translate-x-0">
        {t('support.tooltip', { defaultValue: 'Support & Help' })}
        {/* Tooltip Arrow */}
        <span className="absolute top-1/2 -right-1 -mt-1 border-4 border-transparent border-l-slate-900 dark:border-l-white"></span>
      </span>
    </Link>
  );
}