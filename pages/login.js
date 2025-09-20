import { useState } from "react";
import { supabase } from "../lib/supabaseClient";
import Link from "next/link";
import { useRouter } from "next/router";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const router = useRouter();

  const handleLogin = async (e) => {
  e.preventDefault();
  setBusy(true);
  setMessage("");

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  setBusy(false);

  if (error) {
    setMessage(error.message);
  } else {
    router.push("/dashboard");
  }
};

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-r from-purple-500 to-pink-500">
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full">
        <h1 className="text-3xl font-bold text-center text-gray-800 mb-6">
          Login to your account
        </h1>

        <form onSubmit={handleLogin} className="space-y-5">
          <div>
            <label className="block text-gray-600">Email</label>
            <input
              type="email"
              className="mt-2 w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="block text-gray-600">Password</label>
            <input
              type="password"
              className="mt-2 w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <button
            type="submit"
            disabled={busy}
            className="w-full py-2 bg-purple-500 hover:bg-purple-600 text-white font-semibold rounded-lg disabled:opacity-50 transition-colors"
          >
            {busy ? "Logging in..." : "Login"}
          </button>

          {message && <p className="text-center text-red-500">{message}</p>}
        </form>

        <p className="mt-6 text-center text-gray-600">
          Don’t have an account?{" "}
          <Link href="/register" className="text-purple-500 font-semibold hover:underline">
            Register
          </Link>
        </p>
      </div>
    </div>
  );
}
