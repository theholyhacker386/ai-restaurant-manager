import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import { canAccessPage, canAccessAPI, type UserRole } from "@/lib/permissions";

export default auth((req) => {
  const { pathname } = req.nextUrl;

  // Allow NextAuth's own routes (login/logout/session handling)
  if (pathname.startsWith("/api/auth")) {
    return NextResponse.next();
  }

  // Allow cron routes — called by Vercel Cron scheduler, not a user
  if (pathname.startsWith("/api/cron/")) {
    return NextResponse.next();
  }

  // Public pages that don't require login
  const publicPages = ["/login", "/setup"];
  const isPublicPage = publicPages.some((p) => pathname === p || pathname.startsWith(p + "/"));

  // Onboarding page — requires login but NOT completed onboarding
  const isOnboardingPage = pathname === "/onboarding" || pathname.startsWith("/onboarding/");
  const isOnboardingAPI = pathname.startsWith("/api/onboarding/");

  // Admin pages and APIs
  const isAdminPage = pathname === "/admin" || pathname.startsWith("/admin/");
  const isAdminAPI = pathname.startsWith("/api/admin/");

  // Allow onboarding with a token (no login needed — the user was invited via link)
  const hasOnboardingToken = req.nextUrl.searchParams.has("token");
  if (!req.auth && (isOnboardingPage || isOnboardingAPI) && hasOnboardingToken) {
    return NextResponse.next();
  }

  // Allow onboarding API calls from token-based sessions (token is in the request body,
  // not the URL, so we can't check it here — the API routes validate it themselves)
  if (!req.auth && isOnboardingAPI) {
    return NextResponse.next();
  }

  // If the user is NOT logged in and is NOT on a public page, send them to login
  if (!req.auth && !isPublicPage) {
    const loginUrl = new URL("/login", req.nextUrl.origin);
    return NextResponse.redirect(loginUrl);
  }

  // If the user IS logged in and goes to a public page, send them to the dashboard
  if (req.auth && isPublicPage) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const user = req.auth.user as any;
    // Platform admins go to admin dashboard
    if (user?.isPlatformAdmin) {
      const adminUrl = new URL("/admin", req.nextUrl.origin);
      return NextResponse.redirect(adminUrl);
    }
    const homeUrl = new URL("/", req.nextUrl.origin);
    return NextResponse.redirect(homeUrl);
  }

  // Allow onboarding pages and APIs for any logged-in user
  if (req.auth && (isOnboardingPage || isOnboardingAPI)) {
    return NextResponse.next();
  }

  // Admin route protection — only platform admins can access /admin
  if (req.auth && (isAdminPage || isAdminAPI)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const user = req.auth.user as any;
    if (!user?.isPlatformAdmin) {
      if (isAdminAPI) {
        return NextResponse.json({ error: "Platform admin access required" }, { status: 403 });
      }
      const homeUrl = new URL("/", req.nextUrl.origin);
      return NextResponse.redirect(homeUrl);
    }
    return NextResponse.next();
  }

  // Onboarding guard — owners who haven't finished onboarding get redirected
  if (req.auth && !isOnboardingPage && !isOnboardingAPI) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const user = req.auth.user as any;

    // Platform admins skip onboarding guard — they go to /admin
    if (user?.isPlatformAdmin) {
      // If a platform admin navigates to / (home), send them to admin
      if (pathname === "/") {
        const adminUrl = new URL("/admin", req.nextUrl.origin);
        return NextResponse.redirect(adminUrl);
      }
      return NextResponse.next();
    }

    const isOwner = user?.role === "owner";
    const onboardingDone = user?.onboardingCompleted === true;

    // Only redirect owners who haven't completed onboarding (not for API calls — let those through)
    if (isOwner && !onboardingDone && !pathname.startsWith("/api/")) {
      const onboardingUrl = new URL("/onboarding", req.nextUrl.origin);
      return NextResponse.redirect(onboardingUrl);
    }
  }

  // Role-based access control
  if (req.auth) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const role = ((req.auth.user as any)?.role || "manager") as UserRole;

    // Check API route access
    if (pathname.startsWith("/api/")) {
      if (!canAccessAPI(pathname, role)) {
        return NextResponse.json({ error: "Access denied" }, { status: 403 });
      }
    }
    // Check page access
    else if (!canAccessPage(pathname, role)) {
      // Redirect managers to home if they try to access owner-only pages
      const homeUrl = new URL("/", req.nextUrl.origin);
      return NextResponse.redirect(homeUrl);
    }
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    // Match everything except static files, service worker, and Next.js internals
    "/((?!_next/static|_next/image|favicon.ico|sw\\.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
