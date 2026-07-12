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
  ArrowPathIcon,
  CheckCircleIcon,
  CalendarIcon,
  PencilIcon
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

// --- INTERNAL COMPONENT: ONE-TIME CHECKOUT FORM ---
const CheckoutForm = ({ amount, onSuccess, onError, t }) => {
  const stripe = useStripe();
  const elements = useElements();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);

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

       <div className="relative flex items-center gap-4 mb-6">
          <div className="h-px bg-slate-200 dark:bg-slate-700 flex-1" />
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{t('checkout.or_card', { defaultValue: 'Or pay with card' })}</span>
          <div className="h-px bg-slate-200 dark:bg-slate-700 flex-1" />
       </div>

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
              <span>{t('checkout.pay_button', { amount: amount.toFixed(2), defaultValue: `Pay €${amount.toFixed(2)}` })}</span>
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
  
  // Subscription State
  const [recurringAmount, setRecurringAmount] = useState(0);
  const [subscriptionId, setSubscriptionId] = useState(null);
  const [selectedSubAmount, setSelectedSubAmount] = useState(20.00);
  const [subCheckoutLoading, setSubCheckoutLoading] = useState(false);
  const [subCancelLoading, setSubCancelLoading] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);
  
  // EDIT SUBSCRIPTION STATE
  const [isEditingSub, setIsEditingSub] = useState(false);
  const [editSubAmount, setEditSubAmount] = useState(0);
  const [subUpdateLoading, setSubUpdateLoading] = useState(false);

  // Loading State
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState(null);

  // Payment UI State
  const [isBuyModalOpen, setIsBuyModalOpen] = useState(false);
  const [depositAmount, setDepositAmount] = useState(10.00); 
  const [clientSecret, setClientSecret] = useState(null); 
  const [agreedToRefundWaiver, setAgreedToRefundWaiver] = useState(false);

  // Bonus Calculation Logic
  const getBonusInfo = (euro) => {
    return bonusesConfig.bonuses.find(b => euro >= b.min_euro);
  };

  const calculateTotalCredits = (euro) => {
    const base = Math.round(euro * 100); 
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
    if (!router.isReady) return;

    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push("/login");
        return;
      }

      setUser(session.user);

      try {
        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("credits, recurring_purchase_amount, recurring_stripe_subscription_id")
          .eq("id", session.user.id)
          .single();
        
        if (profileError) throw profileError;
        setCredits(profile?.credits || 0);
        
        const currentRecurring = profile?.recurring_purchase_amount || 0;
        const currentSubId = profile?.recurring_stripe_subscription_id || null;
        
        setRecurringAmount(currentRecurring);
        setSubscriptionId(currentSubId);

        // Logic for handling ?auto_add and ?payment_success
        let urlCleaned = false;
        if (router.query.payment_success) {
            urlCleaned = true;
        }

        if (router.query.auto_add) {
            const addAmountCredits = Number(router.query.auto_add);
            if (!isNaN(addAmountCredits) && addAmountCredits > 0) {
                const addAmountEuros = addAmountCredits / 100;
                
                if (currentSubId) {
                    const newTotal = Math.min(200, currentRecurring + addAmountEuros);
                    setEditSubAmount(Number(newTotal.toFixed(2)));
                    setIsEditingSub(true); 
                } else {
                    const validStartingAmount = Math.max(5, Math.min(200, addAmountEuros));
                    setSelectedSubAmount(Number(validStartingAmount.toFixed(2)));
                }
                urlCleaned = true;
            }
        }

        if (urlCleaned) {
            router.replace('/credits', undefined, { shallow: true });
        }

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

    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady]); 

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  // ONE-TIME PAYMENT INTENT
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
        body: JSON.stringify({ 
          amount: depositAmount, 
          refund_waiver_agreed: agreedToRefundWaiver 
        }),
      });

      const data = await response.json();

      if (!response.ok) throw new Error(data.error || "Failed to initiate payment");
      if (data.clientSecret) setClientSecret(data.clientSecret);
      else throw new Error("No client secret returned.");

    } catch (err) {
      console.error("Payment Init Error:", err);
      alert(t('errors.payment_init_failed', { defaultValue: 'Payment initialization failed' }) + ": " + err.message);
    }
  };

  // SUBSCRIPTION HANDLERS
  const handleSubscribe = async () => {
    if (selectedSubAmount < 5 || selectedSubAmount > 200) return;
    setSubCheckoutLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      const res = await fetch('/api/stripe/checkout_sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify({ amount: selectedSubAmount, isSubscription: true })
      });
      
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url; 
      } else {
        throw new Error(data.error || t('errors.sub_create_failed', { defaultValue: 'Failed to create subscription session' }));
      }
    } catch (e) {
      alert(e.message);
      setSubCheckoutLoading(false);
    }
  };

  const handleCancelSubscription = async () => {
    if (!confirm(t('subscription.confirm_cancel', { defaultValue: 'Are you sure you want to cancel your monthly auto-refill?' }))) return;
    setSubCancelLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      const res = await fetch('/api/stripe/cancel_subscription', { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` }
      });
      
      if (!res.ok) throw new Error(t('errors.sub_cancel_failed', { defaultValue: "Failed to cancel subscription" }));
      
      setSubscriptionId(null);
      setRecurringAmount(0);
      setIsEditingSub(false);
      alert(t('subscription.cancel_success', { defaultValue: 'Subscription cancelled successfully.' }));
    } catch (e) {
      alert(e.message);
    } finally {
      setSubCancelLoading(false);
    }
  };

  // EDIT SUBSCRIPTION HANDLER
  const handleUpdateSubscription = async () => {
    if (editSubAmount < 5 || editSubAmount > 200) return;
    setSubUpdateLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      const res = await fetch('/api/stripe/update_subscription', { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify({ amount: editSubAmount })
      });
      
      if (!res.ok) throw new Error((await res.json()).error || t('errors.sub_update_failed', { defaultValue: "Failed to update subscription" }));
      
      setRecurringAmount(editSubAmount);
      setIsEditingSub(false);
      alert(t('subscription.update_success', { defaultValue: 'Subscription updated successfully! The new amount will be charged on your next billing date.' }));
    } catch (e) {
      alert(e.message);
    } finally {
      setSubUpdateLoading(false);
    }
  };

  // OPEN BILLING PORTAL HANDLER
  const handleOpenPortal = async () => {
    setPortalLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      const res = await fetch('/api/stripe/customer_portal', { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` }
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t('errors.portal_open_failed', { defaultValue: "Failed to open billing portal" }));
      
      window.location.href = data.url; 
    } catch (e) {
      alert(e.message);
      setPortalLoading(false);
    }
  };

  const getNextBillingDate = () => {
    const latestDeposit = transactions.find(t => t.type === 'deposit' && t.description.includes('Auto-Refill'));
    const created = latestDeposit ? new Date(latestDeposit.created_at) : new Date();
    const now = new Date();
    let next = new Date(created);
    
    if (!latestDeposit) {
        next.setMonth(next.getMonth() + 1);
    } else {
        while (next <= now) {
            next.setMonth(next.getMonth() + 1);
        }
    }
    
    return next.toLocaleDateString(router.locale || 'en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

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
  const formatDate = (dateString) => new Date(dateString).toLocaleString(router.locale || "en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  
  const parseUsage = (description) => {
    if (!description) return {};
    const serverMatch = description.match(/server\s+([a-f0-9-]{36}|[a-f0-9-]{8})/i);
    const secondsMatch = description.match(/(\d+)\s*seconds/i);
    return { serverId: serverMatch ? serverMatch[1] : null, seconds: secondsMatch ? parseInt(secondsMatch[1], 10) : null };
  };

  const fmtSeconds = (s) => {
    if (s == null) return null;
    const hrs = Math.floor(s / 3600);
    const mins = Math.floor((s % 3600) / 60);
    if (hrs > 0) return `${hrs}${t('units.h', {defaultValue: 'h'})} ${mins}${t('units.m', {defaultValue: 'm'})}`;
    return `${mins}${t('units.m', {defaultValue: 'm'})} ${s % 60}${t('units.s', {defaultValue: 's'})}`;
  };
  
  // --- TRANSACTION GROUPING LOGIC ---
  const groupedTransactions = () => {
    const groups = [];
    const sessionMap = new Map();
    const singles = [];
    
    transactions.forEach((tx) => {
      const isMonthlyFee = tx.type === 'monthly_fee' || (tx.description && (tx.description.includes('First Month') || tx.description.includes('Monthly')));
      
      if (tx.session_id && tx.type === 'usage' && !isMonthlyFee) {
        if (!sessionMap.has(tx.session_id)) sessionMap.set(tx.session_id, []);
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
      const startDateStr = txs[0].created_at;
      const calculatedEndDate = new Date(new Date(startDateStr).getTime() + (totalSeconds * 1000)).toISOString();

      groups.push({ 
        id: sessionId, 
        isSession: true, 
        date: txs[txs.length - 1].created_at, 
        startDate: startDateStr, 
        endDate: calculatedEndDate, 
        amount: totalAmount, 
        details: txs, 
        meta: { serverId, totalSeconds } 
      });
    });
    
    singles.forEach(tx => {
      const { serverId, seconds } = parseUsage(tx.description);
      groups.push({ 
          id: tx.id, 
          isSession: false, 
          date: tx.created_at, 
          amount: tx.amount, 
          type: tx.type, 
          description: tx.description, 
          meta: { serverId, seconds } 
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
              <div className="p-2 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-lg"><ServerIcon className="w-6 h-6" /></div>
              <div><h4 className="font-semibold text-gray-900 dark:text-gray-100">{t('history.session_runtime', { defaultValue: 'Session Runtime' })}<span className="ml-2 text-xs font-normal text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-slate-700 px-2 py-0.5 rounded-full">{fmtSeconds(item.meta.totalSeconds)}</span></h4><div className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-2"><span>{formatDate(item.startDate)}</span><span>&rarr;</span><span>{formatDate(item.endDate)}</span></div></div>
            </div>
            <div className="flex items-center gap-4"><span className="font-bold text-gray-900 dark:text-gray-100">{item.amount.toFixed(4)} <span className="text-xs font-normal text-gray-500 dark:text-gray-400">{t('units.credits', { defaultValue: 'credits' })}</span></span>{isOpen ? <ChevronUpIcon className="w-5 h-5 text-gray-400" /> : <ChevronDownIcon className="w-5 h-5 text-gray-400" />}</div>
          </div>
          {isOpen && (
            <div className="bg-gray-50 dark:bg-slate-900/50 border-t border-gray-100 dark:border-slate-700 p-4">
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">{t('history.usage_calculation', { defaultValue: 'Usage Calculation' })}</p>
                <div className="flex flex-col sm:flex-row items-center gap-3 md:gap-6 text-sm font-mono bg-white dark:bg-slate-800 p-4 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm">
                    <div className="flex flex-col items-center sm:items-start">
                        <span className="text-[10px] uppercase text-gray-400 font-sans font-bold tracking-wider mb-1">{t('history.time', { defaultValue: 'Time' })}</span>
                        <span className="text-gray-700 dark:text-gray-200">{(item.meta.totalSeconds / 3600).toFixed(4)} <span className="text-gray-400 text-xs">{t('history.hrs', { defaultValue: 'hrs' })}</span></span>
                    </div>
                    <div className="hidden sm:block text-gray-300 dark:text-slate-600">✕</div>
                    <div className="flex flex-col items-center sm:items-start">
                        <span className="text-[10px] uppercase text-gray-400 font-sans font-bold tracking-wider mb-1">{t('history.rate', { defaultValue: 'Rate' })}</span>
                        <span className="text-gray-700 dark:text-gray-200">{item.meta.totalSeconds > 0 ? Math.abs(item.amount / (item.meta.totalSeconds / 3600)).toFixed(2) : '0.00'} <span className="text-gray-400 text-xs">{t('history.cr_hr', { defaultValue: 'cr/hr' })}</span></span>
                    </div>
                    <div className="hidden sm:block text-gray-300 dark:text-slate-600">=</div>
                    <div className="flex flex-col items-center sm:items-start">
                        <span className="text-[10px] uppercase text-gray-400 font-sans font-bold tracking-wider mb-1">{t('history.total', { defaultValue: 'Total' })}</span>
                        <span className="font-bold text-indigo-600 dark:text-indigo-400">{Math.abs(item.amount).toFixed(4)} <span className="text-indigo-400/70 text-xs">{t('history.cr', { defaultValue: 'cr' })}</span></span>
                    </div>
                </div>
            </div>
          )}
        </div>
      );
    }

    const isMonthlyFee = item.type === 'monthly_fee' || (item.description && (item.description.includes('First Month') || item.description.includes('Monthly')));
    
    let label = item.type === 'usage' ? t('history.manual_deduction', { defaultValue: 'Runtime Deduction' }) : item.type;
    if (item.type === 'deposit') label = t('history.deposit', { defaultValue: 'Credit Deposit' });
    if (isMonthlyFee) label = t('history.monthly_fee', { defaultValue: 'Monthly Server Fee' });
    
    let descText = item.description;
    if (isMonthlyFee && descText) {
        const srvMatch = descText.match(/Server ([a-f0-9-]+)/i);
        if (srvMatch) {
            descText = t('history.server_prefix', { defaultValue: 'Server: {{id}}', id: srvMatch[1] });
        }
    }

    return (
      <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-4 flex items-center justify-between hover:shadow-sm transition-shadow">
        <div className="flex items-center gap-4">
          <div className={`p-2 rounded-lg ${!isNegative ? 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400' : (isMonthlyFee ? 'bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400' : 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-400')}`}>
            {!isNegative ? <CurrencyDollarIcon className="w-6 h-6" /> : (isMonthlyFee ? <CalendarIcon className="w-6 h-6" /> : <ReceiptRefundIcon className="w-6 h-6" />)}
          </div>
          <div>
            <h4 className="font-semibold text-gray-900 dark:text-gray-100 capitalize">{label}</h4>
            <p className="text-sm text-gray-500 dark:text-gray-400">{formatDate(item.date)}</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{descText}</p>
          </div>
        </div>
        <span className={`font-bold ${!isNegative ? 'text-green-600 dark:text-green-400' : 'text-gray-900 dark:text-gray-100'}`}>
            {item.amount > 0 ? '+' : ''}{item.amount.toFixed(2)} <span className="text-xs font-normal text-gray-500 dark:text-gray-400">{t('units.credits', { defaultValue: 'credits' })}</span>
        </span>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900 flex flex-col font-sans text-slate-900 dark:text-gray-100">
      <Header user={user} credits={credits} isLoading={loadingData} onLogout={handleLogout} />

      <main className="flex-grow w-full max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-24">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div><h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">{t('title', { defaultValue: 'Credits & Billing' })}</h1><p className="text-gray-600 dark:text-gray-400 mt-1">{t('subtitle', { defaultValue: 'Manage your balance and view transaction history.' })}</p></div>
          <button onClick={() => setIsBuyModalOpen(true)} className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-2xl font-bold shadow-lg shadow-indigo-200 dark:shadow-none transition-all flex items-center gap-2 transform active:scale-95"><CurrencyDollarIcon className="w-5 h-5" />{t('buy_credits', { defaultValue: 'Buy Credits' })}</button>
        </div>

        {/* 1. CREDITS CARD */}
        <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-sm border border-gray-200 dark:border-slate-700 p-5 md:p-8 mb-6 flex flex-col sm:flex-row items-center justify-between gap-8 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none"><CurrencyDollarIcon className="w-64 h-64 text-indigo-900 dark:text-indigo-400" /></div>
          <div className="relative z-10">
            <p className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-widest">{t('card.title', { defaultValue: 'Available Balance' })}</p>
            <p className="text-4xl md:text-5xl font-black text-slate-900 dark:text-white mt-2">{loadingData ? "..." : credits.toLocaleString()} <span className="text-lg font-medium text-gray-400 dark:text-gray-500 ml-3">{t('card.credits_suffix', { defaultValue: 'Credits' })}</span></p>
          </div>
          <div className="relative z-10 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-800/50 rounded-2xl p-5 max-w-xs"><div className="flex items-start gap-4"><SparklesIcon className="w-6 h-6 text-indigo-600 dark:text-indigo-400 mt-1 shrink-0" /><div><h4 className="text-sm font-bold text-indigo-900 dark:text-indigo-200">{t('card.info_title', { defaultValue: 'Credits are Universal' })}</h4><p className="text-xs text-indigo-700 dark:text-indigo-400 mt-1.5 leading-relaxed">{t('card.info_desc', { defaultValue: 'Use your balance across any game or server. Credits are only consumed when your server is running.' })}</p></div></div></div>
        </div>

        {/* 2. RECURRING SUBSCRIPTION CARD */}
        <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-sm border border-gray-200 dark:border-slate-700 p-6 md:p-8 mb-10 flex flex-col xl:flex-row xl:items-center justify-between gap-6">
          <div className="flex items-start gap-4 flex-1">
            <div className="p-3 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-2xl shrink-0">
              <ArrowPathIcon className="w-8 h-8" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-1">
                {t('subscription.title', { defaultValue: 'Monthly Auto-Refill' })}
              </h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 max-w-lg">
                {t('subscription.description', { defaultValue: 'Never worry about your reserved servers pausing. Automatically add credits to your balance every 30 days.' })}
              </p>
            </div>
          </div>

          <div className="w-full xl:w-auto flex flex-col bg-gray-50 dark:bg-slate-900/50 p-4 rounded-2xl border border-gray-100 dark:border-slate-700 transition-all">
            {subscriptionId ? (
              <>
                {/* --- EDIT MODE --- */}
                {isEditingSub ? (
                  <div className="flex flex-col w-full xl:w-auto">
                    <div className="flex flex-col sm:flex-row items-center gap-3 animate-in fade-in duration-200 w-full xl:w-auto">
                        <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-slate-500">{t('subscription.amount_label', { defaultValue: 'Amount (€):' })}</span>
                        <input
                            type="number"
                            min="5" max="200" step="0.01" 
                            value={editSubAmount}
                            onChange={(e) => setEditSubAmount(Number(e.target.value))}
                            className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-lg text-sm font-bold py-2 px-3 focus:ring-indigo-500 dark:text-white w-24 text-center shadow-inner"
                        />
                        </div>
                        <div className="flex items-center gap-2 w-full sm:w-auto">
                        <button
                            onClick={handleUpdateSubscription}
                            disabled={subUpdateLoading || editSubAmount < 5 || editSubAmount > 200}
                            className="flex-1 sm:flex-none px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold shadow-md transition-all disabled:opacity-50 flex justify-center items-center"
                        >
                            {subUpdateLoading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : t('actions.save', { defaultValue: 'Save' })}
                        </button>
                        <button
                            onClick={() => setIsEditingSub(false)}
                            disabled={subUpdateLoading}
                            className="flex-1 sm:flex-none px-4 py-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-700 rounded-xl text-sm font-bold transition-all disabled:opacity-50"
                        >
                            {t('actions.cancel', { defaultValue: 'Cancel' })}
                        </button>
                        </div>
                    </div>
                    {editSubAmount < 5 || editSubAmount > 200 ? (
                        <span className="text-xs text-red-500 mt-2 text-center sm:text-left">{t('subscription.amount_limit_error', { defaultValue: 'Must be between €5 and €200' })}</span>
                    ) : null}
                    {/* CONVERSION RATE HELPER */}
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-3 w-full text-center sm:text-left flex items-center justify-center sm:justify-start gap-1.5">
                        <SparklesIcon className="w-3.5 h-3.5 text-indigo-500" />
                        {t('subscription.conversion_rate', { defaultValue: '1€ = 100 Credits. You will receive' })} <strong className="text-indigo-600 dark:text-indigo-400">{(editSubAmount * 100).toLocaleString()} {t('subscription.credits_label', { defaultValue: 'Credits' })}</strong> {t('subscription.per_month', { defaultValue: '/ month' })}.
                    </p>
                  </div>
                ) : (
                  /* --- VIEW MODE --- */
                  <div className="flex flex-col sm:flex-row items-center w-full justify-between xl:justify-end gap-4">
                    <div className="flex items-center gap-4">
                        <div className="text-center sm:text-left">
                        <p className="text-xs font-bold text-green-600 dark:text-green-400 uppercase tracking-widest flex items-center justify-center sm:justify-start gap-1 mb-1">
                            <CheckCircleIcon className="w-4 h-4" /> {t('subscription.active', { defaultValue: 'Active' })}
                        </p>
                        <p className="font-bold text-slate-900 dark:text-white">
                            €{Number(recurringAmount).toFixed(2)} {t('subscription.per_month', { defaultValue: '/ month' })}
                            <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-bold ml-2 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-800 px-2 py-0.5 rounded-full inline-block mt-1 sm:mt-0">
                                {(recurringAmount * 100).toLocaleString()} {t('subscription.credits_label', { defaultValue: 'Credits' })}
                            </span>
                        </p>
                        </div>
                        
                        <div className="w-px h-10 bg-gray-200 dark:bg-slate-700 hidden sm:block"></div>
                        
                        <div className="text-center sm:text-left pr-2">
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center justify-center sm:justify-start gap-1 mb-1">
                            <CalendarIcon className="w-4 h-4" /> {t('subscription.next_billing', { defaultValue: 'Next Due' })}
                        </p>
                        <p className="font-bold text-slate-900 dark:text-white">{getNextBillingDate()}</p>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto mt-2 sm:mt-0">
                      <button
                        onClick={handleOpenPortal}
                        disabled={portalLoading}
                        className="flex-1 sm:flex-none px-3 py-2 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 rounded-xl text-sm font-bold transition-all flex justify-center items-center gap-1.5 shadow-sm disabled:opacity-50"
                      >
                        {portalLoading ? <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" /> : <CreditCardIcon className="w-4 h-4" />}
                        <span className="hidden sm:inline">{t('subscription.manage_billing', { defaultValue: 'Manage Billing' })}</span>
                        <span className="sm:hidden">{t('actions.manage', { defaultValue: 'Manage' })}</span>
                      </button>

                      <button
                        onClick={() => { setEditSubAmount(recurringAmount); setIsEditingSub(true); }}
                        className="flex-1 sm:flex-none px-3 py-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-700 rounded-xl text-sm font-bold transition-all flex justify-center items-center gap-1.5 shadow-sm"
                      >
                        <PencilIcon className="w-4 h-4" />
                        <span className="hidden sm:inline">{t('actions.edit', { defaultValue: 'Edit' })}</span>
                      </button>

                      <button
                        onClick={handleCancelSubscription}
                        disabled={subCancelLoading}
                        className="flex-1 sm:flex-none px-3 py-2 bg-white dark:bg-slate-800 border border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl text-sm font-bold transition-all disabled:opacity-50 shadow-sm"
                      >
                        {subCancelLoading ? '...' : <span className="hidden sm:inline">{t('subscription.cancel', { defaultValue: 'Cancel' })}</span>}
                        {subCancelLoading ? '' : <span className="sm:hidden">{t('actions.cancel', { defaultValue: 'Cancel' })}</span>}
                      </button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="flex flex-col w-full xl:w-auto">
                  <div className="flex flex-col sm:flex-row gap-3 w-full items-center">
                    <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-500">{t('subscription.amount_label', { defaultValue: 'Amount (€):' })}</span>
                    <input
                        type="number"
                        min="5" max="200" step="0.01" 
                        value={selectedSubAmount}
                        onChange={(e) => setSelectedSubAmount(Number(e.target.value))}
                        className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-lg text-sm font-bold py-2 px-3 focus:ring-indigo-500 dark:text-white w-24 text-center"
                    />
                    </div>
                    
                    <button
                    onClick={handleSubscribe}
                    disabled={subCheckoutLoading || selectedSubAmount < 5 || selectedSubAmount > 200}
                    className="w-full sm:w-auto px-6 py-2.5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-indigo-50 rounded-xl text-sm font-bold shadow-md transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                    {subCheckoutLoading ? <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" /> : null}
                    {t('subscription.subscribe', { defaultValue: 'Subscribe' })}
                    </button>
                  </div>
                  {selectedSubAmount < 5 || selectedSubAmount > 200 ? (
                    <span className="text-xs text-red-500 mt-2 text-center sm:text-left">{t('subscription.amount_limit_error', { defaultValue: 'Must be between €5 and €200' })}</span>
                  ) : null}
                  {/* CONVERSION RATE HELPER */}
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-3 w-full text-center sm:text-left flex items-center justify-center sm:justify-start gap-1.5">
                    <SparklesIcon className="w-3.5 h-3.5 text-indigo-500" />
                    {t('subscription.conversion_rate', { defaultValue: '1€ = 100 Credits. You will receive' })} <strong className="text-indigo-600 dark:text-indigo-400">{(selectedSubAmount * 100).toLocaleString()} {t('subscription.credits_label', { defaultValue: 'Credits' })}</strong> {t('subscription.per_month', { defaultValue: '/ month' })}.
                  </p>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-6">{t('history.title', { defaultValue: 'Transaction History' })}</h2>
          {loadingData ? <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-10 w-10 border-4 border-indigo-600 border-t-transparent"></div></div> : error ? <div className="bg-red-50 text-red-700 p-4 rounded-xl border border-red-200 text-center">{error}</div> : transactions.length === 0 ? <div className="text-center py-20 bg-white dark:bg-slate-800 rounded-3xl border border-dashed border-gray-200 dark:border-slate-700"><ReceiptRefundIcon className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" /><p className="text-gray-500 dark:text-gray-400 font-medium">{t('history.empty', { defaultValue: 'No transactions found.' })}</p></div> : <div className="space-y-4">{groupedTransactions().map((item) => <HistoryItem key={item.id} item={item} />)}</div>}
        </div>
      </main>

      <Footer />

      {/* --- BUY MODAL (ONE TIME) --- */}
      {isBuyModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4 bg-slate-950/70 backdrop-blur-md transition-all">
          <div className="bg-white dark:bg-slate-900 sm:rounded-[2.5rem] shadow-2xl w-full sm:max-w-4xl h-[100dvh] sm:h-auto sm:max-h-[95vh] overflow-y-auto sm:overflow-hidden border-0 sm:border border-gray-100 dark:border-slate-800 relative animate-in fade-in zoom-in duration-300 flex flex-col md:flex-row">
            
            {/* LEFT SIDE: SELECTION */}
            <div className="w-full md:flex-1 p-5 md:p-10 bg-white dark:bg-slate-900 md:overflow-y-auto">
                <div className="flex justify-between items-start mb-6">
                    <div>
                        <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">{t('modal.title', { defaultValue: 'Add Credits' })}</h2>
                        <p className="text-slate-500 dark:text-slate-400 text-sm font-medium mt-1">{t('modal.subtitle', { defaultValue: 'Select an amount to recharge.' })}</p>
                    </div>
                    <button onClick={() => setIsBuyModalOpen(false)} className="md:hidden p-2 bg-slate-100 dark:bg-slate-800 rounded-full text-slate-500 hover:bg-slate-200"><XMarkIcon className="w-6 h-6" /></button>
                </div>

                <div className="bg-indigo-50 dark:bg-indigo-900/10 rounded-3xl p-6 md:p-8 mb-8 text-center border border-indigo-100 dark:border-indigo-900/30">
                    <div className={`inline-block px-4 py-1.5 rounded-full mb-4 transition-colors ${bonusGet > 0 ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400' : 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-400'}`}>
                        <span className="text-xs font-bold uppercase tracking-widest">
                            {bonusGet > 0 ? t('modal.bonus_active', { percent: activePercent }) : t('modal.current_offer', { defaultValue: 'Current Offer' })}
                        </span>
                    </div>
                    <div className="flex items-center justify-center gap-2 mb-2"><span className="text-5xl md:text-6xl font-black text-slate-900 dark:text-white tracking-tighter">{totalGet.toLocaleString()}</span></div>
                    <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">{t('modal.credits_received', { defaultValue: 'Credits Received' })}</p>
                    {bonusGet > 0 && (
                        <div className="mt-4 text-xs font-medium text-green-600 dark:text-green-400 flex items-center justify-center gap-1">
                            <SparklesIcon className="w-4 h-4" />
                            <span>{t('modal.bonus_breakdown', { base: Math.round(depositAmount * 100), bonus: bonusGet, defaultValue: 'Base: {{base}} + Bonus: {{bonus}}' })}</span>
                        </div>
                    )}
                </div>

                <div className="mb-8">
                    <div className="flex justify-between text-xs font-bold text-gray-400 uppercase mb-4 tracking-widest"><span>3€</span><span>{t('modal.drag_adjust', { defaultValue: 'Drag to Adjust' })}</span><span>50€</span></div>
                    <input type="range" min="3" max="50" step="0.01" value={depositAmount} onChange={(e) => setDepositAmount(Number(e.target.value))} className="w-full h-6 bg-slate-100 dark:bg-slate-800 rounded-full appearance-none cursor-pointer accent-indigo-600 hover:accent-indigo-500 transition-all touch-action-manipulation" />
                </div>

                <div>
                    <p className="text-xs font-bold text-gray-400 uppercase mb-3 tracking-widest">{t('modal.quick_select', { defaultValue: 'Quick Select' })}</p>
                    <div className="grid grid-cols-4 gap-3">
                        {[5, 10, 20, 50].map((amt) => (
                        <button key={amt} onClick={() => setDepositAmount(amt)} className={`py-2.5 rounded-xl border font-bold text-sm transition-all transform active:scale-95 ${depositAmount === amt ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:border-indigo-300'}`}>€{amt}</button>
                        ))}
                    </div>
                </div>
            </div>

            {/* RIGHT SIDE: CHECKOUT */}
            <div className="w-full md:w-[400px] bg-slate-50 dark:bg-slate-950/50 border-t md:border-t-0 md:border-l border-gray-100 dark:border-slate-800 p-5 md:p-8 flex flex-col md:overflow-y-auto">
                <button onClick={() => setIsBuyModalOpen(false)} className="hidden md:block self-end p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors mb-4"><XMarkIcon className="w-6 h-6" /></button>

                <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-6 flex items-center gap-2"><CreditCardIcon className="w-5 h-5 text-indigo-500" />{t('checkout.summary_title', { defaultValue: 'Checkout Summary' })}</h3>

                <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-3 mb-6 shadow-sm">
                    <div className="flex justify-between text-sm"><span className="text-slate-500 dark:text-slate-400">{t('checkout.amount', { defaultValue: 'Amount' })}</span><span className="font-mono text-slate-900 dark:text-white">€{depositAmount.toFixed(2)}</span></div>
                    {bonusGet > 0 && <div className="flex justify-between text-sm text-green-600 dark:text-green-400"><span>{t('checkout.bonus_applied', { defaultValue: 'Bonus Applied' })}</span><span className="font-mono">+{activePercent}%</span></div>}
                    <div className="h-px bg-slate-100 dark:bg-slate-800 my-2" />
                    <div className="flex justify-between items-center"><span className="font-bold text-slate-900 dark:text-white">{t('checkout.total', { defaultValue: 'Total Due' })}</span><span className="text-2xl font-black text-indigo-600 dark:text-indigo-400">€{depositAmount.toFixed(2)}</span></div>
                </div>

                <div className="mt-auto pb-4 md:pb-0">
                    {!clientSecret ? (
                         <>
                             <div className="flex items-start gap-3 mb-6 p-3 bg-slate-100 dark:bg-slate-800/80 rounded-lg border border-slate-200 dark:border-slate-700">
                                <div className="flex items-center h-5 mt-0.5"><input id="eu-refund-waiver" type="checkbox" checked={agreedToRefundWaiver} onChange={(e) => setAgreedToRefundWaiver(e.target.checked)} className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500 dark:bg-slate-700 dark:border-slate-600 cursor-pointer" /></div>
                                <div className="ml-1 text-xs leading-relaxed"><label htmlFor="eu-refund-waiver" className="font-medium text-slate-600 dark:text-slate-300 cursor-pointer">{t('checkout.refund_waiver', { defaultValue: 'I acknowledge that by purchasing immediate access to digital credits, I waive my 14-day right of withdrawal under EU consumer protection regulations.' })}</label></div>
                             </div>
                             <button onClick={handleInitiatePayment} disabled={depositAmount < 3 || depositAmount > 50 || !agreedToRefundWaiver} className="w-full py-4 bg-slate-900 dark:bg-white hover:bg-slate-800 dark:hover:bg-indigo-50 disabled:opacity-50 disabled:cursor-not-allowed text-white dark:text-slate-900 font-bold rounded-xl shadow-lg transition-all flex justify-center items-center gap-3 transform active:scale-95">{t('checkout.continue_btn', { defaultValue: 'Continue to Payment' })}</button>
                         </>
                    ) : (
                        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                             <div className="flex items-center justify-between mb-4"><span className="text-xs font-bold uppercase text-slate-400 tracking-wider">{t('checkout.payment_details', { defaultValue: 'Payment Details' })}</span><button onClick={() => setClientSecret(null)} className="text-xs text-indigo-500 hover:underline">{t('checkout.change_amount', { defaultValue: 'Change Amount' })}</button></div>
                             <Elements stripe={stripePromise} options={{ clientSecret, appearance: { theme: 'stripe', variables: { colorPrimary: '#4f46e5', fontSizeBase: '14px' } } }}>
                                <CheckoutForm amount={depositAmount} onSuccess={() => setIsBuyModalOpen(false)} onError={(msg) => alert(msg)} t={t} />
                             </Elements>
                        </div>
                    )}
                    <p className="text-center text-[10px] text-slate-400 mt-4 flex items-center justify-center gap-1"><ShieldCheckIcon className="w-3 h-3" />{t('checkout.secure_msg', { defaultValue: 'Payments are securely processed by Stripe.' })}</p>
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