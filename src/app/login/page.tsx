"use client";

import { useState } from "react";
import { loginWithCredentials, loginWithPin } from "./actions";

export default function LoginPage() {
  const [mode, setMode] = useState<"pin" | "email">("pin");
  const [pin, setPin] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function handlePinLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const result = await loginWithPin(pin);
      if (result?.error) {
        setError(result.error);
        setLoading(false);
      }
      // If no error, the server action redirects automatically
    } catch {
      // Redirect errors are handled by Next.js — this is expected on success
    }
  }

  async function handleEmailLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const result = await loginWithCredentials(email, password);
      if (result?.error) {
        setError(result.error);
        setLoading(false);
      }
      // If no error, the server action redirects automatically
    } catch {
      // Redirect errors are handled by Next.js — this is expected on success
    }
  }

  return (
    <div className="w-full max-w-sm">
      {/* Logo / Title */}
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold text-porch-brown">
          AI Restaurant Manager
        </h1>
        <p className="text-sm text-porch-brown-light mt-1">
          Restaurant Dashboard
        </p>
      </div>

      {/* Login Card */}
      <div className="bg-white rounded-xl shadow-lg p-6">
        {mode === "pin" ? (
          <>
            <h2 className="text-lg font-semibold text-porch-brown text-center mb-4">
              Enter Your PIN
            </h2>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2 mb-4">
                {error}
              </div>
            )}

            <form onSubmit={handlePinLogin} className="space-y-4">
              <div>
                <input
                  id="pin"
                  type="tel"
                  inputMode="numeric"
                  pattern="[0-9]{4,6}"
                  required
                  maxLength={6}
                  autoFocus
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  className="w-full px-3 py-4 border border-porch-cream-dark rounded-lg bg-porch-warm-white text-porch-brown text-center text-3xl tracking-[0.5em] font-mono focus:outline-none focus:ring-2 focus:ring-porch-brown focus:border-transparent"
                  placeholder="• • • •"
                />
              </div>

              <button
                type="submit"
                disabled={loading || pin.length < 4}
                className="w-full bg-porch-brown text-white py-2.5 rounded-lg font-medium hover:bg-porch-brown-light transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "Signing in..." : "Sign In"}
              </button>
            </form>

            <div className="mt-4 text-center">
              <button
                onClick={() => { setMode("email"); setError(""); }}
                className="text-xs text-porch-brown-light hover:text-porch-brown hover:underline"
              >
                Use email &amp; password instead
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 className="text-lg font-semibold text-porch-brown text-center mb-4">
              Sign In
            </h2>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2 mb-4">
                {error}
              </div>
            )}

            <form onSubmit={handleEmailLogin} className="space-y-4">
              <div>
                <label
                  htmlFor="email"
                  className="block text-sm font-medium text-porch-brown-light mb-1"
                >
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  autoCapitalize="none"
                  autoCorrect="off"
                  value={email}
                  onChange={(e) => setEmail(e.target.value.toLowerCase().trim())}
                  className="w-full px-3 py-2 border border-porch-cream-dark rounded-lg bg-porch-warm-white text-porch-brown focus:outline-none focus:ring-2 focus:ring-porch-brown focus:border-transparent"
                  placeholder="your@email.com"
                />
              </div>

              <div>
                <label
                  htmlFor="password"
                  className="block text-sm font-medium text-porch-brown-light mb-1"
                >
                  Password
                </label>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-3 py-2 pr-12 border border-porch-cream-dark rounded-lg bg-porch-warm-white text-porch-brown focus:outline-none focus:ring-2 focus:ring-porch-brown focus:border-transparent"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-porch-brown-light text-sm font-medium"
                  >
                    {showPassword ? "Hide" : "Show"}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-porch-brown text-white py-2.5 rounded-lg font-medium hover:bg-porch-brown-light transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "Signing in..." : "Sign In"}
              </button>
            </form>

            <div className="mt-4 text-center">
              <button
                onClick={() => { setMode("pin"); setError(""); }}
                className="text-xs text-porch-brown-light hover:text-porch-brown hover:underline"
              >
                Use PIN instead
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
