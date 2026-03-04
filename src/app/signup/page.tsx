"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { signupAction } from "./actions";

function SignupForm() {
  const searchParams = useSearchParams();
  const prefillName = searchParams.get("name") || "";
  const prefillRestaurant = searchParams.get("restaurant") || "";

  const [name, setName] = useState(prefillName);
  const [restaurantName, setRestaurantName] = useState(prefillRestaurant);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    // Client-side validation
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }

    setLoading(true);

    try {
      const result = await signupAction({
        name: name.trim(),
        restaurantName: restaurantName.trim(),
        email: email.toLowerCase().trim(),
        password,
      });

      if (result.error) {
        setError(result.error);
        setLoading(false);
        return;
      }

      setSuccess(true);
    } catch {
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className="text-center space-y-3">
        <div className="text-4xl">&#9993;</div>
        <h2 className="text-lg font-semibold text-porch-brown">Check Your Email!</h2>
        <p className="text-sm text-porch-brown-light leading-relaxed">
          We sent a verification link to <strong className="text-porch-brown">{email}</strong>.
          Click the link in the email to activate your account.
        </p>
        <p className="text-xs text-porch-brown-light/70 mt-2">
          Don&apos;t see it? Check your spam folder.
        </p>
        <Link
          href="/login"
          className="inline-block mt-4 text-sm text-porch-brown font-medium hover:underline"
        >
          Go to Login
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className="text-center mb-2">
        <h2 className="text-lg font-semibold text-porch-brown">
          Create Your Account
        </h2>
        <p className="text-sm text-porch-brown-light mt-1">
          Get your restaurant set up in minutes
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-porch-brown-light mb-1">
            Your Name
          </label>
          <input
            id="name"
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2 border border-porch-cream-dark rounded-lg bg-porch-warm-white text-porch-brown focus:outline-none focus:ring-2 focus:ring-porch-brown focus:border-transparent"
            placeholder="Joe Smith"
          />
        </div>

        <div>
          <label htmlFor="restaurant" className="block text-sm font-medium text-porch-brown-light mb-1">
            Restaurant Name
          </label>
          <input
            id="restaurant"
            type="text"
            required
            value={restaurantName}
            onChange={(e) => setRestaurantName(e.target.value)}
            className="w-full px-3 py-2 border border-porch-cream-dark rounded-lg bg-porch-warm-white text-porch-brown focus:outline-none focus:ring-2 focus:ring-porch-brown focus:border-transparent"
            placeholder="Joe's Pizza"
          />
        </div>

        <div>
          <label htmlFor="signup-email" className="block text-sm font-medium text-porch-brown-light mb-1">
            Email
          </label>
          <input
            id="signup-email"
            type="email"
            required
            autoCapitalize="none"
            autoCorrect="off"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-3 py-2 border border-porch-cream-dark rounded-lg bg-porch-warm-white text-porch-brown focus:outline-none focus:ring-2 focus:ring-porch-brown focus:border-transparent"
            placeholder="you@email.com"
          />
        </div>

        <div>
          <label htmlFor="signup-password" className="block text-sm font-medium text-porch-brown-light mb-1">
            Password
          </label>
          <div className="relative">
            <input
              id="signup-password"
              type={showPassword ? "text" : "password"}
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 pr-12 border border-porch-cream-dark rounded-lg bg-porch-warm-white text-porch-brown focus:outline-none focus:ring-2 focus:ring-porch-brown focus:border-transparent"
              placeholder="At least 8 characters"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-porch-brown-light text-sm font-medium"
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>
        </div>

        <div>
          <label htmlFor="confirm-password" className="block text-sm font-medium text-porch-brown-light mb-1">
            Confirm Password
          </label>
          <input
            id="confirm-password"
            type={showPassword ? "text" : "password"}
            required
            minLength={8}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full px-3 py-2 border border-porch-cream-dark rounded-lg bg-porch-warm-white text-porch-brown focus:outline-none focus:ring-2 focus:ring-porch-brown focus:border-transparent"
            placeholder="Type password again"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-porch-brown text-white py-2.5 rounded-lg font-medium hover:bg-porch-brown-light transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "Creating Account..." : "Create Account"}
        </button>
      </form>

      <div className="mt-4 text-center">
        <span className="text-xs text-porch-brown-light">Already have an account? </span>
        <Link
          href="/login"
          className="text-xs text-porch-brown font-medium hover:underline"
        >
          Log in
        </Link>
      </div>
    </>
  );
}

export default function SignupPage() {
  return (
    <div className="w-full max-w-sm">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold text-porch-brown">
          AI Restaurant Manager
        </h1>
        <p className="text-sm text-porch-brown-light mt-1">
          Restaurant Sign Up
        </p>
      </div>

      <div className="bg-white rounded-xl shadow-lg p-6 space-y-4">
        <Suspense fallback={<div className="text-center py-4 text-porch-brown-light">Loading...</div>}>
          <SignupForm />
        </Suspense>
      </div>
    </div>
  );
}
