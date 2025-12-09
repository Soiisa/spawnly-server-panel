// pages/credits.js
import { useState, useEffect } from "react";
import React from 'react';
import { supabase } from "../lib/supabaseClient";
import { useRouter } from "next/router";
import Header from "../components/ServersHeader";
import Footer from "../components/ServersFooter";
import { 
  CurrencyDollarIcon, 
  ClockIcon, 
  ServerIcon, 
  ReceiptRefundIcon,
  ChevronDownIcon,
  ChevronUpIcon
} from '@heroicons/react/24/outline';

export default function CreditsPage() {
  const router = useRouter();
  
  // Data State
  const [user, setUser] = useState(null);
  const [credits, setCredits] = useState(0);
  const [transactions, setTransactions] = useState([]);
  
  // Loading State
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push("/login");
        return;
      }

      setUser(session.user);

      try {
        // 1. Fetch Profile (Credits)
        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("credits")
          .eq("id", session.user.id)
          .single();
        
        if (profileError) throw profileError;
        setCredits(profile?.credits || 0);

        // 2. Fetch Transactions
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
  }, [router]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  // --- Logic for Grouping & Display ---

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString("en-US", {
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
    if (hrs > 0) return `${hrs}h ${mins}m`;
    return `${mins}m ${s % 60}s`;
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

    // Process Sessions
    sessionMap.forEach((txs, sessionId) => {
      // Sort internal txs by time asc
      txs.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
      
      const totalAmount = txs.reduce((sum, t) => sum + t.amount, 0);
      const totalSeconds = txs.reduce((sum, t) => sum + (parseUsage(t.description).seconds || 0), 0);
      const { serverId } = parseUsage(txs[0].description);
      
      groups.push({
        id: sessionId,
        isSession: true,
        date: txs[txs.length - 1].created_at, // Use latest date for sorting
        startDate: txs[0].created_at,
        endDate: txs[txs.length - 1].created_at,
        amount: totalAmount,
        details: txs,
        meta: { serverId, totalSeconds }
      });
    });

    // Process Singles
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

    // Final Sort: Newest first
    return groups.sort((a, b) => new Date(b.date) - new Date(a.date));
  };

  const HistoryItem = ({ item }) => {
    const [isOpen, setIsOpen] = useState(false);
    const isNegative = item.amount < 0;
    
    // Session Row
    if (item.isSession) {
      return (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden hover:shadow-sm transition-shadow">
          <div 
            onClick={() => setIsOpen(!isOpen)}
            className="flex items-center justify-between p-4 cursor-pointer bg-white hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center gap-4">
              <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                <ServerIcon className="w-6 h-6" />
              </div>
              <div>
                <h4 className="font-semibold text-gray-900">
                  Session Runtime 
                  <span className="ml-2 text-xs font-normal text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                    {fmtSeconds(item.meta.totalSeconds)}
                  </span>
                </h4>
                <div className="text-sm text-gray-500 flex items-center gap-2">
                  <span>{formatDate(item.startDate)}</span>
                  <span>&rarr;</span>
                  <span>{formatDate(item.endDate)}</span>
                </div>
                {item.meta.serverId && (
                  <p className="text-xs text-gray-400 mt-0.5 font-mono">ID: {item.meta.serverId.split('-')[0]}...</p>
                )}
              </div>
            </div>
            
            <div className="flex items-center gap-4">
              <span className="font-bold text-gray-900">
                {item.amount.toFixed(4)} <span className="text-xs font-normal text-gray-500">credits</span>
              </span>
              {isOpen ? <ChevronUpIcon className="w-5 h-5 text-gray-400" /> : <ChevronDownIcon className="w-5 h-5 text-gray-400" />}
            </div>
          </div>

          {isOpen && (
            <div className="bg-gray-50 border-t border-gray-100 px-4 py-3 space-y-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Detailed Charges</p>
              {item.details.map((tx) => (
                <div key={tx.id} className="flex justify-between text-sm text-gray-600 pl-4 border-l-2 border-indigo-200">
                  <span>{formatDate(tx.created_at)}</span>
                  <span className="font-mono">{tx.amount.toFixed(4)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }

    // Single Transaction Row
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-4 flex items-center justify-between hover:shadow-sm transition-shadow">
        <div className="flex items-center gap-4">
          <div className={`p-2 rounded-lg ${!isNegative ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-600'}`}>
            {!isNegative ? <CurrencyDollarIcon className="w-6 h-6" /> : <ReceiptRefundIcon className="w-6 h-6" />}
          </div>
          <div>
            <h4 className="font-semibold text-gray-900 capitalize">
              {item.type === 'usage' ? 'Manual Deduction' : item.type}
            </h4>
            <p className="text-sm text-gray-500">{formatDate(item.date)}</p>
            <p className="text-xs text-gray-400 mt-0.5">{item.description}</p>
          </div>
        </div>
        <span className={`font-bold ${!isNegative ? 'text-green-600' : 'text-gray-900'}`}>
          {item.amount > 0 ? '+' : ''}{item.amount.toFixed(2)} <span className="text-xs font-normal text-gray-500">credits</span>
        </span>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans text-slate-900">
      <Header user={user} credits={credits} isLoading={loadingData} onLogout={handleLogout} />

      <main className="flex-grow w-full max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {/* Page Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Billing & Credits</h1>
            <p className="text-gray-600 mt-1">Manage your balance and view usage history</p>
          </div>
          <button
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl font-semibold shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            disabled
            title="Payment integration coming soon"
          >
            <CurrencyDollarIcon className="w-5 h-5" />
            Buy Credits
          </button>
        </div>

        {/* Balance Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 mb-8 flex flex-col sm:flex-row items-center justify-between gap-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
            <CurrencyDollarIcon className="w-48 h-48 text-indigo-900" />
          </div>
          
          <div className="relative z-10">
            <p className="text-sm font-medium text-gray-500 uppercase tracking-wider">Current Balance</p>
            <p className="text-4xl font-bold text-indigo-900 mt-2">
              {loadingData ? "..." : credits.toFixed(2)} 
              <span className="text-lg font-medium text-gray-500 ml-2">credits</span>
            </p>
            <p className="text-sm text-gray-500 mt-2">
              ~€{(credits * 0.01).toFixed(2)} value
            </p>
          </div>

          <div className="relative z-10 bg-indigo-50 border border-indigo-100 rounded-xl p-4 max-w-sm">
            <div className="flex items-start gap-3">
              <ClockIcon className="w-5 h-5 text-indigo-600 mt-0.5" />
              <div>
                <h4 className="text-sm font-bold text-indigo-900">Real-time Billing</h4>
                <p className="text-xs text-indigo-700 mt-1 leading-relaxed">
                  Servers are billed per minute of runtime. Credits are deducted automatically while your server is running.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Transactions List */}
        <div className="space-y-4">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Transaction History</h2>
          
          {loadingData ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-10 w-10 border-4 border-indigo-600 border-t-transparent"></div>
            </div>
          ) : error ? (
            <div className="bg-red-50 text-red-700 p-4 rounded-xl border border-red-200 text-center">
              {error}
            </div>
          ) : transactions.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-gray-300">
              <ReceiptRefundIcon className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">No transactions found.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {groupedTransactions().map((item) => (
                <HistoryItem key={item.id} item={item} />
              ))}
            </div>
          )}
        </div>

      </main>

      <Footer />
    </div>
  );
}