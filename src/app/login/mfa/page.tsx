"use client";

import { useSession } from "next-auth/react";
import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";

export default function MfaPage() {
  const router = useRouter();
  const { data: session, update } = useSession();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [useBackupCode, setUseBackupCode] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [lockoutUntil, setLockoutUntil] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const user = session?.user as any;
  const userId = user?.id;

  // Auto-focus input
  useEffect(() => {
    inputRef.current?.focus();
  }, [useBackupCode]);

  // Check lockout timer
  useEffect(() => {
    if (!lockoutUntil) return;
    const timer = setInterval(() => {
      if (Date.now() >= lockoutUntil) {
        setLockoutUntil(null);
        setAttempts(0);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [lockoutUntil]);

  // If session doesn't need MFA, redirect to dashboard
  useEffect(() => {
    if (session && user?.mfaVerified === true) {
      router.push("/");
      router.refresh();
    }
  }, [session, user, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim() || !userId) return;
    if (lockoutUntil && Date.now() < lockoutUntil) return;

    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/mfa/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: code.trim(),
          userId,
          isBackupCode: useBackupCode,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        const newAttempts = attempts + 1;
        setAttempts(newAttempts);

        // Lock out after 5 failed attempts for 30 seconds
        if (newAttempts >= 5) {
          setLockoutUntil(Date.now() + 30000);
          setError("Too many attempts. Please wait 30 seconds.");
        } else {
          setError(data.error || "Invalid code. Please try again.");
        }
        setCode("");
        setLoading(false);
        return;
      }

      // MFA passed — update the session with the completion token
      await update({ mfaCompletionToken: data.mfaCompletionToken });

      // Small delay for session to propagate, then redirect
      setTimeout(() => {
        router.push("/");
        router.refresh();
      }, 200);
    } catch {
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  const isLockedOut = lockoutUntil !== null && Date.now() < lockoutUntil;
  const lockoutSeconds = isLockedOut
    ? Math.ceil((lockoutUntil! - Date.now()) / 1000)
    : 0;

  return (
    <div className="w-full max-w-sm">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold text-porch-brown">
          AI Restaurant Manager
        </h1>
        <p className="text-sm text-porch-brown-light mt-1">
          Two-Factor Authentication
        </p>
      </div>

      <div className="bg-white rounded-xl shadow-lg p-6">
        <div className="text-center mb-6">
          {/* Lock icon */}
          <div className="w-16 h-16 bg-porch-cream rounded-full flex items-center justify-center mx-auto mb-3">
            <svg className="w-8 h-8 text-porch-brown" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-porch-brown">
            {useBackupCode ? "Enter Backup Code" : "Enter Verification Code"}
          </h2>
          <p className="text-sm text-porch-brown-light mt-1">
            {useBackupCode
              ? "Enter one of your backup codes"
              : "Open your authenticator app and enter the 6-digit code"}
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2 mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <input
              ref={inputRef}
              type="text"
              inputMode={useBackupCode ? "text" : "numeric"}
              maxLength={useBackupCode ? 8 : 6}
              required
              autoFocus
              value={code}
              onChange={(e) => {
                if (useBackupCode) {
                  setCode(e.target.value.slice(0, 8));
                } else {
                  setCode(e.target.value.replace(/\D/g, "").slice(0, 6));
                }
              }}
              disabled={isLockedOut}
              className="w-full px-3 py-4 border border-porch-cream-dark rounded-lg bg-porch-warm-white text-porch-brown text-center text-2xl tracking-[0.4em] font-mono focus:outline-none focus:ring-2 focus:ring-porch-brown focus:border-transparent disabled:opacity-50"
              placeholder={useBackupCode ? "a1b2c3d4" : "000000"}
            />
          </div>

          <button
            type="submit"
            disabled={loading || isLockedOut || (!useBackupCode && code.length !== 6) || (useBackupCode && code.length < 6)}
            className="w-full bg-porch-brown text-white py-2.5 rounded-lg font-medium hover:bg-porch-brown-light transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading
              ? "Verifying..."
              : isLockedOut
                ? `Locked (${lockoutSeconds}s)`
                : "Verify"}
          </button>
        </form>

        <div className="mt-4 text-center space-y-2">
          <button
            onClick={() => {
              setUseBackupCode(!useBackupCode);
              setCode("");
              setError("");
            }}
            className="text-xs text-porch-brown-light hover:text-porch-brown hover:underline"
          >
            {useBackupCode
              ? "Use authenticator code instead"
              : "Use a backup code instead"}
          </button>
        </div>
      </div>
    </div>
  );
}
