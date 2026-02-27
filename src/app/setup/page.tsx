"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

function SetupForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const [userRole, setUserRole] = useState("");

  useEffect(() => {
    if (!token) {
      setInvalid(true);
      setLoading(false);
      return;
    }

    fetch(`/api/auth/setup?token=${token}`)
      .then((res) => {
        if (!res.ok) {
          setInvalid(true);
          return null;
        }
        return res.json();
      })
      .then((data) => {
        if (data?.name) setName(data.name);
          if (data?.role) setUserRole(data.role);
      })
      .catch(() => setInvalid(true))
      .finally(() => setLoading(false));
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);

    try {
      const res = await fetch("/api/auth/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, pin }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Something went wrong");
        setSaving(false);
        return;
      }

      if (data.role) setUserRole(data.role);
      setDone(true);
    } catch {
      setError("Something went wrong. Please try again.");
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-porch-brown" />
      </div>
    );
  }

  if (invalid) {
    return (
      <div className="text-center space-y-3">
        <div className="text-4xl">🔗</div>
        <h2 className="text-lg font-semibold text-porch-brown">Invalid Link</h2>
        <p className="text-sm text-porch-brown-light">
          This setup link is invalid or has already been used. Ask your manager for a new one.
        </p>
      </div>
    );
  }

  if (done) {
    return (
      <div className="text-center space-y-3">
        <div className="text-4xl">&#9989;</div>
        <h2 className="text-lg font-semibold text-porch-brown">You&apos;re All Set!</h2>
        <p className="text-sm text-porch-brown-light">
          {userRole === "owner"
            ? "Your PIN is ready. Let's finish setting up your restaurant!"
            : "Your PIN is ready. Use it to log in from now on."}
        </p>
        <Link
          href={userRole === "owner" ? "/login" : "/login"}
          className="inline-block mt-2 bg-porch-brown text-white px-6 py-2.5 rounded-lg font-medium hover:bg-porch-brown-light transition-colors"
        >
          {userRole === "owner" ? "Continue Setup" : "Go to Login"}
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className="text-center mb-2">
        <h2 className="text-lg font-semibold text-porch-brown">
          Welcome, {name}!
        </h2>
        <p className="text-sm text-porch-brown-light mt-1">
          Pick a PIN to log in quickly each day.
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="pin"
            className="block text-sm font-medium text-porch-brown-light mb-1 text-center"
          >
            Choose a 4-6 digit PIN
          </label>
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
            className="w-full px-3 py-3 border border-porch-cream-dark rounded-lg bg-porch-warm-white text-porch-brown text-center text-3xl tracking-[0.5em] font-mono focus:outline-none focus:ring-2 focus:ring-porch-brown focus:border-transparent"
            placeholder="• • • •"
          />
          <p className="text-[11px] text-porch-brown-light text-center mt-1.5">
            Something easy to remember, like a birthday or lucky number
          </p>
        </div>

        <button
          type="submit"
          disabled={saving || pin.length < 4}
          className="w-full bg-porch-brown text-white py-2.5 rounded-lg font-medium hover:bg-porch-brown-light transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? "Saving..." : "Set My PIN"}
        </button>
      </form>
    </>
  );
}

export default function SetupPage() {
  return (
    <div className="w-full max-w-sm">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold text-porch-brown">
          The Porch Health Park
        </h1>
        <p className="text-sm text-porch-brown-light mt-1">
          Account Setup
        </p>
      </div>

      <div className="bg-white rounded-xl shadow-lg p-6 space-y-4">
        <Suspense fallback={<div className="text-center py-4 text-porch-brown-light">Loading...</div>}>
          <SetupForm />
        </Suspense>
      </div>
    </div>
  );
}
