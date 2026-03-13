"use client";

import { useState, useEffect } from "react";

export default function AdminSettingsPage() {
  const [squareAppId, setSquareAppId] = useState("");
  const [squareSecret, setSquareSecret] = useState("");
  const [squareEnv, setSquareEnv] = useState("production");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/admin/settings");
        const data = await res.json();
        if (data.settings) {
          setSquareAppId(data.settings.square_application_id || "");
          setSquareSecret(data.settings.square_application_secret || "");
          setSquareEnv(data.settings.square_environment || "production");
        }
      } catch {
        console.error("Failed to load settings");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    setError("");

    try {
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          settings: {
            square_application_id: squareAppId,
            square_application_secret: squareSecret,
            square_environment: squareEnv,
          },
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save");
      }

      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-porch-brown" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Back link */}
      <a href="/admin" className="text-sm text-porch-brown hover:underline">&larr; Back to Dashboard</a>

      <h2 className="text-xl font-bold text-porch-brown">Platform Settings</h2>

      {/* Square POS Connection */}
      <div className="bg-white rounded-xl shadow p-5 space-y-4">
        <div className="flex items-center gap-3 mb-2">
          <span className="text-2xl">🟦</span>
          <div>
            <h3 className="font-semibold text-porch-brown text-lg">Square POS Connection</h3>
            <p className="text-sm text-gray-500">
              Connect your platform to Square so restaurant owners can link their POS during onboarding.
            </p>
          </div>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Application ID
            </label>
            <input
              type="text"
              value={squareAppId}
              onChange={(e) => setSquareAppId(e.target.value)}
              placeholder="sq0idp-..."
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm font-mono focus:ring-2 focus:ring-porch-brown focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Application Secret
            </label>
            <input
              type="password"
              value={squareSecret}
              onChange={(e) => setSquareSecret(e.target.value)}
              placeholder="sq0csp-..."
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm font-mono focus:ring-2 focus:ring-porch-brown focus:border-transparent"
            />
            <p className="text-xs text-gray-400 mt-1">This is stored securely and never shown in full after saving.</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Environment
            </label>
            <select
              value={squareEnv}
              onChange={(e) => setSquareEnv(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-porch-brown focus:border-transparent"
            >
              <option value="production">Production (live data)</option>
              <option value="sandbox">Sandbox (testing only)</option>
            </select>
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
          )}

          {saved && (
            <p className="text-sm text-green-600 bg-green-50 px-3 py-2 rounded-lg">
              Settings saved successfully!
            </p>
          )}

          <button
            type="submit"
            disabled={saving || !squareAppId}
            className="bg-porch-brown text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-porch-brown-light transition-colors disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Square Settings"}
          </button>
        </form>
      </div>

      {/* Connection Status */}
      <div className="bg-white rounded-xl shadow p-5">
        <h3 className="font-semibold text-porch-brown mb-3">Connection Status</h3>
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-600">Square Application ID</span>
            <span className={squareAppId && !squareAppId.startsWith("••") ? "text-green-600 font-medium" : "text-amber-600"}>
              {squareAppId ? "Configured" : "Not set"}
            </span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-600">Square Application Secret</span>
            <span className={squareSecret ? "text-green-600 font-medium" : "text-amber-600"}>
              {squareSecret ? "Configured" : "Not set"}
            </span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-600">Environment</span>
            <span className="font-medium">{squareEnv === "production" ? "Production" : "Sandbox"}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
