import { useState, useEffect } from "react";
import React from 'react';
import { supabase } from "../lib/supabaseClient";
import { useRouter } from "next/router";
import Header from "../components/ServersHeader";
import Footer from "../components/ServersFooter";
import bonusesConfig from '../lib/stripeBonuses.json';
import { 
  CurrencyDollarIcon, 
  ClockIcon, 
  ServerIcon, 
  ReceiptRefundIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  XMarkIcon,
  SparklesIcon
} from '@heroicons/react/24/outline';
import { useTranslation } from "next-i18next"; 
import { serverSideTranslations } from 'next-i18next/serverSideTranslations'; 

export default function CreditsPage() {
  const router = useRouter();
  const { t } = useTranslation('credits'); 
  
  // Data State
  const [user, setUser] = useState(null);
  const [credits, setCredits] = useState(0);
  const [transactions, setTransactions] = useState([]);
  
  // Loading State
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState(null);

  // Payment UI State
  const [isBuyModalOpen, setIsBuyModalOpen] = useState(false);
  const [depositAmount, setDepositAmount] = useState(10); // Euros
  const [loadingPayment, setLoadingPayment] = useState(false);

  // Bonus Calculation Logic
  const getBonusInfo = (euro) => {
    return bonusesConfig.bonuses.find(b => euro >= b.min_euro);
  };

  const calculateTotalCredits = (euro) => {
    const base = euro * 100;
    const bonusTier = getBonusInfo(euro);
    const bonus = bonusTier ? Math.floor(base * (bonusTier.bonus_percent / 100)) : 0;
    return { 
      total: base + bonus, 
      bonus, 
      percent: bonusTier ? bonusTier.bonus_percent : 0 
    };
  };

  const { total: totalGet, bonus: bonusGet, percent: activePercent } = calculateTotalCredits(depositAmount);

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push("/login");
        return;
      }

      setUser(session.user);

      if (router.query.payment_success) {
        router.replace('/credits', undefined, { shallow: true });
      }

      try {
        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("credits")
          .eq("id", session.user.id)
          .single();
        
        if (profileError) throw profileError;
        setCredits(profile?.credits || 0);

        const { data: txs, error: txError } = await supabase
          .from("credit_transactions")
          .select("*")
          .eq("user_id", session.user.id)
          .order("created_at", { ascending: false })
          .limit(100);

        if (txError) throw txError;
        setTransactions(txs || []);

      } catch (err) {
        console.error("Error loading credits data:", err);
        setError(err.message);
      } finally {
        setLoadingData(false);
      }
    };

    if (router.isReady) {
        init();
    }
  }, [router, router.isReady]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  const handleCheckout = async () => {
    if (depositAmount < 3 || depositAmount > 50) return;
    
    setLoadingPayment(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch('/api/stripe/checkout_sessions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ amount: depositAmount }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Failed to initiate payment");
      }

      const { url } = await response.json();
      if (url) {
        window.location.href = url;
      } else {
        throw new Error("No payment URL returned from server.");
      }

    } catch (err) {
      console.error("Payment Error:", err);
      alert("Payment failed: " + err.message);
      setLoadingPayment(false);
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString(router.locale || "en-US", {
      month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"
    });
  };

  const parseUsage = (description) => {
    if (!description) return {};
    const serverMatch = description.match(/server\s+([a-f0-9-]{36}|[a-f0-9-]{8})/i);
    const secondsMatch = description.match(/(\d+)\s*seconds/i);
    return {
      serverId: serverMatch ? serverMatch[1] : null,
      seconds: secondsMatch ? parseInt(secondsMatch[1], 10) : null,
    };
  };

  const fmtSeconds = (s) => {
    if (s == null) return null;
    const hrs = Math.floor(s / 3600);
    const mins = Math.floor((s % 3600) / 60);
    if (hrs > 0) return `${hrs}${t('units.h')} ${mins}${t('units.m')}`;
    return `${mins}${t('units.m')} ${s % 60}${t('units.s')}`;
  };

  const groupedTransactions = () => {
    const groups = [];
    const sessionMap = new Map();
    const singles = [];

    transactions.forEach((tx) => {
      if (tx.session_id && tx.type === 'usage') {
        if (!sessionMap.has(tx.session_id)) {
          sessionMap.set(tx.session_id, []);
        }
        sessionMap.get(tx.session_id).push(tx);
      } else {
        singles.push(tx);
      }
    });

    sessionMap.forEach((txs, sessionId) => {
      txs.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
      const totalAmount = txs.reduce((sum, t) => sum + t.amount, 0);
      const totalSeconds = txs.reduce((sum, t) => sum + (parseUsage(t.description).seconds || 0), 0);
      const { serverId } = parseUsage(txs[0].description);
      groups.push({
        id: sessionId, isSession: true, date: txs[txs.length - 1].created_at,
        startDate: txs[0].created_at, endDate: txs[txs.length - 1].created_at,
        amount: totalAmount, details: txs, meta: { serverId, totalSeconds }
      });
    });

    singles.forEach(tx => {
      const { serverId, seconds } = parseUsage(tx.description);
      groups.push({
        id: tx.id, isSession: false, date: tx.created_at, amount: tx.amount,
        type: tx.type, description: tx.description, meta: { serverId, seconds }
      });
    });

    return groups.sort((a, b) => new Date(b.date) - new Date(a.date));
  };

  const HistoryItem = ({ item }) => {
    const [isOpen, setIsOpen] = useState(false);
    const isNegative = item.amount < 0;
    if (item.isSession) {
      return (
        <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl overflow-hidden hover:shadow-sm transition-shadow">
          <div onClick={() => setIsOpen(!isOpen)} className="flex items-center justify-between p-4 cursor-pointer bg-white dark:bg-slate-800 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors">
            <div className="flex items-center gap-4">
              <div className="p-2 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-lg">
                <ServerIcon className="w-6 h-6" />
              </div>
              <div>
                <h4 className="font-semibold text-gray-900 dark:text-gray-100">
                  {t('history.session_runtime')}
                  <span className="ml-2 text-xs font-normal text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-slate-700 px-2 py-0.5 rounded-full">
                    {fmtSeconds(item.meta.totalSeconds)}
                  </span>
                </h4>
                <div className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-2">
                  <span>{formatDate(item.startDate)}</span>
                  <span>&rarr;</span>
                  <span>{formatDate(item.endDate)}</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <span className="font-bold text-gray-900 dark:text-gray-100">
                {item.amount.toFixed(4)} <span className="text-xs font-normal text-gray-500 dark:text-gray-400">{t('units.credits')}</span>
              </span>
              {isOpen ? <ChevronUpIcon className="w-5 h-5 text-gray-400" /> : <ChevronDownIcon className="w-5 h-5 text-gray-400" />}
            </div>
          </div>
          {isOpen && (
            <div className="bg-gray-50 dark:bg-slate-900/50 border-t border-gray-100 dark:border-slate-700 px-4 py-3 space-y-2">
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">{t('history.detailed_charges')}</p>
              {item.details.map((tx) => (
                <div key={tx.id} className="flex justify-between text-sm text-gray-600 dark:text-gray-300 pl-4 border-l-2 border-indigo-200 dark:border-indigo-800">
                  <span>{formatDate(tx.created_at)}</span>
                  <span className="font-mono">{tx.amount.toFixed(4)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }
    return (
      <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-4 flex items-center justify-between hover:shadow-sm transition-shadow">
        <div className="flex items-center gap-4">
          <div className={`p-2 rounded-lg ${!isNegative ? 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400' : 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-400'}`}>
            {!isNegative ? <CurrencyDollarIcon className="w-6 h-6" /> : <ReceiptRefundIcon className="w-6 h-6" />}
          </div>
          <div>
            <h4 className="font-semibold text-gray-900 dark:text-gray-100 capitalize">{item.type === 'usage' ? t('history.manual_deduction') : item.type}</h4>
            <p className="text-sm text-gray-500 dark:text-gray-400">{formatDate(item.date)}</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{item.description}</p>
          </div>
        </div>
        <span className={`font-bold ${!isNegative ? 'text-green-600 dark:text-green-400' : 'text-gray-900 dark:text-gray-100'}`}>
          {item.amount > 0 ? '+' : ''}{item.amount.toFixed(2)} <span className="text-xs font-normal text-gray-500 dark:text-gray-400">{t('units.credits')}</span>
        </span>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900 flex flex-col font-sans text-slate-900 dark:text-gray-100">
      <Header user={user} credits={credits} isLoading={loadingData} onLogout={handleLogout} />

      <main className="flex-grow w-full max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">{t('title')}</h1>
            <p className="text-gray-600 dark:text-gray-400 mt-1">{t('subtitle')}</p>
          </div>
          <button
            onClick={() => setIsBuyModalOpen(true)}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-2xl font-bold shadow-lg shadow-indigo-200 dark:shadow-none transition-all flex items-center gap-2 transform active:scale-95"
          >
            <CurrencyDollarIcon className="w-5 h-5" />
            {t('buy_credits')}
          </button>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-sm border border-gray-200 dark:border-slate-700 p-8 mb-10 flex flex-col sm:flex-row items-center justify-between gap-8 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
            <CurrencyDollarIcon className="w-64 h-64 text-indigo-900 dark:text-indigo-400" />
          </div>
          <div className="relative z-10">
            <p className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-widest">{t('card.title')}</p>
            <p className="text-5xl font-black text-slate-900 dark:text-white mt-2">
              {loadingData ? "..." : credits.toLocaleString()} 
              <span className="text-lg font-medium text-gray-400 dark:text-gray-500 ml-3">Credits</span>
            </p>
          </div>
          <div className="relative z-10 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-800/50 rounded-2xl p-5 max-w-xs">
            <div className="flex items-start gap-4">
              <SparklesIcon className="w-6 h-6 text-indigo-600 dark:text-indigo-400 mt-1 shrink-0" />
              <div>
                <h4 className="text-sm font-bold text-indigo-900 dark:text-indigo-200">{t('card.info_title')}</h4>
                <p className="text-xs text-indigo-700 dark:text-indigo-400 mt-1.5 leading-relaxed">{t('card.info_desc')}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-6">{t('history.title')}</h2>
          {loadingData ? (
            <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-10 w-10 border-4 border-indigo-600 border-t-transparent"></div></div>
          ) : error ? (
            <div className="bg-red-50 text-red-700 p-4 rounded-xl border border-red-200 text-center">{error}</div>
          ) : transactions.length === 0 ? (
            <div className="text-center py-20 bg-white dark:bg-slate-800 rounded-3xl border border-dashed border-gray-200 dark:border-slate-700">
              <ReceiptRefundIcon className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
              <p className="text-gray-500 dark:text-gray-400 font-medium">{t('history.empty')}</p>
            </div>
          ) : (
            <div className="space-y-4">
              {groupedTransactions().map((item) => <HistoryItem key={item.id} item={item} />)}
            </div>
          )}
        </div>
      </main>

      <Footer />

      {/* --- SLIDER-BASED BUY CREDITS MODAL --- */}
      {isBuyModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-md transition-all">
          <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] shadow-2xl max-w-md w-full overflow-hidden border border-gray-100 dark:border-slate-800 relative animate-in fade-in zoom-in duration-300">
            
            <div className="bg-gradient-to-br from-indigo-600 to-violet-700 p-8 text-white relative">
              <button onClick={() => setIsBuyModalOpen(false)} className="absolute top-6 right-6 p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors">
                <XMarkIcon className="w-5 h-5" />
              </button>
              <div className="flex items-center gap-3 mb-2">
                <SparklesIcon className="w-6 h-6 text-indigo-200" />
                <h2 className="text-2xl font-black tracking-tight">Add Credits</h2>
              </div>
              <p className="text-indigo-100/80 text-sm font-medium">Power your servers with instant balance.</p>
            </div>

            <div className="p-8">
              {/* Credit Display Area */}
              <div className="text-center mb-10">
                <div className={`inline-block px-4 py-1.5 rounded-full mb-3 transition-colors ${bonusGet > 0 ? 'bg-green-100 dark:bg-green-900/40 text-green-600 dark:text-green-400' : 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600'}`}>
                  <span className="text-xs font-bold uppercase tracking-widest">
                    {bonusGet > 0 ? `🔥 +${activePercent}% Bonus Credits!` : 'You are getting'}
                  </span>
                </div>
                <div className="flex items-center justify-center gap-2">
                  <span className="text-6xl font-black text-slate-900 dark:text-white tracking-tighter">{totalGet.toLocaleString()}</span>
                  <span className="text-xl font-bold text-gray-400 self-end mb-2">Credits</span>
                </div>
                {bonusGet > 0 && (
                  <p className="text-[10px] font-bold text-green-500 uppercase mt-1 tracking-wider">
                    ({depositAmount * 100} Base + {bonusGet} Free Bonus)
                  </p>
                )}
              </div>

              {/* Slider Component */}
              <div className="mb-10 px-2">
                <div className="flex justify-between text-xs font-bold text-gray-400 uppercase mb-4 tracking-widest">
                  <span>3€</span>
                  <span>Select Amount</span>
                  <span>50€</span>
                </div>
                <input 
                  type="range"
                  min="3"
                  max="50"
                  step="1"
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(Number(e.target.value))}
                  className="w-full h-3 bg-gray-100 dark:bg-slate-800 rounded-full appearance-none cursor-pointer accent-indigo-600 hover:accent-indigo-500 transition-all"
                />
                <div className="flex justify-between mt-4 px-1">
                  {[5, 10, 20, 30, 40, 50].map(val => (
                    <div key={val} className="flex flex-col items-center gap-1.5">
                      <div className={`h-1.5 w-1.5 rounded-full transition-colors ${depositAmount >= val ? 'bg-indigo-600' : 'bg-gray-200 dark:bg-slate-700'}`} />
                    </div>
                  ))}
                </div>
              </div>

              {/* Quick Access Buttons */}
              <div className="grid grid-cols-3 gap-3 mb-10">
                {[5, 10, 25].map((amt) => (
                  <button
                    key={amt}
                    onClick={() => setDepositAmount(amt)}
                    className={`py-3 rounded-2xl border-2 font-black text-sm transition-all transform active:scale-95 ${
                      depositAmount === amt
                        ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400'
                        : 'border-gray-50 dark:border-slate-800 bg-gray-50 dark:bg-slate-800/50 text-gray-500 hover:border-gray-200 dark:hover:border-slate-700'
                    }`}
                  >
                    €{amt}
                  </button>
                ))}
              </div>

              {/* Summary and Pay */}
              <div className="bg-slate-50 dark:bg-slate-800/50 rounded-3xl p-6 border border-gray-100 dark:border-slate-800">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-2">
                    <CurrencyDollarIcon className="w-5 h-5 text-indigo-600" />
                    <span className="text-sm font-bold text-slate-600 dark:text-slate-300">Total Payment</span>
                  </div>
                  <div className="text-right">
                    <span className="text-2xl font-black text-slate-900 dark:text-white">€{depositAmount.toFixed(2)}</span>
                    <p className="text-[10px] font-bold text-indigo-500 uppercase tracking-tighter">Get {totalGet.toLocaleString()} Credits</p>
                  </div>
                </div>

                <button
                  onClick={handleCheckout}
                  disabled={loadingPayment || depositAmount < 3 || depositAmount > 50}
                  className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 dark:disabled:bg-slate-800 text-white font-black rounded-2xl shadow-xl shadow-indigo-200 dark:shadow-none transition-all flex justify-center items-center gap-3 transform active:scale-95 group"
                >
                  {loadingPayment ? (
                    <div className="w-5 h-5 border-3 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      Confirm & Pay
                      <span className="bg-indigo-500 px-2 py-0.5 rounded-lg text-[10px] font-black group-hover:bg-indigo-400 transition-colors uppercase">Stripe</span>
                    </>
                  )}
                </button>
                <p className="text-center text-[10px] text-gray-400 font-bold uppercase mt-4 tracking-widest">Secure checkout with Stripe</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export async function getStaticProps({ locale }) {
  return {
    props: {
      ...(await serverSideTranslations(locale, ['common', 'credits'])),
    },
  };
}