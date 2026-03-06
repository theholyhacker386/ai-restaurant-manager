"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";

/* eslint-disable @typescript-eslint/no-explicit-any */

interface TeamMember {
  id: string;
  email: string;
  name: string;
  role: string;
  pin: string | null;
  has_pin: boolean;
  setup_token: string | null;
  setup_token_expires: string | null;
  created_at: string;
}

interface BusinessSettings {
  food_cost_target: number;
  food_cost_warning: number;
  rplh_target: number;
  max_staff: number;
  min_shift_hours: number;
  labor_cost_target: number;
  employer_burden_rate: number;
  business_hours: Record<string, { open: string; close: string } | null>;
}

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const APP_URL = typeof window !== "undefined" ? window.location.origin : "";

type Tab = "business" | "team" | "account" | "security";

export default function SettingsPage() {
  const { data: session } = useSession();
  const [tab, setTab] = useState<Tab>("business");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const userRole = (session?.user as any)?.role;

  if (userRole !== "owner") {
    return (
      <div className="py-20 text-center">
        <p className="text-muted">Only the owner can access settings.</p>
      </div>
    );
  }

  return (
    <div className="pb-8">
      <div className="mb-4">
        <h2 className="text-lg font-bold text-foreground">Settings</h2>
        <p className="text-xs text-muted">Customize your restaurant&apos;s numbers and team</p>
      </div>

      {/* Messages */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4">
          <p className="text-sm text-red-700">{error}</p>
          <button onClick={() => setError("")} className="text-xs text-red-500 mt-1 underline">Dismiss</button>
        </div>
      )}
      {success && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 mb-4">
          <p className="text-sm text-emerald-700">{success}</p>
          <button onClick={() => setSuccess("")} className="text-xs text-emerald-500 mt-1 underline">Dismiss</button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-porch-cream/60 rounded-xl p-1 mb-5">
        {([
          { id: "business" as Tab, label: "Business" },
          { id: "team" as Tab, label: "Team" },
          { id: "account" as Tab, label: "Account" },
          { id: "security" as Tab, label: "Security" },
        ]).map((t) => (
          <button
            key={t.id}
            onClick={() => { setTab(t.id); setError(""); setSuccess(""); }}
            className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-colors ${
              tab === t.id
                ? "bg-white text-foreground shadow-sm"
                : "text-porch-brown-light/60"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "business" && <BusinessSettingsTab onError={setError} onSuccess={setSuccess} />}
      {tab === "team" && <TeamTab onError={setError} onSuccess={setSuccess} />}
      {tab === "account" && <AccountTab onError={setError} onSuccess={setSuccess} />}
      {tab === "security" && <SecurityTab />}
    </div>
  );
}

/* ================================================================ */
/* BUSINESS SETTINGS TAB                                             */
/* ================================================================ */

function BusinessSettingsTab({
  onError,
  onSuccess,
}: {
  onError: (msg: string) => void;
  onSuccess: (msg: string) => void;
}) {
  const [settings, setSettings] = useState<BusinessSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data) => {
        setSettings(data.settings);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  async function handleSave() {
    if (!settings) return;
    setSaving(true);
    onError("");

    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (!res.ok) throw new Error();
      onSuccess("Settings saved! Changes will take effect on your next page load.");
    } catch {
      onError("Failed to save settings. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  function updateField(field: keyof BusinessSettings, value: any) {
    if (!settings) return;
    setSettings({ ...settings, [field]: value });
  }

  function updateHours(day: string, field: "open" | "close", value: string) {
    if (!settings) return;
    const hours = { ...settings.business_hours };
    if (!hours[day]) hours[day] = { open: "08:00", close: "18:00" };
    hours[day] = { ...hours[day]!, [field]: value };
    setSettings({ ...settings, business_hours: hours });
  }

  function toggleDay(day: string) {
    if (!settings) return;
    const hours = { ...settings.business_hours };
    if (hours[day]) {
      hours[day] = null;
    } else {
      hours[day] = { open: "08:00", close: "18:00" };
    }
    setSettings({ ...settings, business_hours: hours });
  }

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-porch-brown" />
      </div>
    );
  }

  if (!settings) return <p className="text-sm text-muted py-8 text-center">Couldn&apos;t load settings.</p>;

  return (
    <div className="space-y-5">
      {/* Food Cost */}
      <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <h3 className="text-sm font-bold text-foreground mb-1">Food Cost Targets</h3>
        <p className="text-[11px] text-muted mb-3">
          What % of each item&apos;s price should go toward ingredients? Items above these marks get flagged.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-muted block mb-1">Target %</label>
            <div className="relative">
              <input
                type="number"
                value={settings.food_cost_target}
                onChange={(e) => updateField("food_cost_target", Number(e.target.value))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm pr-8 focus:outline-none focus:ring-2 focus:ring-porch-teal/30"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted">%</span>
            </div>
            <p className="text-[10px] text-emerald-600 mt-1">Items at or below = Good</p>
          </div>
          <div>
            <label className="text-xs font-medium text-muted block mb-1">Warning %</label>
            <div className="relative">
              <input
                type="number"
                value={settings.food_cost_warning}
                onChange={(e) => updateField("food_cost_warning", Number(e.target.value))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm pr-8 focus:outline-none focus:ring-2 focus:ring-porch-teal/30"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted">%</span>
            </div>
            <p className="text-[10px] text-status-danger mt-1">Above this = Too High</p>
          </div>
        </div>
      </section>

      {/* Staffing */}
      <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <h3 className="text-sm font-bold text-foreground mb-1">Staffing</h3>
        <p className="text-[11px] text-muted mb-3">
          Controls how the Schedule page calculates how many people you need each hour.
        </p>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted block mb-1">
              Revenue target per person per hour ($)
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted">$</span>
              <input
                type="number"
                value={settings.rplh_target}
                onChange={(e) => updateField("rplh_target", Number(e.target.value))}
                className="w-full border border-gray-200 rounded-lg pl-7 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-porch-teal/30"
              />
            </div>
            <p className="text-[10px] text-muted mt-1">
              Higher = fewer staff recommended. Lower = more staff.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted block mb-1">Max people at once</label>
              <input
                type="number"
                min={1}
                max={20}
                value={settings.max_staff}
                onChange={(e) => updateField("max_staff", Number(e.target.value))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-porch-teal/30"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted block mb-1">Min shift (hours)</label>
              <input
                type="number"
                min={1}
                max={12}
                value={settings.min_shift_hours}
                onChange={(e) => updateField("min_shift_hours", Number(e.target.value))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-porch-teal/30"
              />
              <p className="text-[10px] text-muted mt-1">Extra staff get at least this many hours</p>
            </div>
          </div>
        </div>
      </section>

      {/* Labor */}
      <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <h3 className="text-sm font-bold text-foreground mb-1">Labor Costs</h3>
        <p className="text-[11px] text-muted mb-3">
          What % of revenue should go to labor? Used for reports and alerts.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-muted block mb-1">Labor target %</label>
            <div className="relative">
              <input
                type="number"
                value={settings.labor_cost_target}
                onChange={(e) => updateField("labor_cost_target", Number(e.target.value))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm pr-8 focus:outline-none focus:ring-2 focus:ring-porch-teal/30"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted">%</span>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted block mb-1">Employer taxes %</label>
            <div className="relative">
              <input
                type="number"
                value={settings.employer_burden_rate}
                onChange={(e) => updateField("employer_burden_rate", Number(e.target.value))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm pr-8 focus:outline-none focus:ring-2 focus:ring-porch-teal/30"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted">%</span>
            </div>
            <p className="text-[10px] text-muted mt-1">FICA, FUTA, state taxes, etc.</p>
          </div>
        </div>
      </section>

      {/* Business Hours */}
      <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <h3 className="text-sm font-bold text-foreground mb-1">Business Hours</h3>
        <p className="text-[11px] text-muted mb-3">
          Which days are you open and when? The schedule uses these to know which hours to plan for.
        </p>
        <div className="space-y-2">
          {DAY_NAMES.map((dayName, idx) => {
            const dayKey = String(idx);
            const isOpen = !!settings.business_hours[dayKey];
            const hours = settings.business_hours[dayKey];

            return (
              <div key={dayKey} className="flex items-center gap-2">
                <button
                  onClick={() => toggleDay(dayKey)}
                  className={`w-8 h-5 rounded-full transition-colors relative ${
                    isOpen ? "bg-porch-teal" : "bg-gray-300"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                      isOpen ? "left-3.5" : "left-0.5"
                    }`}
                  />
                </button>
                <span className="text-xs font-medium text-foreground w-16">{dayName.slice(0, 3)}</span>
                {isOpen && hours ? (
                  <div className="flex items-center gap-1 flex-1">
                    <input
                      type="time"
                      value={hours.open}
                      onChange={(e) => updateHours(dayKey, "open", e.target.value)}
                      className="border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-porch-teal/30"
                    />
                    <span className="text-xs text-muted">to</span>
                    <input
                      type="time"
                      value={hours.close}
                      onChange={(e) => updateHours(dayKey, "close", e.target.value)}
                      className="border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-porch-teal/30"
                    />
                  </div>
                ) : (
                  <span className="text-xs text-muted">Closed</span>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Save Button */}
      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full bg-porch-teal text-white text-sm font-semibold py-3 rounded-xl hover:bg-porch-teal-light disabled:opacity-50 transition-colors"
      >
        {saving ? "Saving..." : "Save Settings"}
      </button>
    </div>
  );
}

/* ================================================================ */
/* TEAM TAB                                                          */
/* ================================================================ */

function TeamTab({
  onError,
  onSuccess,
}: {
  onError: (msg: string) => void;
  onSuccess: (msg: string) => void;
}) {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);

  // Add member
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState("manager");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [setupLink, setSetupLink] = useState("");

  // Edit member
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editPin, setEditPin] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  useEffect(() => {
    loadTeam();
  }, []);

  async function loadTeam() {
    try {
      const res = await fetch("/api/team");
      if (res.ok) {
        const data = await res.json();
        setMembers(data);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    onError("");
    onSuccess("");
    setSetupLink("");

    try {
      const body: any = { name: newName.trim(), role: newRole };
      if (newRole === "owner") {
        body.email = newEmail.trim();
        body.password = newPassword;
      }

      const res = await fetch("/api/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Failed");
      onSuccess("Team member added!");
      setNewName("");
      setNewEmail("");
      setNewPassword("");
      setShowAdd(false);
      loadTeam();
    } catch {
      onError("Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  async function handleSetPin(memberId: string) {
    if (!/^\d{4,6}$/.test(editPin)) {
      onError("PIN must be 4-6 digits");
      return;
    }
    setEditSaving(true);
    onError("");

    try {
      const res = await fetch("/api/team", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: memberId, pin: editPin }),
      });

      const data = await res.json();
      if (!res.ok) {
        onError(data.error || "Failed to set PIN");
        setEditSaving(false);
        return;
      }

      onSuccess("PIN updated!");
      setEditPin("");
      setExpandedId(null);
      loadTeam();
    } catch {
      onError("Something went wrong");
    } finally {
      setEditSaving(false);
    }
  }

  async function handleRemovePin(memberId: string) {
    if (!confirm("Remove this PIN? They won't be able to log in until a new one is set.")) return;
    onError("");

    try {
      const res = await fetch("/api/team", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: memberId, removePin: true }),
      });

      if (res.ok) {
        onSuccess("PIN removed.");
        loadTeam();
      }
    } catch {
      onError("Something went wrong");
    }
  }

  async function handleRegenerateLink(memberId: string) {
    onError("");

    try {
      const res = await fetch("/api/team", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: memberId, regenerateLink: true }),
      });

      const data = await res.json();
      if (res.ok) {
        setSetupLink(`${APP_URL}/setup?token=${data.setupToken}`);
        onSuccess("New setup link generated!");
        loadTeam();
      }
    } catch {
      onError("Something went wrong");
    }
  }

  async function handleRemove(member: TeamMember) {
    if (!confirm(`Remove ${member.name} from the team? They won't be able to log in anymore.`)) return;

    try {
      const res = await fetch("/api/team", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: member.id }),
      });

      if (res.ok) {
        onSuccess(`${member.name} has been removed.`);
        loadTeam();
      }
    } catch {
      onError("Failed to remove team member");
    }
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    onSuccess("Link copied!");
  }

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-porch-brown" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted">Manage who has access to your dashboard. Tap a team member to change their PIN.</p>

      {/* Setup link display */}
      {setupLink && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <p className="text-sm font-medium text-blue-900 mb-2">Send this link to your new team member:</p>
          <div className="bg-white rounded-lg border border-blue-200 px-3 py-2 mb-2">
            <p className="text-xs text-blue-800 break-all font-mono">{setupLink}</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => copyToClipboard(setupLink)}
              className="flex-1 text-sm font-medium py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
            >
              Copy Link
            </button>
            <button
              onClick={() => setSetupLink("")}
              className="px-4 text-sm text-blue-700 py-2 rounded-lg border border-blue-200 hover:bg-blue-100 transition-colors"
            >
              Done
            </button>
          </div>
          <p className="text-[11px] text-blue-600 mt-2">
            They&apos;ll open this link and pick a PIN. That&apos;s it — they can log in right away.
          </p>
        </div>
      )}

      {/* Team list */}
      <div className="space-y-2">
        {members.map((member) => {
          const isExpanded = expandedId === member.id;
          const isOwner = member.role === "owner";
          const hasActiveSetupLink = member.setup_token && member.setup_token_expires && new Date(member.setup_token_expires) > new Date();

          return (
            <div key={member.id} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <button
                onClick={() => {
                  if (!isOwner) {
                    setExpandedId(isExpanded ? null : member.id);
                    setEditPin("");
                  }
                }}
                className={`w-full p-4 flex items-center justify-between text-left ${!isOwner ? "active:bg-gray-50" : ""}`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-porch-brown/10 flex items-center justify-center flex-shrink-0">
                    <span className="text-sm font-bold text-porch-brown">
                      {member.name[0].toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-foreground">{member.name}</h3>
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                          isOwner ? "bg-porch-brown text-white" : "bg-blue-100 text-blue-700"
                        }`}
                      >
                        {isOwner ? "Owner" : "Manager"}
                      </span>
                    </div>
                    {!isOwner && (
                      <p className="text-xs text-muted mt-0.5">
                        {member.has_pin ? (
                          <span className="text-emerald-600">PIN: {member.pin || "••••"}</span>
                        ) : hasActiveSetupLink ? (
                          <span className="text-amber-600">Waiting for setup...</span>
                        ) : (
                          <span className="text-red-500">No PIN set</span>
                        )}
                      </p>
                    )}
                  </div>
                </div>
                {!isOwner && (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                  >
                    <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                  </svg>
                )}
              </button>

              {isExpanded && !isOwner && (
                <div className="border-t border-gray-100 px-4 py-3 space-y-3 bg-gray-50/50">
                  <div>
                    <label className="text-xs font-medium text-muted block mb-1">
                      {member.has_pin ? "Change PIN" : "Set PIN"}
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="tel"
                        inputMode="numeric"
                        maxLength={6}
                        value={editPin}
                        onChange={(e) => setEditPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                        className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm text-center tracking-widest font-mono focus:outline-none focus:ring-2 focus:ring-porch-brown/30"
                        placeholder="4-6 digits"
                      />
                      <button
                        onClick={() => handleSetPin(member.id)}
                        disabled={editSaving || editPin.length < 4}
                        className="px-4 text-sm font-medium py-2 rounded-lg bg-porch-brown text-white hover:bg-porch-brown/90 disabled:opacity-50 transition-colors"
                      >
                        {editSaving ? "..." : "Save"}
                      </button>
                    </div>
                  </div>
                  {member.has_pin && (
                    <button
                      onClick={() => handleRemovePin(member.id)}
                      className="w-full text-sm text-amber-600 font-medium py-2 rounded-lg border border-amber-200 hover:bg-amber-50 transition-colors"
                    >
                      Remove PIN
                    </button>
                  )}
                  {!member.has_pin && (
                    <button
                      onClick={() => handleRegenerateLink(member.id)}
                      className="w-full text-sm text-blue-600 font-medium py-2 rounded-lg border border-blue-200 hover:bg-blue-50 transition-colors"
                    >
                      Generate New Setup Link
                    </button>
                  )}
                  <button
                    onClick={() => handleRemove(member)}
                    className="w-full text-sm text-red-500 font-medium py-2 rounded-lg border border-red-200 hover:bg-red-50 transition-colors"
                  >
                    Remove from Team
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Add team member */}
      {!showAdd ? (
        <button
          onClick={() => { setShowAdd(true); setSetupLink(""); }}
          className="w-full bg-porch-brown text-white text-sm font-medium py-3 rounded-xl hover:bg-porch-brown/90 transition-colors"
        >
          + Add Team Member
        </button>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <h3 className="text-sm font-semibold text-foreground mb-1">Add Team Member</h3>
          <p className="text-xs text-muted mb-3">
            Just enter their name. You&apos;ll get a link to send them so they can set up their PIN.
          </p>
          <form onSubmit={handleAdd} className="space-y-3">
            <div>
              <label className="text-xs font-medium text-muted block mb-1">Name</label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Doris"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-porch-brown/30"
                required
                autoFocus
              />
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={saving}
                className="flex-1 bg-porch-brown text-white text-sm font-medium py-2.5 rounded-lg hover:bg-porch-brown/90 disabled:opacity-50 transition-colors"
              >
                {saving ? "Adding..." : "Add & Get Setup Link"}
              </button>
              <button
                type="button"
                onClick={() => { setShowAdd(false); }}
                className="px-4 text-sm text-muted hover:text-foreground py-2.5 rounded-lg border border-gray-200 transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

/* ================================================================ */
/* ACCOUNT TAB                                                       */
/* ================================================================ */

function AccountTab({
  onError,
  onSuccess,
}: {
  onError: (msg: string) => void;
  onSuccess: (msg: string) => void;
}) {
  const { data: session } = useSession();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);

  const userEmail = session?.user?.email || "";

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      onError("New passwords don't match.");
      return;
    }
    if (newPassword.length < 6) {
      onError("Password must be at least 6 characters.");
      return;
    }

    setSaving(true);
    onError("");

    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      if (!res.ok) {
        const data = await res.json();
        onError(data.error || "Failed to change password.");
        setSaving(false);
        return;
      }

      onSuccess("Password changed successfully!");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch {
      onError("Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* Account info */}
      <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <h3 className="text-sm font-bold text-foreground mb-2">Your Account</h3>
        <div className="space-y-2">
          <div>
            <span className="text-xs text-muted">Email</span>
            <p className="text-sm text-foreground">{userEmail}</p>
          </div>
          <div>
            <span className="text-xs text-muted">Role</span>
            <p className="text-sm text-foreground">Owner</p>
          </div>
        </div>
      </section>

      {/* Change Password */}
      <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <h3 className="text-sm font-bold text-foreground mb-1">Change Password</h3>
        <p className="text-[11px] text-muted mb-3">Update your login password.</p>
        <form onSubmit={handleChangePassword} className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted block mb-1">Current Password</label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-porch-brown/30"
              required
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted block mb-1">New Password</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-porch-brown/30"
              required
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted block mb-1">Confirm New Password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-porch-brown/30"
              required
            />
          </div>
          <button
            type="submit"
            disabled={saving}
            className="w-full bg-porch-brown text-white text-sm font-semibold py-2.5 rounded-xl hover:bg-porch-brown/90 disabled:opacity-50 transition-colors"
          >
            {saving ? "Updating..." : "Update Password"}
          </button>
        </form>
      </section>
    </div>
  );
}

/* ================================================================ */
/* SECURITY TAB                                                      */
/* ================================================================ */

interface AuditEntry {
  id: string;
  event_type: string;
  user_id: string | null;
  user_email: string | null;
  user_role: string | null;
  ip_address: string | null;
  resource: string | null;
  details: any;
  created_at: string;
}

const EVENT_TYPE_OPTIONS = [
  { value: "", label: "All Events" },
  { value: "login", label: "Logins" },
  { value: "login_failed", label: "Failed Logins" },
  { value: "access_denied", label: "Access Denied" },
  { value: "user_created", label: "User Created" },
  { value: "user_deleted", label: "User Deleted" },
  { value: "user_deactivated", label: "User Deactivated" },
  { value: "settings_changed", label: "Settings Changed" },
  { value: "password_changed", label: "Password Changed" },
  { value: "mfa_enabled", label: "MFA Enabled" },
  { value: "mfa_disabled", label: "MFA Disabled" },
  { value: "mfa_failed", label: "MFA Failed" },
];

function getEventColor(eventType: string): string {
  switch (eventType) {
    case "login":
      return "border-l-emerald-500 bg-emerald-50/50";
    case "login_failed":
    case "access_denied":
      return "border-l-red-500 bg-red-50/50";
    case "user_created":
    case "user_deleted":
    case "user_deactivated":
      return "border-l-blue-500 bg-blue-50/50";
    case "settings_changed":
    case "password_changed":
      return "border-l-amber-500 bg-amber-50/50";
    case "mfa_enabled":
      return "border-l-emerald-500 bg-emerald-50/50";
    case "mfa_disabled":
      return "border-l-amber-500 bg-amber-50/50";
    case "mfa_failed":
      return "border-l-red-500 bg-red-50/50";
    default:
      return "border-l-gray-400 bg-gray-50/50";
  }
}

function getEventLabel(eventType: string): string {
  return eventType
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function timeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return "just now";
  if (seconds < 3600) {
    const mins = Math.floor(seconds / 60);
    return `${mins} min${mins > 1 ? "s" : ""} ago`;
  }
  if (seconds < 86400) {
    const hrs = Math.floor(seconds / 3600);
    return `${hrs} hour${hrs > 1 ? "s" : ""} ago`;
  }
  if (seconds < 604800) {
    const days = Math.floor(seconds / 86400);
    return `${days} day${days > 1 ? "s" : ""} ago`;
  }

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });
}

function SecurityTab() {
  return (
    <div className="space-y-5">
      <MfaSection />
      <AuditLogSection />
    </div>
  );
}

/* ================================================================ */
/* MFA SECTION (inside Security tab)                                  */
/* ================================================================ */

function MfaSection() {
  const [mfaEnabled, setMfaEnabled] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [setupStep, setSetupStep] = useState(0); // 0=none, 1=QR, 2=verify, 3=backup codes
  const [qrCode, setQrCode] = useState("");
  const [manualSecret, setManualSecret] = useState("");
  const [verifyCode, setVerifyCode] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [showDisableModal, setShowDisableModal] = useState(false);
  const [disableCode, setDisableCode] = useState("");
  const [copiedCodes, setCopiedCodes] = useState(false);

  useEffect(() => {
    fetch("/api/auth/mfa")
      .then((r) => r.json())
      .then((data) => {
        setMfaEnabled(data.mfaEnabled);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  async function startSetup() {
    setError("");
    setActionLoading(true);
    try {
      const res = await fetch("/api/auth/mfa/setup", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to start setup");
        setActionLoading(false);
        return;
      }
      setQrCode(data.qrCode);
      setManualSecret(data.secret);
      setSetupStep(1);
    } catch {
      setError("Something went wrong");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleVerify() {
    if (verifyCode.length !== 6) return;
    setError("");
    setActionLoading(true);
    try {
      const res = await fetch("/api/auth/mfa/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: verifyCode }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Invalid code");
        setActionLoading(false);
        return;
      }
      setBackupCodes(data.backupCodes);
      setSetupStep(3);
      setMfaEnabled(true);
    } catch {
      setError("Something went wrong");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleRegenerateBackupCodes() {
    setError("");
    setActionLoading(true);
    try {
      const res = await fetch("/api/auth/mfa/backup", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to regenerate");
        setActionLoading(false);
        return;
      }
      setBackupCodes(data.backupCodes);
      setSetupStep(3); // Show backup codes
    } catch {
      setError("Something went wrong");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleDisable() {
    if (!disableCode) return;
    setError("");
    setActionLoading(true);
    try {
      const res = await fetch("/api/auth/mfa", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: disableCode }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Invalid code");
        setActionLoading(false);
        return;
      }
      setMfaEnabled(false);
      setShowDisableModal(false);
      setDisableCode("");
      setSetupStep(0);
    } catch {
      setError("Something went wrong");
    } finally {
      setActionLoading(false);
    }
  }

  function copyAllCodes() {
    navigator.clipboard.writeText(backupCodes.join("\n"));
    setCopiedCodes(true);
    setTimeout(() => setCopiedCodes(false), 2000);
  }

  if (loading) {
    return (
      <div className="flex justify-center py-6">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-porch-brown" />
      </div>
    );
  }

  return (
    <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-bold text-foreground">Two-Factor Authentication</h3>
        <span
          className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
            mfaEnabled
              ? "bg-emerald-100 text-emerald-700"
              : "bg-gray-100 text-gray-500"
          }`}
        >
          {mfaEnabled ? "Enabled" : "Not Enabled"}
        </span>
      </div>
      <p className="text-[11px] text-muted mb-3">
        Add an extra layer of security. After entering your password, you&apos;ll also need a code from an authenticator app (like Google Authenticator or Authy).
      </p>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2 mb-3">
          {error}
          <button onClick={() => setError("")} className="ml-2 text-xs underline">dismiss</button>
        </div>
      )}

      {/* MFA NOT enabled — show setup button or wizard */}
      {!mfaEnabled && setupStep === 0 && (
        <button
          onClick={startSetup}
          disabled={actionLoading}
          className="w-full bg-porch-teal text-white text-sm font-semibold py-2.5 rounded-xl hover:bg-porch-teal-light disabled:opacity-50 transition-colors"
        >
          {actionLoading ? "Setting up..." : "Set Up 2FA"}
        </button>
      )}

      {/* Step 1: QR Code */}
      {setupStep === 1 && (
        <div className="space-y-3">
          <p className="text-xs text-foreground font-medium">Step 1: Scan this QR code with your authenticator app</p>
          <div className="flex justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrCode} alt="QR Code for authenticator app" className="w-48 h-48" />
          </div>
          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-[10px] text-muted mb-1">Can&apos;t scan? Enter this code manually:</p>
            <p className="text-xs font-mono text-foreground break-all select-all">{manualSecret}</p>
          </div>
          <button
            onClick={() => setSetupStep(2)}
            className="w-full bg-porch-brown text-white text-sm font-medium py-2.5 rounded-xl hover:bg-porch-brown/90 transition-colors"
          >
            Next
          </button>
          <button
            onClick={() => { setSetupStep(0); setError(""); }}
            className="w-full text-sm text-muted py-2 hover:text-foreground transition-colors"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Step 2: Verify code */}
      {setupStep === 2 && (
        <div className="space-y-3">
          <p className="text-xs text-foreground font-medium">Step 2: Enter the 6-digit code from your authenticator app</p>
          <input
            type="text"
            inputMode="numeric"
            maxLength={6}
            value={verifyCode}
            onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            className="w-full px-3 py-3 border border-gray-200 rounded-lg text-center text-xl tracking-[0.3em] font-mono focus:outline-none focus:ring-2 focus:ring-porch-brown/30"
            placeholder="000000"
            autoFocus
          />
          <button
            onClick={handleVerify}
            disabled={actionLoading || verifyCode.length !== 6}
            className="w-full bg-porch-brown text-white text-sm font-medium py-2.5 rounded-xl hover:bg-porch-brown/90 disabled:opacity-50 transition-colors"
          >
            {actionLoading ? "Verifying..." : "Verify & Enable"}
          </button>
          <button
            onClick={() => { setSetupStep(1); setVerifyCode(""); setError(""); }}
            className="w-full text-sm text-muted py-2 hover:text-foreground transition-colors"
          >
            Back
          </button>
        </div>
      )}

      {/* Step 3: Backup codes */}
      {setupStep === 3 && (
        <div className="space-y-3">
          <p className="text-xs text-foreground font-medium">Step 3: Save your backup codes</p>
          <p className="text-[11px] text-muted">
            These are one-time-use codes. If you lose access to your authenticator app, use one of these to log in. Store them somewhere safe!
          </p>
          <div className="grid grid-cols-2 gap-2">
            {backupCodes.map((code, i) => (
              <div key={i} className="bg-gray-50 rounded-lg px-3 py-2 text-center">
                <span className="text-sm font-mono text-foreground">{code}</span>
              </div>
            ))}
          </div>
          <button
            onClick={copyAllCodes}
            className="w-full text-sm font-medium py-2.5 rounded-xl border border-gray-200 text-porch-brown hover:bg-porch-cream/30 transition-colors"
          >
            {copiedCodes ? "Copied!" : "Copy All Codes"}
          </button>
          <button
            onClick={() => { setSetupStep(0); setBackupCodes([]); setVerifyCode(""); }}
            className="w-full bg-porch-brown text-white text-sm font-medium py-2.5 rounded-xl hover:bg-porch-brown/90 transition-colors"
          >
            Done
          </button>
        </div>
      )}

      {/* MFA IS enabled — show management options */}
      {mfaEnabled && setupStep === 0 && (
        <div className="space-y-2">
          <button
            onClick={handleRegenerateBackupCodes}
            disabled={actionLoading}
            className="w-full text-sm font-medium py-2.5 rounded-xl border border-gray-200 text-porch-brown hover:bg-porch-cream/30 disabled:opacity-50 transition-colors"
          >
            {actionLoading ? "Generating..." : "Regenerate Backup Codes"}
          </button>
          <button
            onClick={() => setShowDisableModal(true)}
            className="w-full text-sm font-medium py-2.5 rounded-xl border border-red-200 text-red-600 hover:bg-red-50 transition-colors"
          >
            Disable 2FA
          </button>
        </div>
      )}

      {/* Disable modal */}
      {showDisableModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-5 max-w-sm w-full shadow-xl">
            <h4 className="text-sm font-bold text-foreground mb-2">Disable Two-Factor Authentication</h4>
            <p className="text-xs text-muted mb-3">
              Enter a code from your authenticator app to confirm.
            </p>
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg px-3 py-2 mb-3">
                {error}
              </div>
            )}
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={disableCode}
              onChange={(e) => setDisableCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              className="w-full px-3 py-3 border border-gray-200 rounded-lg text-center text-xl tracking-[0.3em] font-mono focus:outline-none focus:ring-2 focus:ring-porch-brown/30 mb-3"
              placeholder="000000"
              autoFocus
            />
            <div className="flex gap-2">
              <button
                onClick={handleDisable}
                disabled={actionLoading || disableCode.length !== 6}
                className="flex-1 bg-red-600 text-white text-sm font-medium py-2.5 rounded-xl hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {actionLoading ? "Disabling..." : "Disable"}
              </button>
              <button
                onClick={() => { setShowDisableModal(false); setDisableCode(""); setError(""); }}
                className="flex-1 text-sm text-muted py-2.5 rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

/* ================================================================ */
/* AUDIT LOG SECTION (inside Security tab)                            */
/* ================================================================ */

function AuditLogSection() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [filter, setFilter] = useState("");
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const LIMIT = 50;

  useEffect(() => {
    setEntries([]);
    setOffset(0);
    setHasMore(true);
    loadEntries(0, true);
  }, [filter]);

  async function loadEntries(currentOffset: number, reset = false) {
    if (reset) setLoading(true);
    else setLoadingMore(true);

    try {
      const params = new URLSearchParams({
        limit: String(LIMIT),
        offset: String(currentOffset),
      });
      if (filter) params.set("type", filter);

      const res = await fetch(`/api/audit?${params}`);
      if (res.ok) {
        const data = await res.json();
        if (reset) {
          setEntries(data.entries);
        } else {
          setEntries((prev) => [...prev, ...data.entries]);
        }
        setHasMore(data.entries.length === LIMIT);
        setOffset(currentOffset + data.entries.length);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-porch-brown" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-bold text-foreground">Activity Log</h3>
      <p className="text-xs text-muted">
        View who logged in, what changed, and any blocked access attempts.
      </p>

      {/* Filter */}
      <select
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-porch-brown/30"
      >
        {EVENT_TYPE_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>

      {/* Entries */}
      {entries.length === 0 ? (
        <div className="text-center py-10">
          <p className="text-sm text-muted">No events found.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {entries.map((entry) => (
            <div
              key={entry.id}
              className={`rounded-xl border border-gray-100 border-l-4 p-3 ${getEventColor(entry.event_type)}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-xs font-semibold text-foreground">
                      {getEventLabel(entry.event_type)}
                    </span>
                  </div>
                  {entry.user_email && (
                    <p className="text-[11px] text-muted truncate">
                      {entry.user_email}
                      {entry.user_role && (
                        <span className="ml-1 text-porch-brown-light/60">({entry.user_role})</span>
                      )}
                    </p>
                  )}
                  {entry.resource && (
                    <p className="text-[11px] text-muted truncate">
                      Page: {entry.resource}
                    </p>
                  )}
                  {entry.details && (
                    <p className="text-[11px] text-muted mt-0.5">
                      {entry.details.reason && (
                        <span>Reason: {entry.details.reason.replace(/_/g, " ")}</span>
                      )}
                      {entry.details.method && (
                        <span className="ml-2">via {entry.details.method}</span>
                      )}
                      {entry.details.createdUserName && (
                        <span>Added: {entry.details.createdUserName}</span>
                      )}
                      {entry.details.deletedUserName && (
                        <span>Removed: {entry.details.deletedUserName}</span>
                      )}
                      {entry.details.deactivatedUserName && (
                        <span>Deactivated: {entry.details.deactivatedUserName}</span>
                      )}
                    </p>
                  )}
                </div>
                <span className="text-[10px] text-muted whitespace-nowrap flex-shrink-0">
                  {timeAgo(entry.created_at)}
                </span>
              </div>
              {entry.ip_address && entry.ip_address !== "unknown" && (
                <p className="text-[10px] text-muted/60 mt-1">
                  IP: {entry.ip_address}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Load More */}
      {hasMore && entries.length > 0 && (
        <button
          onClick={() => loadEntries(offset)}
          disabled={loadingMore}
          className="w-full text-sm font-medium py-2.5 rounded-xl border border-gray-200 text-porch-brown hover:bg-porch-cream/30 disabled:opacity-50 transition-colors"
        >
          {loadingMore ? "Loading..." : "Load More"}
        </button>
      )}
    </div>
  );
}
