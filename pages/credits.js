import { useState, useEffect } from "react";
import React from 'react';
import { supabase } from "../lib/supabaseClient";
import { useRouter } from "next/router";
import Header from "../components/ServersHeader";
import Footer from "../components/ServersFooter";
import bonusesConfig from '../lib/stripeBonuses.json';
import { 
  CurrencyDollarIcon, 
  ReceiptRefundIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  XMarkIcon,
  SparklesIcon,
  ServerIcon,
  CreditCardIcon,
  ShieldCheckIcon,
  InformationCircleIcon
} from '@heroicons/react/24/outline';
import { useTranslation } from "next-i18next"; 
import { serverSideTranslations } from 'next-i18next/serverSideTranslations'; 

// --- STRIPE IMPORTS ---
import { loadStripe } from "@stripe/stripe-js";
import { 
  Elements, 
  PaymentElement, 
  ExpressCheckoutElement, 
  useStripe, 
  useElements 
} from "@stripe/react-stripe-js";

// Initialize Stripe
const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY);

// --- INTERNAL COMPONENT: CHECKOUT FORM ---
const CheckoutForm = ({ amount, onSuccess, onError }) => {
  const stripe = useStripe();
  const elements = useElements();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);

  // Handle Standard Form Submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    setLoading(true);
    setMessage(null);

    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/credits?payment_success=true`,
      },
    });

    if (error) {
      setMessage(error.message);
      setLoading(false);
      if (onError) onError(error.message);
    } else {
      if (onSuccess) onSuccess();
    }
  };

  // Handle Wallet Button Click (Google Pay / Apple Pay)
  const onExpressClick = ({ resolve }) => {
    resolve();
  };

  const onExpressConfirm = async (event) => {
    if (!stripe) return;
    setLoading(true);
    setMessage(null);

    const { error } = await stripe.confirmPayment({
      elements,
      clientSecret: event.clientSecret,
      confirmParams: {
        return_url: `${window.location.origin}/credits?payment_success=true`,
      },
    });

    if (error) {
      setMessage(error.message);
      setLoading(false);
      if (onError) onError(error.message);
    } else {
      if (onSuccess) onSuccess();
    }
  };

  return (
    <div className="animate-in fade-in slide-in-from-right-4 duration-500">
       
       {/* --- EXPRESS CHECKOUT (WALLETS) --- */}
       <div className="mb-6">
          <ExpressCheckoutElement 
            onClick={onExpressClick} 
            onConfirm={onExpressConfirm}
            options={{
              buttonType: {
                applePay: 'buy',
                googlePay: 'buy',
              },
            }}
          />
       </div>

       {/* DIVIDER */}
       <div className="relative flex items-center gap-4 mb-6">
          <div className="h-px bg-slate-200 dark:bg-slate-700 flex-1" />
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Or pay with card</span>
          <div className="h-px bg-slate-200 dark:bg-slate-700 flex-1" />
       </div>

       {/* STANDARD FORM */}
       <form onSubmit={handleSubmit}>
         <PaymentElement options={{ layout: 'tabs' }} />
         
         {message && (
           <div className="bg-red-50 text-red-600 text-sm p-3 rounded-lg mt-4 border border-red-200 flex gap-2 items-start">
             <div className="mt-0.5">⚠️</div>
             <div>{message}</div>
           </div>
         )}
         
         <button
          disabled={!stripe || loading}
          className="w-full mt-6 py-4 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-all flex justify-center items-center gap-2 shadow-lg shadow-indigo-200 dark:shadow-none"
        >
          {loading ? (
            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <>
              <span>Pay €{amount.toFixed(2)}</span>
              <ShieldCheckIcon className="w-5 h-5 opacity-70" />
            </>
          )}
        </button>
      </form>
    </div>
  );
};

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
  const [clientSecret, setClientSecret] = useState(null); 
  const [agreedToRefundWaiver, setAgreedToRefundWaiver] = useState(false);

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

  // Initial Data Fetch
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

  const handleInitiatePayment = async () => {
    if (depositAmount < 3 || depositAmount > 50) return;
    if (!agreedToRefundWaiver) return;
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch('/api/stripe/create_intent', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ amount: depositAmount }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to initiate payment");
      }

      if (data.clientSecret) {
        setClientSecret(data.clientSecret);
      } else {
        throw new Error("No client secret returned.");
      }

    } catch (err) {
      console.error("Payment Init Error:", err);
      alert("Payment initialization failed: " + err.message);
    }
  };

  // Reset payment state
  useEffect(() => {
    if (!isBuyModalOpen) {
      setClientSecret(null);
      setAgreedToRefundWaiver(false); 
    }
  }, [isBuyModalOpen]);

  useEffect(() => {
    setClientSecret(null);
  }, [depositAmount]);

  // --- HELPERS ---
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

        {/* --- CREDITS CARD (MOBILE OPTIMIZED) --- */}
        <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-sm border border-gray-200 dark:border-slate-700 p-5 md:p-8 mb-10 flex flex-col sm:flex-row items-center justify-between gap-8 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
            <CurrencyDollarIcon className="w-64 h-64 text-indigo-900 dark:text-indigo-400" />
          </div>
          <div className="relative z-10">
            <p className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-widest">{t('card.title')}</p>
            {/* Reduced text size on mobile to prevent overflow */}
            <p className="text-4xl md:text-5xl font-black text-slate-900 dark:text-white mt-2">
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

      {/* --- BUY MODAL (MOBILE RESPONSIVE) --- */}
      {isBuyModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4 bg-slate-950/70 backdrop-blur-md transition-all">
          
          {/* MOBILE CHANGES: 
            - h-[100dvh] for full screen on mobile
            - rounded-none on mobile, rounded-[2.5rem] on desktop
          */}
          <div className="bg-white dark:bg-slate-900 sm:rounded-[2.5rem] shadow-2xl w-full sm:max-w-4xl h-[100dvh] sm:h-auto sm:max-h-[95vh] overflow-hidden border-0 sm:border border-gray-100 dark:border-slate-800 relative animate-in fade-in zoom-in duration-300 flex flex-col md:flex-row">
            
            {/* LEFT SIDE: SELECTION */}
            <div className="flex-1 p-5 md:p-10 bg-white dark:bg-slate-900 overflow-y-auto">
                <div className="flex justify-between items-start mb-6">
                    <div>
                        <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Add Credits</h2>
                        <p className="text-slate-500 dark:text-slate-400 text-sm font-medium mt-1">Select an amount to recharge.</p>
                    </div>
                    {/* Mobile Close Button (Visible) */}
                    <button onClick={() => setIsBuyModalOpen(false)} className="md:hidden p-2 bg-slate-100 dark:bg-slate-800 rounded-full text-slate-500 hover:bg-slate-200">
                        <XMarkIcon className="w-6 h-6" />
                    </button>
                </div>

                {/* VISUALIZATION */}
                <div className="bg-indigo-50 dark:bg-indigo-900/10 rounded-3xl p-6 md:p-8 mb-8 text-center border border-indigo-100 dark:border-indigo-900/30">
                    <div className={`inline-block px-4 py-1.5 rounded-full mb-4 transition-colors ${bonusGet > 0 ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400' : 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-400'}`}>
                        <span className="text-xs font-bold uppercase tracking-widest">{bonusGet > 0 ? `🔥 +${activePercent}% Bonus Active` : 'Current Offer'}</span>
                    </div>
                    
                    <div className="flex items-center justify-center gap-2 mb-2">
                        {/* Smaller text on mobile */}
                        <span className="text-5xl md:text-6xl font-black text-slate-900 dark:text-white tracking-tighter">{totalGet.toLocaleString()}</span>
                    </div>
                    <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">Credits Received</p>
                    
                    {bonusGet > 0 && (
                         <div className="mt-4 text-xs font-medium text-green-600 dark:text-green-400 flex items-center justify-center gap-1">
                            <SparklesIcon className="w-4 h-4" />
                            <span>{depositAmount * 100} Base + <strong>{bonusGet} Bonus</strong></span>
                         </div>
                    )}
                </div>

                {/* SLIDER CONTROLS */}
                <div className="mb-8">
                    <div className="flex justify-between text-xs font-bold text-gray-400 uppercase mb-4 tracking-widest">
                        <span>3€</span>
                        <span>Drag to Adjust</span>
                        <span>50€</span>
                    </div>
                    <input 
                      type="range"
                      min="3"
                      max="50"
                      step="1"
                      value={depositAmount}
                      onChange={(e) => setDepositAmount(Number(e.target.value))}
                      className="w-full h-6 bg-slate-100 dark:bg-slate-800 rounded-full appearance-none cursor-pointer accent-indigo-600 hover:accent-indigo-500 transition-all touch-action-manipulation"
                    />
                </div>

                {/* PRESET BUTTONS */}
                <div>
                    <p className="text-xs font-bold text-gray-400 uppercase mb-3 tracking-widest">Quick Select</p>
                    <div className="grid grid-cols-4 gap-3">
                        {[5, 10, 20, 50].map((amt) => (
                        <button
                            key={amt}
                            onClick={() => setDepositAmount(amt)}
                            className={`py-2.5 rounded-xl border font-bold text-sm transition-all transform active:scale-95 ${
                            depositAmount === amt
                                ? 'border-indigo-600 bg-indigo-600 text-white'
                                : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:border-indigo-300'
                            }`}
                        >
                            €{amt}
                        </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* RIGHT SIDE: CHECKOUT (Darker/Different BG) */}
            <div className="w-full md:w-[400px] bg-slate-50 dark:bg-slate-950/50 border-t md:border-t-0 md:border-l border-gray-100 dark:border-slate-800 p-5 md:p-8 flex flex-col overflow-y-auto">
                {/* Desktop Close Button */}
                <button onClick={() => setIsBuyModalOpen(false)} className="hidden md:block self-end p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors mb-4">
                    <XMarkIcon className="w-6 h-6" />
                </button>

                <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-6 flex items-center gap-2">
                    <CreditCardIcon className="w-5 h-5 text-indigo-500" />
                    Order Summary
                </h3>

                {/* SUMMARY CARD */}
                <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-3 mb-6 shadow-sm">
                    <div className="flex justify-between text-sm">
                        <span className="text-slate-500 dark:text-slate-400">Amount</span>
                        <span className="font-mono text-slate-900 dark:text-white">€{depositAmount.toFixed(2)}</span>
                    </div>
                    {bonusGet > 0 && (
                         <div className="flex justify-between text-sm text-green-600 dark:text-green-400">
                            <span>Bonus Applied</span>
                            <span className="font-mono">+{activePercent}%</span>
                         </div>
                    )}
                    <div className="h-px bg-slate-100 dark:bg-slate-800 my-2" />
                    <div className="flex justify-between items-center">
                        <span className="font-bold text-slate-900 dark:text-white">Total</span>
                        <span className="text-2xl font-black text-indigo-600 dark:text-indigo-400">€{depositAmount.toFixed(2)}</span>
                    </div>
                </div>

                {/* PAYMENT AREA */}
                <div className="mt-auto pb-4 md:pb-0">
                    {!clientSecret ? (
                         <>
                             {/* EU WAIVER */}
                             <div className="flex items-start gap-3 mb-6 p-3 bg-slate-100 dark:bg-slate-800/80 rounded-lg border border-slate-200 dark:border-slate-700">
                                <div className="flex items-center h-5 mt-0.5">
                                    <input
                                        id="eu-refund-waiver"
                                        type="checkbox"
                                        checked={agreedToRefundWaiver}
                                        onChange={(e) => setAgreedToRefundWaiver(e.target.checked)}
                                        className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500 dark:bg-slate-700 dark:border-slate-600 cursor-pointer"
                                    />
                                </div>
                                <div className="ml-1 text-xs leading-relaxed">
                                    <label htmlFor="eu-refund-waiver" className="font-medium text-slate-600 dark:text-slate-300 cursor-pointer">
                                        {t('checkout.refund_waiver', { defaultValue: 'I acknowledge that by purchasing immediate access to digital credits, I waive my 14-day right of withdrawal under EU consumer protection regulations.' })}
                                    </label>
                                </div>
                             </div>

                             <button
                                onClick={handleInitiatePayment}
                                disabled={depositAmount < 3 || depositAmount > 50 || !agreedToRefundWaiver}
                                className="w-full py-4 bg-slate-900 dark:bg-white hover:bg-slate-800 dark:hover:bg-indigo-50 disabled:opacity-50 disabled:cursor-not-allowed text-white dark:text-slate-900 font-bold rounded-xl shadow-lg transition-all flex justify-center items-center gap-3 transform active:scale-95"
                             >
                                Continue to Checkout
                             </button>
                         </>
                    ) : (
                        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                             <div className="flex items-center justify-between mb-4">
                                <span className="text-xs font-bold uppercase text-slate-400 tracking-wider">Payment Details</span>
                                <button onClick={() => setClientSecret(null)} className="text-xs text-indigo-500 hover:underline">Change Amount</button>
                             </div>
                             
                             <Elements 
                                stripe={stripePromise} 
                                options={{ 
                                  clientSecret, 
                                  appearance: { 
                                    theme: 'stripe',
                                    variables: {
                                        colorPrimary: '#4f46e5',
                                        fontSizeBase: '14px', // Optimized for mobile
                                    }
                                  } 
                                }}
                             >
                                <CheckoutForm 
                                  amount={depositAmount} 
                                  onSuccess={() => setIsBuyModalOpen(false)} 
                                  onError={(msg) => alert(msg)} 
                                />
                             </Elements>
                        </div>
                    )}
                    
                    <p className="text-center text-[10px] text-slate-400 mt-4 flex items-center justify-center gap-1">
                        <ShieldCheckIcon className="w-3 h-3" />
                        Secure Payment via Stripe
                    </p>
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