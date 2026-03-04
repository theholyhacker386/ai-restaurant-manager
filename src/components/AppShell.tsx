"use client";

import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import BottomNav from "@/components/BottomNav";
import AssistantChat from "@/components/AssistantChat";
import ProcessingBanner from "@/components/ProcessingBanner";
import HamburgerMenu from "@/components/HamburgerMenu";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const publicPages = ["/login", "/setup", "/signup", "/verify"];
  const isPublicPage = publicPages.some((p) => pathname === p || pathname.startsWith(p + "/"));
  const isOnboardingPage = pathname === "/onboarding" || pathname.startsWith("/onboarding/");

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
                AI Restaurant Manager
              </h1>
              <p className="text-[11px] text-white/70 -mt-0.5">
                Dashboard
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
    </>
  );
}
