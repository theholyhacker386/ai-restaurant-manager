"use server";

import { signIn } from "@/lib/auth";
import { AuthError } from "next-auth";
import { neon } from "@neondatabase/serverless";

export async function loginWithCredentials(email: string, password: string) {
  try {
    // Check if user exists and email is verified before attempting login
    const sql = neon(process.env.NEON_DATABASE_URL!);
    const rows = await sql`SELECT email_verified FROM users WHERE email = ${email.toLowerCase().trim()}`;

    if (rows.length > 0 && rows[0].email_verified === false) {
      return { error: "Please verify your email before logging in. Check your inbox for the verification link." };
    }

    // Let signIn redirect — this sets the session cookie
    await signIn("credentials", {
      email,
      password,
      redirectTo: "/",
    });
  } catch (error) {
    // CredentialsSignin = wrong email/password
    if (error instanceof AuthError) {
      return { error: "Invalid email or password" };
    }
    // NEXT_REDIRECT is expected on success — re-throw so Next.js handles the redirect
    throw error;
  }
}

export async function loginWithPin(pin: string) {
  try {
    await signIn("pin", {
      pin,
      redirectTo: "/",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: "Invalid PIN" };
    }
    throw error;
  }
}
