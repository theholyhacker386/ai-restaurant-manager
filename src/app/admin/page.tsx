"use client";

import { useState, useEffect, useCallback } from "react";

interface Restaurant {
  id: string;
  name: string;
  status: string;
  owner_name: string;
  owner_email: string;
  created_at: string;
}

interface Invite {
  id: string;
  token: string;
  restaurant_name: string;
  owner_name: string;
  owner_email: string;
  expires_at: string;
  used_at: string | null;
}

export default function AdminPage() {
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [formName, setFormName] = useState("");
  const [formOwnerName, setFormOwnerName] = useState("");
  const [formOwnerEmail, setFormOwnerEmail] = useState("");
  const [creating, setCreating] = useState(false);
  const [newInviteLink, setNewInviteLink] = useState("");

  const loadData = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/restaurants");
      const data = await res.json();
      setRestaurants(data.restaurants || []);
      setInvites(data.invites || []);
    } catch (err) {
      console.error("Failed to load admin data:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleCreateInvite(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setNewInviteLink("");

    try {
      const res = await fetch("/api/admin/restaurants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          restaurantName: formName,
          ownerName: formOwnerName,
          ownerEmail: formOwnerEmail,
        }),
      });

      const data = await res.json();

      if (data.inviteLink) {
        setNewInviteLink(data.inviteLink);
        setFormName("");
        setFormOwnerName("");
        setFormOwnerEmail("");
        loadData();
      }
    } catch (err) {
      console.error("Failed to create invite:", err);
    } finally {
      setCreating(false);
    }
  }

  function copyLink() {
    navigator.clipboard.writeText(newInviteLink);
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
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-porch-brown">Restaurants</h2>
        <button
          onClick={() => { setShowForm(!showForm); setNewInviteLink(""); }}
          className="bg-porch-brown text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-porch-brown-light transition-colors"
        >
          {showForm ? "Cancel" : "+ Add Restaurant"}
        </button>
      </div>

      {/* Create Invite Form */}
      {showForm && (
        <div className="bg-white rounded-xl shadow p-5 space-y-4">
          <h3 className="font-semibold text-porch-brown">Create Restaurant Invite</h3>

          {newInviteLink ? (
            <div className="space-y-3">
              <p className="text-sm text-green-700 font-medium">Invite link created! Share this with the restaurant owner:</p>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={newInviteLink}
                  className="flex-1 text-xs bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 font-mono"
                />
                <button
                  onClick={copyLink}
                  className="bg-porch-brown text-white px-4 py-2.5 rounded-lg text-sm font-medium whitespace-nowrap hover:bg-porch-brown-light transition-colors"
                >
                  Copy
                </button>
              </div>
              <p className="text-xs text-gray-500">This link expires in 7 days.</p>
            </div>
          ) : (
            <form onSubmit={handleCreateInvite} className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Restaurant Name</label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. Joe's Pizza"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-porch-brown focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Owner Name</label>
                <input
                  type="text"
                  required
                  value={formOwnerName}
                  onChange={(e) => setFormOwnerName(e.target.value)}
                  placeholder="e.g. Joe Smith"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-porch-brown focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Owner Email</label>
                <input
                  type="email"
                  required
                  value={formOwnerEmail}
                  onChange={(e) => setFormOwnerEmail(e.target.value)}
                  placeholder="e.g. joe@example.com"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-porch-brown focus:border-transparent"
                />
              </div>
              <button
                type="submit"
                disabled={creating}
                className="bg-porch-brown text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-porch-brown-light transition-colors disabled:opacity-50"
              >
                {creating ? "Creating..." : "Create Invite Link"}
              </button>
            </form>
          )}
        </div>
      )}

      {/* Active Restaurants */}
      {restaurants.length > 0 ? (
        <div className="bg-white rounded-xl shadow divide-y divide-gray-100">
          {restaurants.map((r) => (
            <div key={r.id} className="p-4 flex items-center justify-between">
              <div>
                <p className="font-medium text-porch-brown">{r.name}</p>
                <p className="text-xs text-gray-500">
                  {r.owner_name} &middot; {r.owner_email}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  r.status === "active" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
                }`}>
                  {r.status}
                </span>
                <span className="text-xs text-gray-400">
                  {new Date(r.created_at).toLocaleDateString()}
                </span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow p-8 text-center text-gray-500">
          <p className="text-lg mb-1">No restaurants yet</p>
          <p className="text-sm">Click &quot;Add Restaurant&quot; to create your first invite link.</p>
        </div>
      )}

      {/* Pending Invites */}
      {invites.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Pending Invites</h3>
          <div className="bg-white rounded-xl shadow divide-y divide-gray-100">
            {invites.map((inv) => (
              <div key={inv.id} className="p-4 flex items-center justify-between">
                <div>
                  <p className="font-medium text-porch-brown">{inv.restaurant_name}</p>
                  <p className="text-xs text-gray-500">
                    {inv.owner_name} &middot; {inv.owner_email}
                  </p>
                </div>
                <div className="text-right">
                  {inv.used_at ? (
                    <span className="text-xs text-green-600 font-medium">Used</span>
                  ) : (
                    <span className="text-xs text-amber-600">
                      Expires {new Date(inv.expires_at).toLocaleDateString()}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
