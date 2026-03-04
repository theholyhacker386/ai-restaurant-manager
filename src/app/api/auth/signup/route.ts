import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import bcrypt from "bcryptjs";
import { v4 as uuid } from "uuid";
import crypto from "crypto";
import { Resend } from "resend";

/* eslint-disable @typescript-eslint/no-explicit-any */

export async function POST(req: Request) {
  try {
    const { name, restaurantName, email, password } = await req.json();

    // Validate required fields
    if (!name || !restaurantName || !email || !password) {
      return NextResponse.json(
        { error: "All fields are required." },
        { status: 400 }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: "Please enter a valid email address." },
        { status: 400 }
      );
    }

    // Validate password strength
    if (password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters." },
        { status: 400 }
      );
    }

    const sql = getDb();

    // Check if email is already registered
    const existing = await sql`SELECT id FROM users WHERE email = ${email.toLowerCase().trim()}`;
    if (existing.length > 0) {
      return NextResponse.json(
        { error: "An account with this email already exists." },
        { status: 409 }
      );
    }

    // Hash the password
    const passwordHash = await bcrypt.hash(password, 10);

    // Generate verification token
    const verificationToken = crypto.randomBytes(32).toString("hex");
    const tokenExpires = new Date();
    tokenExpires.setHours(tokenExpires.getHours() + 24); // 24 hour expiry

    // Create the restaurant (pending until email verified)
    const restaurantId = `rest_${uuid().split("-")[0]}`;
    await sql`
      INSERT INTO restaurants (id, name, status)
      VALUES (${restaurantId}, ${restaurantName.trim()}, 'pending')
    `;

    // Create the user (email not verified yet)
    const userId = uuid();
    await sql`
      INSERT INTO users (id, email, password_hash, name, role, restaurant_id, onboarding_completed, email_verified, verification_token, verification_token_expires)
      VALUES (${userId}, ${email.toLowerCase().trim()}, ${passwordHash}, ${name.trim()}, 'owner', ${restaurantId}, false, false, ${verificationToken}, ${tokenExpires.toISOString()})
    `;

    // Update the restaurant with the owner
    await sql`UPDATE restaurants SET owner_user_id = ${userId} WHERE id = ${restaurantId}`;

    // Create an onboarding session
    await sql`
      INSERT INTO onboarding_sessions (id, customer_name, business_name, restaurant_id, is_complete)
      VALUES (${userId}, ${name.trim()}, ${restaurantName.trim()}, ${restaurantId}, false)
      ON CONFLICT (id) DO NOTHING
    `;

    // Send verification email via Resend
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const verifyLink = `${baseUrl}/verify?token=${verificationToken}`;

    if (process.env.RESEND_API_KEY) {
      const resend = new Resend(process.env.RESEND_API_KEY);
      await resend.emails.send({
        from: "AI Restaurant Manager <onboarding@resend.dev>",
        to: email.toLowerCase().trim(),
        subject: "Verify your email — AI Restaurant Manager",
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 16px;">
            <h1 style="font-size: 22px; color: #3d2c1e; margin-bottom: 8px;">Welcome, ${name.trim()}!</h1>
            <p style="font-size: 15px; color: #6b5a4e; line-height: 1.5;">
              Thanks for signing up <strong>${restaurantName.trim()}</strong> with AI Restaurant Manager.
            </p>
            <p style="font-size: 15px; color: #6b5a4e; line-height: 1.5;">
              Click the button below to verify your email and activate your account:
            </p>
            <div style="text-align: center; margin: 28px 0;">
              <a href="${verifyLink}" style="display: inline-block; background: #3d2c1e; color: #fff; text-decoration: none; padding: 12px 32px; border-radius: 8px; font-weight: 600; font-size: 15px;">
                Verify My Email
              </a>
            </div>
            <p style="font-size: 13px; color: #9b8a7e; line-height: 1.5;">
              This link expires in 24 hours. If you didn't sign up, you can safely ignore this email.
            </p>
          </div>
        `,
      });
    } else {
      // In development without Resend, log the verify link
      console.log("[SIGNUP] Verification link (no RESEND_API_KEY set):", verifyLink);
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[SIGNUP] Error:", error);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
