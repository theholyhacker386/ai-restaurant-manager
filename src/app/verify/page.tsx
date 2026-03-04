"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

function VerifyContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setErrorMessage("No verification token found in the link.");
      return;
    }

    fetch(`/api/auth/verify?token=${token}`)
      .then(async (res) => {
        const data = await res.json();
        if (res.ok && data.success) {
          setStatus("success");
        } else {
          setStatus("error");
          setErrorMessage(data.error || "Verification failed.");
        }
      })
      .catch(() => {
        setStatus("error");
        setErrorMessage("Something went wrong. Please try again.");
      });
  }, [token]);

  if (status === "loading") {
    return (
      <div className="text-center space-y-3">
        <div className="flex justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-porch-brown" />
        </div>
        <p className="text-sm text-porch-brown-light">Verifying your email...</p>
      </div>
    );
  }

  if (status === "success") {
    return (
      <div className="text-center space-y-3">
        <div className="text-4xl">&#9989;</div>
        <h2 className="text-lg font-semibold text-porch-brown">Email Verified!</h2>
        <p className="text-sm text-porch-brown-light leading-relaxed">
          Your account is now active. Log in to start setting up your restaurant.
        </p>
        <Link
          href="/login"
          className="inline-block mt-2 bg-porch-brown text-white px-6 py-2.5 rounded-lg font-medium hover:bg-porch-brown-light transition-colors"
        >
          Go to Login
        </Link>
      </div>
    );
  }

  return (
    <div className="text-center space-y-3">
      <div className="text-4xl">&#10060;</div>
      <h2 className="text-lg font-semibold text-porch-brown">Verification Failed</h2>
      <p className="text-sm text-porch-brown-light leading-relaxed">
        {errorMessage}
      </p>
      <Link
        href="/signup"
        className="inline-block mt-2 text-sm text-porch-brown font-medium hover:underline"
      >
        Try signing up again
      </Link>
    </div>
  );
}

export default function VerifyPage() {
  return (
    <div className="w-full max-w-sm">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold text-porch-brown">
          AI Restaurant Manager
        </h1>
        <p className="text-sm text-porch-brown-light mt-1">
          Email Verification
        </p>
      </div>

      <div className="bg-white rounded-xl shadow-lg p-6 space-y-4">
        <Suspense fallback={<div className="text-center py-4 text-porch-brown-light">Verifying...</div>}>
          <VerifyContent />
        </Suspense>
      </div>
    </div>
  );
}
