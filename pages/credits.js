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
          .select("id, amount, type, description, created_at, session_id") // Added session_id
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

  // New: Group transactions
  const groupedTransactions = () => {
    const groups = [];
    const sessionMap = new Map();
    const nonSession = [];

    transactions.forEach((tx) => {
      if (tx.session_id && tx.type === 'usage') {
        if (!sessionMap.has(tx.session_id)) {
          sessionMap.set(tx.session_id, []);
        }
        sessionMap.get(tx.session_id).push(tx);
      } else {
        nonSession.push(tx);
      }
    });

    sessionMap.forEach((txs, sessionId) => {
      // Sort txs by created_at asc for chronology
      txs.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

      const totalAmount = txs.reduce((sum, tx) => sum + tx.amount, 0);
      const totalSeconds = txs.reduce((sum, tx) => {
        const { seconds } = parseUsage(tx.description);
        return sum + (seconds || 0);
      }, 0);
      const startDate = formatDate(txs[0].created_at);
      const endDate = formatDate(txs[txs.length - 1].created_at);
      const serverId = parseUsage(txs[0].description).serverId;  // Assume consistent

      groups.push({
        sessionId,
        totalAmount,
        totalSeconds,
        startDate,
        endDate,
        serverId,
        details: txs,
      });
    });

    // Add non-session as individual "groups"
    nonSession.forEach((tx) => {
      const { seconds, serverId } = parseUsage(tx.description);
      groups.push({
        sessionId: null,
        totalAmount: tx.amount,
        totalSeconds: seconds || 0,
        startDate: formatDate(tx.created_at),
        endDate: formatDate(tx.created_at),
        serverId,
        details: [tx],
      });
    });

    // Sort groups by startDate desc
    groups.sort((a, b) => new Date(b.startDate) - new Date(a.startDate));
    return groups;
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
                  {groupedTransactions().map((group) => (
                    <React.Fragment key={group.sessionId || group.details[0].id}>
                      <tr>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {group.startDate} {group.startDate !== group.endDate ? `to ${group.endDate}` : ''}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 capitalize">
                          {group.details[0].type} Session
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {group.totalAmount > 0 ? `+${group.totalAmount.toFixed(2)}` : group.totalAmount.toFixed(2)} credits
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-900">
                          {group.serverId ? (
                            <details>
                              <summary className="cursor-pointer">
                                <a href={`/server/${group.serverId}`} className="text-indigo-600 hover:underline">
                                  Server {group.serverId.slice(0, 8)}
                                </a>
                                <div className="text-sm text-gray-500">
                                  {fmtSeconds(group.totalSeconds)}
                                </div>
                              </summary>
                              <ul className="mt-2 pl-4 list-disc text-sm text-gray-600">
                                {group.details.map((tx) => (
                                  <li key={tx.id}>
                                    {formatDate(tx.created_at)}: {tx.amount.toFixed(2)} credits ({fmtSeconds(parseUsage(tx.description).seconds) || tx.description})
                                  </li>
                                ))}
                              </ul>
                            </details>
                          ) : (
                            <span className="text-gray-600">—</span>
                          )}
                        </td>
                      </tr>
                    </React.Fragment>
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