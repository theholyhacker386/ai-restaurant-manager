"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";

/* eslint-disable @typescript-eslint/no-explicit-any */

export default function ProfilePage() {
  const { data: session } = useSession();
  const [pin, setPin] = useState("");
  const [hasPin, setHasPin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    checkPin();
  }, []);

  async function checkPin() {
    try {
      const res = await fetch("/api/auth/pin");
      if (res.ok) {
        const data = await res.json();
        setHasPin(data.hasPin);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  async function handleSetPin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setSaving(true);

    try {
      const res = await fetch("/api/auth/pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Something went wrong");
        setSaving(false);
        return;
      }

      setSuccess("PIN set! You can now use it to log in quickly.");
      setHasPin(true);
      setPin("");
    } catch {
      setError("Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  async function handleRemovePin() {
    if (!confirm("Remove your PIN? You'll need to use email + password to log in.")) return;

    setError("");
    setSuccess("");

    try {
      const res = await fetch("/api/auth/pin", { method: "DELETE" });
      if (res.ok) {
        setSuccess("PIN removed.");
        setHasPin(false);
      }
    } catch {
      setError("Something went wrong");
    }
  }

  return (
    <div className="pb-8">
      <div className="mb-4">
        <h2 className="text-lg font-bold text-foreground">My Profile</h2>
        <p className="text-xs text-muted">Manage your account settings</p>
      </div>

      {/* User info */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-porch-brown/10 flex items-center justify-center">
            <span className="text-lg font-bold text-porch-brown">
              {(session?.user?.name || "?")[0].toUpperCase()}
            </span>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">{session?.user?.name}</h3>
            <p className="text-xs text-muted">{session?.user?.email}</p>
            <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-blue-100 text-blue-700 mt-1 inline-block">
              {(session?.user as any)?.role === "owner" ? "Owner" : "Manager"}
            </span>
          </div>
        </div>
      </div>

      {/* Messages */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}
      {success && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 mb-4">
          <p className="text-sm text-emerald-700">{success}</p>
        </div>
      )}

      {/* PIN section */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <h3 className="text-sm font-semibold text-foreground mb-1">Quick PIN Login</h3>
        <p className="text-xs text-muted mb-3">
          Set a 4-6 digit PIN so you can log in quickly without typing your email and password every time.
        </p>

        {loading ? (
          <div className="flex justify-center py-4">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-porch-brown" />
          </div>
        ) : hasPin ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-emerald-600">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
              </svg>
              <span className="text-sm text-emerald-700 font-medium">PIN is set</span>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setHasPin(false)}
                className="flex-1 text-sm font-medium py-2.5 rounded-lg border border-gray-200 text-porch-brown hover:bg-gray-50 transition-colors"
              >
                Change PIN
              </button>
              <button
                onClick={handleRemovePin}
                className="text-sm font-medium px-4 py-2.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition-colors"
              >
                Remove
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSetPin} className="space-y-3">
            <div>
              <label htmlFor="pin" className="block text-xs font-medium text-muted mb-1">
                Enter a 4-6 digit PIN
              </label>
              <input
                id="pin"
                type="tel"
                inputMode="numeric"
                pattern="[0-9]{4,6}"
                required
                maxLength={6}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-center text-2xl tracking-[0.5em] font-mono focus:outline-none focus:ring-2 focus:ring-porch-brown/30"
                placeholder="• • • •"
              />
            </div>
            <button
              type="submit"
              disabled={saving || pin.length < 4}
              className="w-full bg-porch-brown text-white text-sm font-medium py-2.5 rounded-lg hover:bg-porch-brown/90 disabled:opacity-50 transition-colors"
            >
              {saving ? "Setting PIN..." : "Set PIN"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
