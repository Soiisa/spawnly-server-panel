// pages/Credits.js

import { useState, useEffect } from "react";
import { supabase } from "../lib/supabaseClient"; // Adjust path if needed
import { useRouter } from "next/router";

export default function CreditsPage() {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const router = useRouter();

  useEffect(() => {
    const checkAuthAndFetch = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push("/login"); // Redirect to login if not authenticated
        return;
      }

      try {
        const { data, error } = await supabase
          .from("credit_transactions")
          .select("id, amount, type, description, created_at")
          .eq("user_id", session.user.id)
          .order("created_at", { ascending: false })
          .limit(50); // Limit to recent 50 transactions

        if (error) {
          console.error("Error fetching transactions:", error.message);
          setError("Failed to load transactions");
          setLoading(false);
          return;
        }

        setTransactions(data || []);
        setLoading(false);
      } catch (err) {
        console.error("Unexpected error:", err.message);
        setError("An unexpected error occurred");
        setLoading(false);
      }
    };

    checkAuthAndFetch();
  }, [router]);

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleString("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  };

  const parseUsage = (description) => {
    if (!description) return {};
    // Try to extract server id and seconds from known description formats
    // Examples:
    // "Runtime charge for server <id> (300 seconds)"
    // "Final runtime charge for server <id> (487 seconds)"
    const serverMatch = description.match(/server\s+([a-f0-9-]{8,36})/i);
    const secondsMatch = description.match(/(\d+)\s*seconds/i);
    return {
      serverId: serverMatch ? serverMatch[1] : null,
      seconds: secondsMatch ? parseInt(secondsMatch[1], 10) : null,
      raw: description,
    };
  };

  const fmtSeconds = (s) => {
    if (s == null) return null;
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins}m ${secs}s`;
  };

  const renderUsageCell = (description) => {
    const { serverId, seconds, raw } = parseUsage(description || "");
    return (
      <div>
        {serverId ? (
          <a href={`/server/${serverId}`} className="text-indigo-600 hover:underline">
            Server {serverId.slice(0, 8)}
          </a>
        ) : (
          <span className="text-gray-600">—</span>
        )}
        <div className="text-sm text-gray-500">
          {seconds != null ? fmtSeconds(seconds) : raw || "-"}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="max-w-5xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Credits & Transactions</h1>
          <button
            className="bg-indigo-900 text-white px-4 py-2 rounded opacity-50 cursor-not-allowed"
            disabled
            title="Coming soon"
          >
            Buy Credits
          </button>
        </div>

        <div className="bg-white shadow rounded-lg p-6">
          {loading ? (
            <div className="flex justify-center items-center py-8">
              <svg
                className="animate-spin h-8 w-8 text-indigo-600"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                ></circle>
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                ></path>
              </svg>
            </div>
          ) : error ? (
            <p className="text-red-600 text-center py-4">{error}</p>
          ) : transactions.length === 0 ? (
            <p className="text-gray-500 text-center py-4">No transactions found.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Date
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Type
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Amount
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Server / Usage
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {transactions.map((tx) => (
                    <tr key={tx.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {formatDate(tx.created_at)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 capitalize">
                        {tx.type}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {tx.amount > 0 ? `+${tx.amount.toFixed(2)}` : tx.amount.toFixed(2)} credits
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900">
                        {renderUsageCell(tx.description)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}