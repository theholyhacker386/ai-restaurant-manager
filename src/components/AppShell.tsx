"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import BottomNav from "@/components/BottomNav";
import AssistantChat from "@/components/AssistantChat";
import ProcessingBanner from "@/components/ProcessingBanner";
import PushNotifications from "@/components/PushNotifications";
import HamburgerMenu from "@/components/HamburgerMenu";

function useBackgroundSync() {
  const hasStarted = useRef(false);

  useEffect(() => {
    if (hasStarted.current) return;
    hasStarted.current = true;

    (async () => {
      try {
        // Check if data is stale
        const res = await fetch("/api/square/sync-status");
        if (!res.ok) return;
        const status = await res.json();
        const salesFresh = status.square_sales?.isFresh === true;
        const laborFresh = status.square_labor?.isFresh === true;

        if (salesFresh && laborFresh) return;

        // Sync in the background — no UI needed here
        const end = new Date();
        const start = new Date();
        start.setDate(end.getDate() - 7);
        const pad = (n: number) => String(n).padStart(2, "0");
        const startDate = `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`;
        const endDate = `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}`;

        await Promise.all([
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

        // Mark sync as fresh
        const durationMs = 0;
        await Promise.all([
          fetch("/api/square/sync-status", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ syncType: "square_sales", status: "success", error: null, durationMs }),
          }),
          fetch("/api/square/sync-status", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ syncType: "square_labor", status: "success", error: null, durationMs }),
          }),
        ]);
      } catch {
        // Silent fail — individual pages will retry if needed
      }
    })();
  }, []);
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const publicPages = ["/login", "/setup"];
  const isPublicPage = publicPages.some((p) => pathname === p || pathname.startsWith(p + "/"));
  const isOnboardingPage = pathname === "/onboarding" || pathname.startsWith("/onboarding/");

  // Start syncing Square data as soon as the user is logged in
  useBackgroundSync();

  // Public pages and onboarding get a clean layout — no header, nav, or assistant
  if (isPublicPage || isOnboardingPage) {
    return <>{children}</>;
  }

  return (
    <>
      {/* Header */}
      <header className="sticky top-0 z-40 bg-porch-brown text-white px-4 py-3 shadow-md">
        <div className="max-w-lg md:max-w-4xl lg:max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <HamburgerMenu />
            <div>
              <h1 className="text-lg font-bold tracking-wide">
                The Porch Health Park
              </h1>
              <p className="text-[11px] text-white/70 -mt-0.5">
                Financial Dashboard
              </p>
            </div>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="text-white/70 hover:text-white text-xs font-medium px-3 py-1.5 rounded-lg border border-white/20 hover:border-white/40 transition-colors"
          >
            Log Out
          </button>
        </div>
      </header>

      {/* Processing banner — shows when statements are being processed */}
      <ProcessingBanner />

      {/* Main content area - padded for header and bottom nav */}
      <main className="max-w-lg md:max-w-4xl lg:max-w-6xl mx-auto px-4 md:px-8 pt-4 pb-24">{children}</main>

      {/* Bottom navigation — slim version with just the essentials */}
      <BottomNav />

      {/* AI Assistant Manager */}
      <AssistantChat />

      {/* Push notification prompt */}
      <PushNotifications />
    </>
  );
}
