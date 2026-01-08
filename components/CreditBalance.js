// components/CreditBalance.js
import Link from 'next/link';
import { WalletIcon, PlusIcon } from '@heroicons/react/24/outline';
import { useTranslation } from 'next-i18next'; 

export default function CreditBalance({ credits = 0, isLoading = false }) {
  const { t } = useTranslation('common');

  return (
    <Link href="/credits" className="group tour-credits">
      <div className="flex items-center gap-3 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-600 hover:ring-2 hover:ring-indigo-100 dark:hover:ring-indigo-900/50 rounded-full pl-4 pr-2 py-1.5 transition-all shadow-sm">
        
        {/* Label & Amount */}
        <div className="flex flex-col items-end mr-1">
          <p className="text-[10px] font-bold text-gray-400 dark:text-gray-400 uppercase tracking-wider leading-none mb-0.5">
            {t('wallet.balance')}
          </p>
          {isLoading ? (
            <div className="h-4 w-12 bg-gray-200 dark:bg-slate-700 rounded animate-pulse" />
          ) : (
            <p className="text-sm font-bold text-gray-900 dark:text-gray-100 group-hover:text-indigo-600 transition-colors leading-none">
              {credits.toFixed(2)}
            </p>
          )}
        </div>

        {/* Icon / Add Button */}
        <div className="w-8 h-8 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-all">
          <WalletIcon className="w-4 h-4" />
        </div>
      </div>
    </Link>
  );
}