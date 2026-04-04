// pages/admin/invoices.js
import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabaseClient';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { ArrowLeftIcon, CloudArrowUpIcon, DocumentCheckIcon } from "@heroicons/react/24/outline";

export default function AdminInvoices() {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTx, setActiveTx] = useState(null); // The transaction currently open in the modal
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);
  const router = useRouter();

  useEffect(() => {
    fetchPendingInvoices();
  }, []);

  const fetchPendingInvoices = async () => {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return router.push('/login');

    try {
      const res = await fetch('/api/admin/invoices/pending', {
        headers: { Authorization: `Bearer ${session.access_token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setTransactions(data);
      }
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileSelect = (e) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const sendInvoice = async () => {
    if (!file || !activeTx) return;
    setUploading(true);

    const { data: { session } } = await supabase.auth.getSession();
    const formData = new FormData();
    formData.append('file', file);
    formData.append('transaction_id', activeTx.id);
    formData.append('user_email', activeTx.user_email);

    try {
      const res = await fetch('/api/admin/invoices/send', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: formData
      });

      if (res.ok) {
        // Remove from list
        setTransactions(prev => prev.filter(tx => tx.id !== activeTx.id));
        closeModal();
      } else {
        const err = await res.json();
        alert(`Error: ${err.error}`);
      }
    } catch (e) {
      alert("Failed to send email");
    }
    setUploading(false);
  };

  const closeModal = () => {
    setActiveTx(null);
    setFile(null);
  };

  if (loading) return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-white">Loading Invoices...</div>;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white p-8">
      <div className="max-w-6xl mx-auto">
        <Link href="/admin" className="inline-flex items-center gap-2 text-indigo-600 mb-6 hover:underline">
          <ArrowLeftIcon className="w-4 h-4" /> Back to Dashboard
        </Link>
        
        <h1 className="text-2xl font-bold mb-2">Pending Invoices (Faturas)</h1>
        <p className="text-slate-500 mb-8">Upload and send the official AT PDF for recent deposits. Once sent, they disappear from this list.</p>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
          {transactions.length === 0 ? (
            <div className="p-12 text-center text-slate-500">
              <DocumentCheckIcon className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>All caught up! No pending invoices.</p>
            </div>
          ) : (
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th className="px-6 py-4 font-semibold text-slate-600 dark:text-slate-300">Date</th>
                  <th className="px-6 py-4 font-semibold text-slate-600 dark:text-slate-300">Client Email</th>
                  <th className="px-6 py-4 font-semibold text-slate-600 dark:text-slate-300">Amount (Credits)</th>
                  <th className="px-6 py-4 font-semibold text-slate-600 dark:text-slate-300">Description</th>
                  <th className="px-6 py-4 font-semibold text-slate-600 dark:text-slate-300 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-700/50">
                {transactions.map((tx) => (
                  <tr key={tx.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                    <td className="px-6 py-4 text-slate-500">{new Date(tx.created_at).toLocaleString()}</td>
                    <td className="px-6 py-4 font-medium text-indigo-600 dark:text-indigo-400">{tx.user_email}</td>
                    <td className="px-6 py-4 font-mono">{tx.amount} CR</td>
                    <td className="px-6 py-4 truncate max-w-xs">{tx.description}</td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => setActiveTx(tx)}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-xs font-semibold shadow-sm transition-colors"
                      >
                        Send Fatura
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Upload Modal */}
      {activeTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-800 p-8 rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 dark:border-slate-700">
            <h2 className="text-xl font-bold mb-1">Send Invoice</h2>
            <p className="text-sm text-slate-500 mb-6">To: <strong>{activeTx.user_email}</strong></p>

            <div 
              className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${file ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20' : 'border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700/50'}`}
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <input type="file" className="hidden" ref={fileInputRef} onChange={handleFileSelect} accept="application/pdf" />
              <CloudArrowUpIcon className={`w-10 h-10 mx-auto mb-3 ${file ? 'text-indigo-500' : 'text-slate-400'}`} />
              {file ? (
                <p className="text-indigo-600 dark:text-indigo-400 font-medium">{file.name}</p>
              ) : (
                <p className="text-slate-500 dark:text-slate-400">Click to browse or drag & drop the PDF here</p>
              )}
            </div>

            <div className="flex gap-3 mt-8">
              <button onClick={closeModal} disabled={uploading} className="flex-1 px-4 py-2 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 font-medium disabled:opacity-50">
                Cancel
              </button>
              <button onClick={sendInvoice} disabled={!file || uploading} className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium disabled:opacity-50 flex justify-center items-center">
                {uploading ? 'Sending...' : 'Send to Client'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}