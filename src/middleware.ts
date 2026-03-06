import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import { canAccessPage, canAccessAPI, type UserRole } from "@/lib/permissions";
import { logAuditEvent } from "@/lib/audit";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Add security headers to a NextResponse.
 */
function addSecurityHeaders(response: NextResponse): NextResponse {
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  response.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  response.headers.set("X-XSS-Protection", "1; mode=block");
  return response;
}

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
  const publicPages = ["/login", "/setup", "/signup", "/verify"];
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
  // Exception: allow /login/mfa for MFA verification
  const isMfaPage = pathname === "/login/mfa";
  if (req.auth && isPublicPage && !isMfaPage) {
    const user = req.auth.user as any;
    const needsMfa = user?.mfaRequired === true && user?.mfaVerified !== true;
    // If MFA is pending, redirect to MFA page, not dashboard
    if (needsMfa) {
      const mfaUrl = new URL("/login/mfa", req.nextUrl.origin);
      return NextResponse.redirect(mfaUrl);
    }
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

  // MFA guard — users with MFA enabled but not yet verified get redirected
  if (req.auth && !isMfaPage) {
    const user = req.auth.user as any;
    const needsMfa = user?.mfaRequired === true && user?.mfaVerified !== true;

    if (needsMfa && !pathname.startsWith("/api/auth")) {
      // Allow MFA validation API calls through
      if (pathname.startsWith("/api/")) {
        return addSecurityHeaders(
          NextResponse.json({ error: "MFA verification required" }, { status: 403 })
        );
      }
      const mfaUrl = new URL("/login/mfa", req.nextUrl.origin);
      return NextResponse.redirect(mfaUrl);
    }
  }

  // Admin route protection — only platform admins can access /admin
  if (req.auth && (isAdminPage || isAdminAPI)) {
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
    const role = ((req.auth.user as any)?.role || "manager") as UserRole;

    // Check API route access
    if (pathname.startsWith("/api/")) {
      if (!canAccessAPI(pathname, role)) {
        // Fire-and-forget audit log for access denied
        const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
        const ua = req.headers.get("user-agent") || "unknown";
        logAuditEvent({
          eventType: "access_denied",
          userId: (req.auth.user as any)?.id,
          userEmail: req.auth.user?.email || undefined,
          userRole: role,
          restaurantId: (req.auth.user as any)?.restaurantId || undefined,
          ipAddress: ip,
          userAgent: ua,
          resource: pathname,
        });
        return addSecurityHeaders(
          NextResponse.json({ error: "Access denied" }, { status: 403 })
        );
      }
    }
    // Check page access
    else if (!canAccessPage(pathname, role)) {
      // Fire-and-forget audit log for access denied
      const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
      const ua = req.headers.get("user-agent") || "unknown";
      logAuditEvent({
        eventType: "access_denied",
        userId: (req.auth.user as any)?.id,
        userEmail: req.auth.user?.email || undefined,
        userRole: role,
        restaurantId: (req.auth.user as any)?.restaurantId || undefined,
        ipAddress: ip,
        userAgent: ua,
        resource: pathname,
      });
      // Redirect managers to home if they try to access owner-only pages
      const homeUrl = new URL("/", req.nextUrl.origin);
      return NextResponse.redirect(homeUrl);
    }
  }

  return addSecurityHeaders(NextResponse.next());
});

export const config = {
  matcher: [
    // Match everything except static files, service worker, and Next.js internals
    "/((?!_next/static|_next/image|favicon.ico|sw\\.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
