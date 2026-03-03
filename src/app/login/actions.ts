"use server";

import { signIn } from "@/lib/auth";
import { AuthError } from "next-auth";

export async function loginWithCredentials(email: string, password: string) {
  try {
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
