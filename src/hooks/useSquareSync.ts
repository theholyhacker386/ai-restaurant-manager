"use client";

import { useEffect, useState, useCallback, useRef } from "react";

interface UseSquareSyncOptions {
  /** Called after sync completes so the page can re-fetch its data */
  onSyncComplete?: () => void;
  /** Start/end dates for the sync range. Defaults to last 7 days. */
  startDate?: string;
  endDate?: string;
}

interface UseSquareSyncReturn {
  /** True while a sync is in progress */
  syncing: boolean;
  /** Error message from the last sync attempt, if any */
  lastSyncError: string | null;
  /** Manually trigger a sync (ignores freshness check) */
  manualSync: () => Promise<void>;
}

function toLocalDateString(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getDefaultDateRange() {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - 7);
  return {
    startDate: toLocalDateString(start),
    endDate: toLocalDateString(end),
  };
}

/**
 * Shared hook that auto-syncs Square data (sales + labor) on page mount
 * if the cached data is stale (older than 5 minutes).
 *
 * Usage:
 *   const { syncing } = useSquareSync({ onSyncComplete: fetchData });
 */
export function useSquareSync(options: UseSquareSyncOptions = {}): UseSquareSyncReturn {
  const [syncing, setSyncing] = useState(false);
  const [lastSyncError, setLastSyncError] = useState<string | null>(null);
  const hasChecked = useRef(false);

  const doSync = useCallback(async () => {
    setSyncing(true);
    setLastSyncError(null);
    const startTime = Date.now();

    const { startDate, endDate } = options.startDate && options.endDate
      ? { startDate: options.startDate, endDate: options.endDate }
      : getDefaultDateRange();

    try {
      // Fire sales + labor sync in parallel
      const [salesRes, laborRes] = await Promise.all([
        fetch("/api/square/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ startDate, endDate }),
        }),
        fetch("/api/square/labor", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ startDate, endDate }),
        }),
      ]);

      const durationMs = Date.now() - startTime;
      const salesOk = salesRes.ok;
      const laborOk = laborRes.ok;

      // Update sync metadata for sales
      await fetch("/api/square/sync-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          syncType: "square_sales",
          status: salesOk ? "success" : "error",
          error: salesOk ? null : "Sales sync failed",
          durationMs,
        }),
      });

      // Update sync metadata for labor
      await fetch("/api/square/sync-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          syncType: "square_labor",
          status: laborOk ? "success" : "error",
          error: laborOk ? null : "Labor sync failed",
          durationMs,
        }),
      });

      if (!salesOk && !laborOk) {
        setLastSyncError("Failed to sync sales and labor data");
      } else if (!salesOk) {
        setLastSyncError("Sales sync failed (labor OK)");
      } else if (!laborOk) {
        setLastSyncError("Labor sync failed (sales OK)");
      }

      // Notify the page to re-fetch its display data
      options.onSyncComplete?.();
    } catch (err: any) {
      setLastSyncError(err.message || "Sync failed");
    } finally {
      setSyncing(false);
    }
  }, [options.startDate, options.endDate, options.onSyncComplete]);

  // Auto-sync on mount if data is stale
  useEffect(() => {
    if (hasChecked.current) return;
    hasChecked.current = true;

    (async () => {
      try {
        const res = await fetch("/api/square/sync-status");
        if (!res.ok) {
          // If we can't check freshness, sync anyway
          await doSync();
          return;
        }

        const status = await res.json();
        const salesFresh = status.square_sales?.isFresh === true;
        const laborFresh = status.square_labor?.isFresh === true;

        if (!salesFresh || !laborFresh) {
          await doSync();
        }
      } catch {
        // If the check fails, sync anyway
        await doSync();
      }
    })();
  }, [doSync]);

  const manualSync = useCallback(async () => {
    await doSync();
  }, [doSync]);

  return { syncing, lastSyncError, manualSync };
}
