import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { neon } from "@neondatabase/serverless";

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

          const sql = neon(process.env.NEON_DATABASE_URL!);
          const email = credentials.email as string;
          console.log("[AUTH] querying user:", email);
          const rows = await sql`SELECT id, email, password_hash, name, role, onboarding_completed, restaurant_id, is_platform_admin FROM users WHERE email = ${email}`;

          console.log("[AUTH] rows found:", rows.length);
          if (rows.length === 0) return null;

          const user = rows[0];
          const passwordMatch = await bcrypt.compare(
            credentials.password as string,
            user.password_hash
          );

          console.log("[AUTH] password match:", passwordMatch);
          if (!passwordMatch) return null;

          const result = {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role || "manager",
            onboardingCompleted: user.onboarding_completed ?? false,
            restaurantId: user.restaurant_id || null,
            isPlatformAdmin: user.is_platform_admin ?? false,
          };
          console.log("[AUTH] returning user:", JSON.stringify(result));
          return result;
        } catch (err) {
          console.error("[AUTH] authorize error:", err);
          return null;
        }
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

        const sql = neon(process.env.NEON_DATABASE_URL!);
        const pin = credentials.pin as string;

        // Only check users that have a PIN set
        const rows = await sql`SELECT id, email, name, role, pin_hash, onboarding_completed, restaurant_id, is_platform_admin FROM users WHERE pin_hash IS NOT NULL`;

        for (const user of rows) {
          const match = await bcrypt.compare(pin, user.pin_hash);
          if (match) {
            return {
              id: user.id,
              email: user.email,
              name: user.name,
              role: user.role || "manager",
              onboardingCompleted: user.onboarding_completed ?? false,
              restaurantId: user.restaurant_id || null,
              isPlatformAdmin: user.is_platform_admin ?? false,
            };
          }
        }

        return null;
      },
    }),
  ],
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  callbacks: {
    jwt({ token, user }) {
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
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (session.user as any).role = token.role as string;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (session.user as any).onboardingCompleted = token.onboardingCompleted ?? true;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (session.user as any).restaurantId = token.restaurantId || null;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (session.user as any).isPlatformAdmin = token.isPlatformAdmin ?? false;
      }
      return session;
    },
  },
});
