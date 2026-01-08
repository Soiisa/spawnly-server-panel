// pages/pools/index.js
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../../lib/supabaseClient';
import { useTranslation } from 'next-i18next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import ServersHeader from '../../components/ServersHeader';
import ServersFooter from '../../components/ServersFooter';
import { PlusIcon, BanknotesIcon, TrashIcon } from '@heroicons/react/24/outline';

export default function PoolsPage() {
  const router = useRouter();
  const { t } = useTranslation('common');

  // --- Global State (User & Header) ---
  const [user, setUser] = useState(null);
  const [credits, setCredits] = useState(0); // Shared for Header & Deposit Modal
  const [loading, setLoading] = useState(true);

  // --- Pools State ---
  const [pools, setPools] = useState([]);
  const [newPoolName, setNewPoolName] = useState('');
  const [depositAmount, setDepositAmount] = useState('');
  const [selectedPool, setSelectedPool] = useState(null);

  // --- Data Fetching ---
  const fetchData = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session) {
      router.push("/login"); 
      return;
    }

    setUser(session.user);

    // 1. Fetch User Profile (Credits & Username)
    const { data: profile } = await supabase
      .from('profiles')
      .select('credits, username')
      .eq('id', session.user.id)
      .single();

    if (profile) {
      setCredits(profile.credits);
    }

    // 2. Fetch Pools
    const { data: poolsData } = await supabase
      .from('credit_pools')
      .select('*')
      .eq('owner_id', session.user.id)
      .order('created_at', { ascending: false });
    
    setPools(poolsData || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, [router]);

  // --- Actions ---
  const createPool = async () => {
    if(!newPoolName) return;
    const { error } = await supabase
      .from('credit_pools')
      .insert({ owner_id: user.id, name: newPoolName, balance: 0 });
    
    if (error) {
        alert('Error creating pool');
    } else {
        setNewPoolName('');
        fetchData(); // Refresh list
    }
  };

  const deletePool = async (id) => {
    if(!confirm("Are you sure? Any credits in this pool will be lost.")) return;
    await supabase.from('credit_pools').delete().eq('id', id);
    fetchData();
  };

  const handleDeposit = async () => {
    if (!selectedPool || !depositAmount) return;
    try {
        const { error } = await supabase.rpc('transfer_credits_to_pool', {
            p_pool_id: selectedPool,
            p_amount: Number(depositAmount)
        });
        if (error) throw error;
        
        alert('Deposit successful!');
        setDepositAmount('');
        setSelectedPool(null);
        fetchData(); // Refresh credits and pool balance
    } catch (e) {
        alert('Transfer failed: ' + e.message);
    }
  };

  if (loading) return null;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900 flex flex-col font-sans text-slate-900 dark:text-gray-100">
      <ServersHeader 
        user={user} 
        credits={credits} 
        isLoading={loading} 
        onLogout={() => supabase.auth.signOut()} 
      />
      
      <main className="flex-grow max-w-4xl w-full mx-auto px-4 py-12">
        <h1 className="text-3xl font-bold mb-2 flex items-center gap-3">
             <BanknotesIcon className="w-8 h-8 text-indigo-500" />
             {t('nav.pools', 'Credit Pools')}
        </h1>
        <p className="text-gray-500 dark:text-gray-400 mb-8">
            Create shared funds to keep your servers running together.
        </p>
        
        {/* Create Pool Form */}
        <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 mb-8">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <PlusIcon className="w-5 h-5" /> Create New Pool
            </h2>
            <div className="flex gap-4">
                <input 
                    type="text" 
                    placeholder="Pool Name (e.g. SMP Fund)" 
                    value={newPoolName}
                    onChange={e => setNewPoolName(e.target.value)}
                    className="flex-1 px-4 py-2 rounded-lg border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                />
                <button 
                    onClick={createPool} 
                    disabled={!newPoolName}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-lg flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                    Create
                </button>
            </div>
        </div>

        {/* List Pools */}
        <div className="space-y-4">
            {pools.length === 0 ? (
                <div className="text-center py-12 border-2 border-dashed border-gray-200 dark:border-slate-700 rounded-xl">
                    <p className="text-gray-500">No pools found. Create one to get started.</p>
                </div>
            ) : (
                pools.map(pool => (
                    <div key={pool.id} className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                        <div>
                            <h3 className="font-bold text-xl">{pool.name}</h3>
                            <div className="flex items-center gap-2 mt-1">
                                <span className="text-gray-500 dark:text-gray-400 text-sm">Balance:</span>
                                <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400 text-lg">{Number(pool.balance).toFixed(2)}</span>
                                <span className="text-xs text-gray-400">credits</span>
                            </div>
                            <p className="text-[10px] text-gray-400 font-mono mt-1">ID: {pool.id}</p>
                        </div>
                        <div className="flex items-center gap-3 w-full sm:w-auto">
                            <button 
                                onClick={() => deletePool(pool.id)}
                                className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                                title="Delete Pool"
                            >
                                <TrashIcon className="w-5 h-5" />
                            </button>
                            <button 
                                onClick={() => setSelectedPool(selectedPool === pool.id ? null : pool.id)}
                                className="flex-1 sm:flex-none border border-indigo-600 text-indigo-600 dark:text-indigo-400 dark:border-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                            >
                                Deposit Funds
                            </button>
                        </div>
                    </div>
                ))
            )}
        </div>

        {/* Deposit Modal */}
        {selectedPool && (
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
                <div className="bg-white dark:bg-slate-800 p-8 rounded-2xl max-w-md w-full shadow-2xl border border-gray-200 dark:border-slate-700">
                    <h3 className="text-xl font-bold mb-4">Deposit to Pool</h3>
                    <p className="mb-4 text-sm text-gray-600 dark:text-gray-300">
                        Transfer credits from your personal wallet to this shared pool.
                    </p>
                    <div className="mb-4 p-3 bg-gray-50 dark:bg-slate-900 rounded-lg border border-gray-100 dark:border-slate-700">
                        <p className="text-xs text-gray-500 dark:text-gray-400 uppercase">Your Personal Balance</p>
                        <p className="font-bold text-lg">{credits.toFixed(2)} Credits</p>
                    </div>

                    <input 
                        type="number" 
                        value={depositAmount}
                        onChange={e => setDepositAmount(e.target.value)}
                        className="w-full mb-4 px-4 py-2 rounded-lg border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                        placeholder="Amount to deposit"
                    />
                    <div className="flex gap-3 justify-end">
                        <button 
                            onClick={() => setSelectedPool(null)} 
                            className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 font-medium text-sm px-3 py-2"
                        >
                            Cancel
                        </button>
                        <button 
                            onClick={handleDeposit} 
                            className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-medium shadow-sm transition-colors"
                        >
                            Confirm Transfer
                        </button>
                    </div>
                </div>
            </div>
        )}
      </main>
      <ServersFooter />
    </div>
  );
}

export async function getStaticProps({ locale }) {
  return {
    props: {
      ...(await serverSideTranslations(locale, ['common'])),
    },
  };
}