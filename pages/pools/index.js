import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import Navbar from '../../components/Navbar';
import Footer from '../../components/Footer';
import { PlusIcon, BanknotesIcon, TrashIcon } from '@heroicons/react/24/outline';
import { useTranslation } from 'next-i18next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';

export default function PoolsPage() {
  const { t } = useTranslation('common');
  const [pools, setPools] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newPoolName, setNewPoolName] = useState('');
  const [depositAmount, setDepositAmount] = useState('');
  const [selectedPool, setSelectedPool] = useState(null);
  const [userCredits, setUserCredits] = useState(0);

  const fetchPools = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
        const { data } = await supabase.from('credit_pools').select('*').eq('owner_id', user.id).order('created_at', { ascending: false });
        setPools(data || []);
        
        const { data: profile } = await supabase.from('profiles').select('credits').eq('id', user.id).single();
        setUserCredits(profile?.credits || 0);
    }
    setLoading(false);
  };

  useEffect(() => { fetchPools(); }, []);

  const createPool = async () => {
    if(!newPoolName) return;
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from('credit_pools').insert({ owner_id: user.id, name: newPoolName, balance: 0 });
    if (error) {
        alert('Error creating pool');
    } else {
        setNewPoolName('');
        fetchPools();
    }
  };

  const deletePool = async (id) => {
    if(!confirm("Are you sure? Any credits in this pool will be lost (or you must manually withdraw them first implementation pending).")) return;
    await supabase.from('credit_pools').delete().eq('id', id);
    fetchPools();
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
        fetchPools();
    } catch (e) {
        alert('Transfer failed: ' + e.message);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900 flex flex-col font-sans">
      <Navbar />
      
      <main className="flex-grow max-w-4xl w-full mx-auto px-4 py-12">
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">Community Credit Pools</h1>
        <p className="text-gray-500 dark:text-gray-400 mb-8">Create shared funds to keep your servers running together.</p>
        
        {/* Create Pool */}
        <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 mb-8">
            <h2 className="text-lg font-semibold mb-4 dark:text-white flex items-center gap-2">
                <BanknotesIcon className="w-5 h-5" /> Create New Pool
            </h2>
            <div className="flex gap-4">
                <input 
                    type="text" 
                    placeholder="Pool Name (e.g. SMP Fund)" 
                    value={newPoolName}
                    onChange={e => setNewPoolName(e.target.value)}
                    className="flex-1 px-4 py-2 rounded-lg border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white focus:ring-2 focus:ring-indigo-500"
                />
                <button 
                    onClick={createPool} 
                    disabled={!newPoolName}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-lg flex items-center gap-2 disabled:opacity-50"
                >
                    <PlusIcon className="w-5 h-5" /> Create
                </button>
            </div>
        </div>

        {/* List Pools */}
        <div className="space-y-4">
            {loading ? <p className="text-center text-gray-500">Loading pools...</p> : pools.length === 0 ? (
                <div className="text-center py-12 border-2 border-dashed border-gray-200 dark:border-slate-700 rounded-xl">
                    <p className="text-gray-500">No pools found. Create one to get started.</p>
                </div>
            ) : (
                pools.map(pool => (
                    <div key={pool.id} className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 flex justify-between items-center">
                        <div>
                            <h3 className="font-bold text-xl dark:text-white">{pool.name}</h3>
                            <div className="flex items-center gap-2 mt-1">
                                <span className="text-gray-500 dark:text-gray-400 text-sm">Balance:</span>
                                <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400 text-lg">{Number(pool.balance).toFixed(2)}</span>
                                <span className="text-xs text-gray-400">credits</span>
                            </div>
                            <p className="text-[10px] text-gray-400 font-mono mt-1">ID: {pool.id}</p>
                        </div>
                        <div className="flex items-center gap-3">
                            <button 
                                onClick={() => deletePool(pool.id)}
                                className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                            >
                                <TrashIcon className="w-5 h-5" />
                            </button>
                            <button 
                                onClick={() => setSelectedPool(selectedPool === pool.id ? null : pool.id)}
                                className="border border-indigo-600 text-indigo-600 dark:text-indigo-400 dark:border-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                            >
                                Deposit Funds
                            </button>
                        </div>
                    </div>
                ))
            )}
        </div>

        {/* Deposit Modal / Inline */}
        {selectedPool && (
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
                <div className="bg-white dark:bg-slate-800 p-8 rounded-2xl max-w-md w-full shadow-2xl border border-gray-200 dark:border-slate-700">
                    <h3 className="text-xl font-bold mb-4 dark:text-white">Deposit to Pool</h3>
                    <p className="mb-4 text-sm text-gray-600 dark:text-gray-300">
                        Transfer credits from your personal wallet to this shared pool.
                    </p>
                    <div className="mb-4 p-3 bg-gray-50 dark:bg-slate-900 rounded-lg border border-gray-100 dark:border-slate-700">
                        <p className="text-xs text-gray-500 dark:text-gray-400 uppercase">Your Personal Balance</p>
                        <p className="font-bold text-lg dark:text-white">{userCredits.toFixed(2)} Credits</p>
                    </div>

                    <input 
                        type="number" 
                        value={depositAmount}
                        onChange={e => setDepositAmount(e.target.value)}
                        className="w-full mb-4 px-4 py-2 rounded-lg border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white focus:ring-2 focus:ring-indigo-500"
                        placeholder="Amount to deposit"
                    />
                    <div className="flex gap-3 justify-end">
                        <button onClick={() => setSelectedPool(null)} className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 font-medium text-sm">Cancel</button>
                        <button onClick={handleDeposit} className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-medium shadow-sm transition-colors">Confirm Transfer</button>
                    </div>
                </div>
            </div>
        )}
      </main>
      <Footer />
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