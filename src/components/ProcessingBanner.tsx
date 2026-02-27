"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface StatusSummary {
  total: number;
  queued: number;
  processing: number;
  completed: number;
  errors: number;
  total_transactions: number;
  categorized: boolean;
}

export default function ProcessingBanner() {
  const [summary, setSummary] = useState<StatusSummary | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/statements/status");
      if (res.ok) {
        const data = await res.json();
        setSummary(data.summary);

        // Stop polling once everything is done
        if (data.summary.queued === 0 && data.summary.processing === 0 && pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      }
    } catch {
      // Silent
    }
  }, []);

  useEffect(() => {
    // Check on mount
    fetchStatus();

    // Poll every 15 seconds (not too aggressive to avoid unnecessary load)
    pollRef.current = setInterval(fetchStatus, 15000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [fetchStatus]);

  // Don't show if dismissed, no data, or nothing recent
  if (dismissed || !summary || summary.total === 0) return null;

  const isProcessing = summary.queued > 0 || summary.processing > 0;

  // Don't show if everything is done and categorized (user has already seen it)
  if (!isProcessing && summary.categorized && summary.errors === 0) {
    // Show "all done" for a brief moment — but only if they haven't dismissed
    // Actually, let's show the done banner until they dismiss it
  }

  // Don't show the banner if nothing is happening and there's nothing recent
  if (!isProcessing && summary.completed === 0) return null;

  return (
    <div
      className={`px-4 py-2 flex items-center justify-between text-xs ${
        isProcessing
          ? "bg-porch-teal/10 text-porch-teal"
          : summary.errors > 0
          ? "bg-amber-50 text-amber-700"
          : "bg-status-good/10 text-status-good"
      }`}
    >
      <div className="flex items-center gap-2 flex-1 min-w-0">
        {isProcessing ? (
          <>
            <div className="w-3.5 h-3.5 border-2 border-porch-teal/30 border-t-porch-teal rounded-full animate-spin shrink-0" />
            <span className="font-medium truncate">
              Processing statements... {summary.completed} of {summary.total} done
            </span>
          </>
        ) : summary.categorized ? (
          <>
            <span className="shrink-0">✅</span>
            <a href="/expenses" className="font-medium underline underline-offset-2 truncate">
              All done! {summary.total_transactions} transactions ready to review
            </a>
          </>
        ) : (
          <>
            <span className="shrink-0">📊</span>
            <span className="font-medium truncate">
              {summary.completed} statement{summary.completed !== 1 ? "s" : ""} processed
              {summary.errors > 0 ? ` (${summary.errors} error${summary.errors !== 1 ? "s" : ""})` : ""}
            </span>
          </>
        )}
      </div>

      {/* Dismiss button — only when done */}
      {!isProcessing && (
        <button
          onClick={() => setDismissed(true)}
          className="ml-2 shrink-0 text-current opacity-50 hover:opacity-100"
          aria-label="Dismiss"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
          </svg>
        </button>
      )}
    </div>
  );
}
