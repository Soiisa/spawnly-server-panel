import { useState } from "react";
import { supabase } from "../lib/supabaseClient";
import Link from "next/link";
import { useRouter } from "next/router";

export default function Register() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const router = useRouter();

  const handleRegister = async (e) => {
    e.preventDefault();
    setBusy(true);
    setMessage("");

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    });

    setBusy(false);

    if (error) {
      // This handles "already registered" and other errors
      setMessage(error.message);
    } else {
      setMessage("Account created! Check your email to confirm.");
      // Optional: redirect to login after a delay
      setTimeout(() => router.push("/login"), 2000);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-r from-teal-400 to-blue-500">
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full">
        <h1 className="text-3xl font-bold text-center text-gray-800 mb-6">
          Create your account
        </h1>

        <form onSubmit={handleRegister} className="space-y-5">
          <div>
            <label className="block text-gray-600">Email</label>
            <input
              type="email"
              className="mt-2 w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="block text-gray-600">Password</label>
            <input
              type="password"
              className="mt-2 w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <button
            type="submit"
            disabled={busy}
            className="w-full py-2 bg-teal-500 hover:bg-teal-600 text-white font-semibold rounded-lg disabled:opacity-50 transition-colors"
          >
            {busy ? "Creating..." : "Create Account"}
          </button>

          {message && <p className="text-center text-red-500">{message}</p>}
        </form>

        <p className="mt-6 text-center text-gray-600">
          Already have an account?{" "}
          <Link href="/login" className="text-teal-500 font-semibold hover:underline">
            Login
          </Link>
        </p>
      </div>
    </div>
  );
}
