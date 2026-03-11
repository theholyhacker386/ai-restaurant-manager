import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { neon } from "@neondatabase/serverless";
import { checkRateLimit } from "@/lib/rate-limit";
import { logAuditEvent } from "@/lib/audit";
import { verifyMfaCompletionToken } from "@/lib/mfa";

// 10 attempts per 15 minutes
const LOGIN_MAX_ATTEMPTS = 10;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    // Email + password login
    Credentials({
      id: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        try {
          console.log("[AUTH] credentials provider called, email:", credentials?.email);
          if (!credentials?.email || !credentials?.password) {
            console.log("[AUTH] missing email or password");
            return null;
          }

          const email = credentials.email as string;

          // Rate limit by email
          const { limited } = checkRateLimit(`login:email:${email}`, LOGIN_MAX_ATTEMPTS, LOGIN_WINDOW_MS);
          if (limited) {
            console.log("[AUTH] rate limited for email:", email);
            logAuditEvent({
              eventType: "login_failed",
              userEmail: email,
              details: { reason: "rate_limited", method: "email" },
            });
            return null;
          }

          const sql = neon(process.env.NEON_DATABASE_URL!);
          console.log("[AUTH] querying user:", email);
          const rows = await sql`SELECT id, email, password_hash, name, role, onboarding_completed, restaurant_id, is_platform_admin, email_verified, is_active, mfa_enabled FROM users WHERE email = ${email}`;

          console.log("[AUTH] rows found:", rows.length);
          if (rows.length === 0) {
            logAuditEvent({
              eventType: "login_failed",
              userEmail: email,
              details: { reason: "user_not_found", method: "email" },
            });
            return null;
          }

          const user = rows[0];

          // Block deactivated users from logging in
          if (user.is_active === false) {
            console.log("[AUTH] user is deactivated:", email);
            logAuditEvent({
              eventType: "login_failed",
              userId: user.id,
              userEmail: email,
              userRole: user.role,
              restaurantId: user.restaurant_id || undefined,
              details: { reason: "account_deactivated", method: "email" },
            });
            return null;
          }

          const passwordMatch = await bcrypt.compare(
            credentials.password as string,
            user.password_hash
          );

          console.log("[AUTH] password match:", passwordMatch);
          if (!passwordMatch) {
            logAuditEvent({
              eventType: "login_failed",
              userId: user.id,
              userEmail: email,
              userRole: user.role,
              restaurantId: user.restaurant_id || undefined,
              details: { reason: "wrong_password", method: "email" },
            });
            return null;
          }

          // If MFA is enabled, create session but mark as MFA-unverified
          const mfaRequired = user.mfa_enabled === true;

          const result = {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role || "manager",
            onboardingCompleted: user.onboarding_completed ?? false,
            restaurantId: user.restaurant_id || null,
            isPlatformAdmin: user.is_platform_admin ?? false,
            mfaRequired,
            mfaVerified: false,
          };
          console.log("[AUTH] returning user:", JSON.stringify(result));

          // Only log successful login if MFA is not required
          // (if MFA is required, login audit happens after MFA validation in /api/auth/mfa/validate)
          if (!mfaRequired) {
            logAuditEvent({
              eventType: "login",
              userId: user.id,
              userEmail: user.email,
              userRole: user.role,
              restaurantId: user.restaurant_id || undefined,
              details: { method: "email" },
            });
          }

          return result;
        } catch (err) {
          console.error("[AUTH] authorize error:", err);
          return null;
        }
      },
    }),
    // Onboarding auto-login token (one-time use, created during frictionless onboarding)
    Credentials({
      id: "onboarding-token",
      credentials: {
        token: { label: "Token", type: "text" },
      },
      async authorize(credentials) {
        if (!credentials?.token) return null;

        const token = credentials.token as string;

        const sql = neon(process.env.NEON_DATABASE_URL!);
        const rows = await sql`
          SELECT id, email, name, role, onboarding_completed, restaurant_id, is_platform_admin
          FROM users
          WHERE auto_login_token = ${token}
            AND auto_login_token_expires > NOW()
        `;

        if (rows.length === 0) {
          console.log("[AUTH] onboarding token invalid or expired");
          return null;
        }

        const user = rows[0];

        // Clear the token (single-use)
        await sql`
          UPDATE users
          SET auto_login_token = NULL, auto_login_token_expires = NULL
          WHERE id = ${user.id}
        `;

        logAuditEvent({
          eventType: "login",
          userId: user.id,
          userEmail: user.email,
          userRole: user.role,
          restaurantId: user.restaurant_id || undefined,
          details: { method: "onboarding-token" },
        });

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role || "owner",
          onboardingCompleted: user.onboarding_completed ?? false,
          restaurantId: user.restaurant_id || null,
          isPlatformAdmin: user.is_platform_admin ?? false,
          mfaRequired: false,
          mfaVerified: false,
        };
      },
    }),
    // PIN-only login
    Credentials({
      id: "pin",
      credentials: {
        pin: { label: "PIN", type: "text" },
      },
      async authorize(credentials) {
        if (!credentials?.pin) return null;

        const pin = credentials.pin as string;

        // Rate limit by PIN value
        const { limited } = checkRateLimit(`login:pin:${pin}`, LOGIN_MAX_ATTEMPTS, LOGIN_WINDOW_MS);
        if (limited) {
          console.log("[AUTH] rate limited for PIN attempt");
          logAuditEvent({
            eventType: "login_failed",
            details: { reason: "rate_limited", method: "pin" },
          });
          return null;
        }

        const sql = neon(process.env.NEON_DATABASE_URL!);

        // Only check active users that have a PIN set
        const rows = await sql`SELECT id, email, name, role, pin_hash, onboarding_completed, restaurant_id, is_platform_admin FROM users WHERE pin_hash IS NOT NULL AND (is_active = true OR is_active IS NULL)`;

        for (const user of rows) {
          const match = await bcrypt.compare(pin, user.pin_hash);
          if (match) {
            // Log successful PIN login
            logAuditEvent({
              eventType: "login",
              userId: user.id,
              userEmail: user.email,
              userRole: user.role,
              restaurantId: user.restaurant_id || undefined,
              details: { method: "pin" },
            });

            return {
              id: user.id,
              email: user.email,
              name: user.name,
              role: user.role || "manager",
              onboardingCompleted: user.onboarding_completed ?? false,
              restaurantId: user.restaurant_id || null,
              isPlatformAdmin: user.is_platform_admin ?? false,
              mfaRequired: false, // PIN login skips MFA
              mfaVerified: false,
            };
          }
        }

        // Log failed PIN login
        logAuditEvent({
          eventType: "login_failed",
          details: { reason: "wrong_pin", method: "pin" },
        });

        return null;
      },
    }),
  ],
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  callbacks: {
    jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        token.role = (user as any).role || "manager";
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        token.onboardingCompleted = (user as any).onboardingCompleted ?? false;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        token.restaurantId = (user as any).restaurantId || null;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        token.isPlatformAdmin = (user as any).isPlatformAdmin ?? false;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        token.mfaRequired = (user as any).mfaRequired ?? false;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        token.mfaVerified = (user as any).mfaVerified ?? false;
      }

      // Handle MFA completion via session update
      if (trigger === "update" && session?.mfaCompletionToken) {
        const userId = token.id as string;
        const isValid = verifyMfaCompletionToken(session.mfaCompletionToken, userId);
        if (isValid) {
          token.mfaVerified = true;
        }
      }

      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (session.user as any).role = token.role as string;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (session.user as any).onboardingCompleted = token.onboardingCompleted ?? false;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (session.user as any).restaurantId = token.restaurantId || null;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (session.user as any).isPlatformAdmin = token.isPlatformAdmin ?? false;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (session.user as any).mfaRequired = token.mfaRequired ?? false;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (session.user as any).mfaVerified = token.mfaVerified ?? false;
      }
      return session;
    },
  },
});
