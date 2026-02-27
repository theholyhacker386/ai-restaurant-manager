"use client";

import { useEffect, useState } from "react";

/**
 * Handles push notification setup:
 * 1. Registers the service worker
 * 2. Shows a prompt to enable notifications (if not yet granted)
 * 3. Subscribes to push and sends the subscription to our server
 */
export default function PushNotifications() {
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("default");
  const [showPrompt, setShowPrompt] = useState(false);
  const [subscribing, setSubscribing] = useState(false);

  useEffect(() => {
    // Check if push is supported
    if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      setPermission("unsupported");
      return;
    }

    setPermission(Notification.permission);

    // If already granted, silently register
    if (Notification.permission === "granted") {
      registerAndSubscribe();
      return;
    }

    // If not yet asked, show prompt after a short delay
    if (Notification.permission === "default") {
      const timer = setTimeout(() => setShowPrompt(true), 3000);
      return () => clearTimeout(timer);
    }
  }, []);

  async function registerAndSubscribe() {
    try {
      // Register service worker
      const registration = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;

      // Check for existing subscription
      let subscription = await registration.pushManager.getSubscription();

      if (!subscription) {
        // Subscribe to push
        const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
        if (!vapidKey) return;

        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidKey).buffer as ArrayBuffer,
        });
      }

      // Send subscription to our server
      await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subscription: subscription.toJSON(),
          userAgent: navigator.userAgent,
        }),
      });
    } catch (err) {
      console.error("Push subscription error:", err);
    }
  }

  async function handleEnable() {
    setSubscribing(true);
    try {
      const result = await Notification.requestPermission();
      setPermission(result);

      if (result === "granted") {
        await registerAndSubscribe();
      }
    } catch (err) {
      console.error("Notification permission error:", err);
    } finally {
      setSubscribing(false);
      setShowPrompt(false);
    }
  }

  // Don't show anything if unsupported, already granted, or denied
  if (permission === "unsupported" || permission === "granted" || permission === "denied") {
    return null;
  }

  if (!showPrompt) return null;

  return (
    <div className="fixed bottom-20 left-4 right-4 z-50 max-w-lg mx-auto animate-in slide-in-from-bottom-4">
      <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-porch-brown/10 flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 text-porch-brown" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-sm text-foreground">
              Get morning briefings on your phone
            </h3>
            <p className="text-xs text-muted mt-0.5">
              Your AI assistant will send you daily updates — what&apos;s selling, what to order, and anything that needs attention.
            </p>
          </div>
          <button
            onClick={() => setShowPrompt(false)}
            className="text-muted hover:text-foreground -mt-1 -mr-1 p-1"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex gap-2 mt-3">
          <button
            onClick={handleEnable}
            disabled={subscribing}
            className="flex-1 bg-porch-brown text-white text-sm font-medium py-2 rounded-lg hover:bg-porch-brown/90 disabled:opacity-50 transition-colors"
          >
            {subscribing ? "Setting up..." : "Enable Notifications"}
          </button>
          <button
            onClick={() => setShowPrompt(false)}
            className="px-4 text-sm text-muted hover:text-foreground py-2 rounded-lg border border-gray-200 transition-colors"
          >
            Later
          </button>
        </div>
      </div>
    </div>
  );
}

// Helper to convert VAPID key from base64 to Uint8Array
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
