"use client";

import { useEffect, useState, useCallback } from "react";

/* eslint-disable @typescript-eslint/no-explicit-any */

// ── Suggested reminders for quick-add ──
const SUGGESTED_REMINDERS = [
  { title: "Clean the grease trap", frequency: "monthly", description: "Deep clean grease trap and disposal" },
  { title: "Run payroll", frequency: "biweekly", description: "Process employee payroll" },
  { title: "Pay sales tax", frequency: "quarterly", description: "File and pay quarterly sales tax" },
  { title: "Order inventory", frequency: "weekly", description: "Place weekly supply orders" },
  { title: "Deep clean kitchen", frequency: "weekly", description: "Full kitchen deep clean" },
  { title: "Health inspection prep", frequency: "yearly", description: "Prepare for annual health inspection" },
  { title: "Change water filters", frequency: "quarterly", description: "Replace water filtration filters" },
  { title: "Fire extinguisher check", frequency: "monthly", description: "Inspect fire extinguishers" },
  { title: "Update menu prices", frequency: "quarterly", description: "Review and adjust menu pricing" },
  { title: "Equipment maintenance", frequency: "monthly", description: "Check and service kitchen equipment" },
  { title: "Clean hood vents", frequency: "monthly", description: "Clean exhaust hood and vents" },
  { title: "Pest control service", frequency: "monthly", description: "Scheduled pest control visit" },
  { title: "File income taxes", frequency: "yearly", description: "Prepare and file annual income taxes" },
  { title: "Renew business license", frequency: "yearly", description: "Renew business permits and licenses" },
  { title: "Staff meeting", frequency: "weekly", description: "Weekly team meeting" },
  { title: "Review food costs", frequency: "weekly", description: "Check food cost percentages and adjust" },
];

const FREQUENCY_OPTIONS = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Every 2 Weeks" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "yearly", label: "Yearly" },
];

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const QUARTER_OPTIONS = [
  { value: 1, label: "Jan / Apr / Jul / Oct" },
  { value: 2, label: "Feb / May / Aug / Nov" },
  { value: 3, label: "Mar / Jun / Sep / Dec" },
];

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// Generate time options from 5:00 AM to 10:00 PM
function generateTimeOptions(): Array<{ value: string; label: string }> {
  const options: Array<{ value: string; label: string }> = [];
  for (let h = 5; h <= 22; h++) {
    for (const m of [0, 30]) {
      const hour24 = String(h).padStart(2, "0");
      const min = String(m).padStart(2, "0");
      const value = `${hour24}:${min}`;
      const hour12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
      const ampm = h >= 12 ? "PM" : "AM";
      const label = `${hour12}:${min} ${ampm}`;
      options.push({ value, label });
    }
  }
  return options;
}

const TIME_OPTIONS = generateTimeOptions();

interface Reminder {
  id: string;
  restaurant_id: string;
  title: string;
  description: string | null;
  frequency: string;
  day_of_week: number | null;
  day_of_month: number | null;
  month_of_year: number | null;
  time_of_day: string;
  enabled: boolean;
  last_sent_at: string | null;
  next_due_at: string | null;
  created_at: string;
  updated_at: string;
}

interface FormData {
  title: string;
  description: string;
  frequency: string;
  dayOfWeek: number;
  dayOfMonth: number;
  monthOfYear: number;
  timeOfDay: string;
}

const DEFAULT_FORM: FormData = {
  title: "",
  description: "",
  frequency: "weekly",
  dayOfWeek: 1,
  dayOfMonth: 1,
  monthOfYear: 1,
  timeOfDay: "09:00",
};

// ── Format a schedule into a readable string ──
function formatSchedule(r: Reminder): string {
  const timeParts = r.time_of_day.split(":");
  const h = parseInt(timeParts[0]);
  const m = timeParts[1];
  const hour12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
  const ampm = h >= 12 ? "PM" : "AM";
  const timeStr = `${hour12}:${m} ${ampm}`;

  switch (r.frequency) {
    case "daily":
      return `Every day at ${timeStr}`;
    case "weekly":
      return `Every ${DAY_NAMES[r.day_of_week ?? 1]} at ${timeStr}`;
    case "biweekly":
      return `Every other ${DAY_NAMES[r.day_of_week ?? 1]} at ${timeStr}`;
    case "monthly":
      return `Monthly on the ${ordinal(r.day_of_month ?? 1)} at ${timeStr}`;
    case "quarterly": {
      const startMonth = r.month_of_year ?? 1;
      const months = [];
      for (let i = 0; i < 4; i++) {
        months.push(MONTH_NAMES[((startMonth - 1 + i * 3) % 12)].substring(0, 3));
      }
      return `${months.join("/")} on the ${ordinal(r.day_of_month ?? 1)} at ${timeStr}`;
    }
    case "yearly":
      return `Every ${MONTH_NAMES[(r.month_of_year ?? 1) - 1]} ${ordinal(r.day_of_month ?? 1)} at ${timeStr}`;
    default:
      return `${r.frequency} at ${timeStr}`;
  }
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function formatNextDue(dateStr: string | null): string {
  if (!dateStr) return "Not scheduled";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function RemindersPage() {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const fetchReminders = useCallback(async () => {
    try {
      const res = await fetch("/api/reminders");
      if (res.ok) {
        const data = await res.json();
        setReminders(data.reminders || []);
      }
    } catch (err) {
      console.error("Failed to load reminders:", err);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchReminders();
  }, [fetchReminders]);

  // ── Open form for new reminder ──
  function openNewForm(suggestion?: typeof SUGGESTED_REMINDERS[0]) {
    setEditingId(null);
    if (suggestion) {
      setForm({
        ...DEFAULT_FORM,
        title: suggestion.title,
        description: suggestion.description,
        frequency: suggestion.frequency,
      });
    } else {
      setForm({ ...DEFAULT_FORM });
    }
    setShowForm(true);
    setError("");
  }

  // ── Open form for editing ──
  function openEditForm(r: Reminder) {
    setEditingId(r.id);
    setForm({
      title: r.title,
      description: r.description || "",
      frequency: r.frequency,
      dayOfWeek: r.day_of_week ?? 1,
      dayOfMonth: r.day_of_month ?? 1,
      monthOfYear: r.month_of_year ?? 1,
      timeOfDay: r.time_of_day,
    });
    setShowForm(true);
    setError("");
  }

  // ── Save (create or update) ──
  async function handleSave() {
    if (!form.title.trim()) {
      setError("Please enter a title for this reminder.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      const body: any = {
        title: form.title.trim(),
        description: form.description.trim() || null,
        frequency: form.frequency,
        timeOfDay: form.timeOfDay,
      };

      // Add schedule fields based on frequency
      if (form.frequency === "weekly" || form.frequency === "biweekly") {
        body.dayOfWeek = form.dayOfWeek;
      }
      if (form.frequency === "monthly") {
        body.dayOfMonth = form.dayOfMonth;
      }
      if (form.frequency === "quarterly") {
        body.monthOfYear = form.monthOfYear;
        body.dayOfMonth = form.dayOfMonth;
      }
      if (form.frequency === "yearly") {
        body.monthOfYear = form.monthOfYear;
        body.dayOfMonth = form.dayOfMonth;
      }

      if (editingId) {
        body.id = editingId;
        const res = await fetch("/api/reminders", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Failed to update");
        }
      } else {
        const res = await fetch("/api/reminders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Failed to create");
        }
      }

      setShowForm(false);
      setEditingId(null);
      fetchReminders();
    } catch (err: any) {
      setError(err.message);
    }
    setSaving(false);
  }

  // ── Toggle enabled ──
  async function handleToggle(r: Reminder) {
    try {
      await fetch("/api/reminders", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: r.id, enabled: !r.enabled }),
      });
      fetchReminders();
    } catch (err) {
      console.error("Toggle failed:", err);
    }
  }

  // ── Delete ──
  async function handleDelete(id: string) {
    try {
      await fetch(`/api/reminders?id=${id}`, { method: "DELETE" });
      setDeleteConfirm(null);
      fetchReminders();
    } catch (err) {
      console.error("Delete failed:", err);
    }
  }

  // ── Loading state ──
  if (loading) {
    return (
      <div className="pb-8">
        <div className="mb-4">
          <h2 className="text-lg font-bold text-foreground">Recurring Reminders</h2>
          <p className="text-xs text-muted">Loading...</p>
        </div>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-xl shadow-sm p-4 animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-1/2 mb-2" />
              <div className="h-3 bg-gray-100 rounded w-3/4" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="pb-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold text-foreground">Recurring Reminders</h2>
          <p className="text-xs text-muted">
            {reminders.length > 0
              ? `${reminders.filter((r) => r.enabled).length} active reminder${reminders.filter((r) => r.enabled).length !== 1 ? "s" : ""}`
              : "Set up repeating notifications for important tasks"}
          </p>
        </div>
        <button
          onClick={() => openNewForm()}
          className="bg-porch-teal text-white text-sm font-semibold px-4 py-2 rounded-xl hover:bg-porch-teal/90 transition-colors flex items-center gap-1.5"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
          </svg>
          Add
        </button>
      </div>

      {/* ── Modal / Form ── */}
      {showForm && (
        <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center">
          <div className="fixed inset-0 bg-black/40" onClick={() => { setShowForm(false); setEditingId(null); }} />
          <div className="relative bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[85vh] overflow-y-auto shadow-xl z-10">
            {/* Form header */}
            <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-4 rounded-t-2xl flex items-center justify-between">
              <h3 className="text-base font-bold text-foreground">
                {editingId ? "Edit Reminder" : "New Reminder"}
              </h3>
              <button
                onClick={() => { setShowForm(false); setEditingId(null); }}
                className="text-gray-400 hover:text-gray-600 p-1"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                  <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                </svg>
              </button>
            </div>

            <div className="px-5 py-4 space-y-4">
              {error && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3">
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}

              {/* Title */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Title</label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="e.g. Clean the grease trap"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-porch-teal/30 focus:border-porch-teal"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Description (optional)</label>
                <input
                  type="text"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Add a note or details..."
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-porch-teal/30 focus:border-porch-teal"
                />
              </div>

              {/* Frequency */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">How Often</label>
                <select
                  value={form.frequency}
                  onChange={(e) => setForm({ ...form, frequency: e.target.value })}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-porch-teal/30 focus:border-porch-teal bg-white"
                >
                  {FREQUENCY_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              {/* Day of week (weekly / biweekly) */}
              {(form.frequency === "weekly" || form.frequency === "biweekly") && (
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase mb-2">Day of Week</label>
                  <div className="flex gap-1.5">
                    {DAY_NAMES.map((name, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setForm({ ...form, dayOfWeek: idx })}
                        className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-colors ${
                          form.dayOfWeek === idx
                            ? "bg-porch-teal text-white"
                            : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                        }`}
                      >
                        {name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Day of month (monthly) */}
              {form.frequency === "monthly" && (
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Day of Month</label>
                  <select
                    value={form.dayOfMonth}
                    onChange={(e) => setForm({ ...form, dayOfMonth: parseInt(e.target.value) })}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-porch-teal/30 focus:border-porch-teal bg-white"
                  >
                    {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                      <option key={d} value={d}>{ordinal(d)}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Quarterly: which quarter cycle + day of month */}
              {form.frequency === "quarterly" && (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Quarter Months</label>
                    <select
                      value={form.monthOfYear}
                      onChange={(e) => setForm({ ...form, monthOfYear: parseInt(e.target.value) })}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-porch-teal/30 focus:border-porch-teal bg-white"
                    >
                      {QUARTER_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Day of Month</label>
                    <select
                      value={form.dayOfMonth}
                      onChange={(e) => setForm({ ...form, dayOfMonth: parseInt(e.target.value) })}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-porch-teal/30 focus:border-porch-teal bg-white"
                    >
                      {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                        <option key={d} value={d}>{ordinal(d)}</option>
                      ))}
                    </select>
                  </div>
                </>
              )}

              {/* Yearly: month + day of month */}
              {form.frequency === "yearly" && (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Month</label>
                    <select
                      value={form.monthOfYear}
                      onChange={(e) => setForm({ ...form, monthOfYear: parseInt(e.target.value) })}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-porch-teal/30 focus:border-porch-teal bg-white"
                    >
                      {MONTH_NAMES.map((name, idx) => (
                        <option key={idx + 1} value={idx + 1}>{name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Day of Month</label>
                    <select
                      value={form.dayOfMonth}
                      onChange={(e) => setForm({ ...form, dayOfMonth: parseInt(e.target.value) })}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-porch-teal/30 focus:border-porch-teal bg-white"
                    >
                      {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                        <option key={d} value={d}>{ordinal(d)}</option>
                      ))}
                    </select>
                  </div>
                </>
              )}

              {/* Time */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Time</label>
                <select
                  value={form.timeOfDay}
                  onChange={(e) => setForm({ ...form, timeOfDay: e.target.value })}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-porch-teal/30 focus:border-porch-teal bg-white"
                >
                  {TIME_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              {/* Buttons */}
              <div className="flex gap-3 pt-2 pb-2">
                <button
                  onClick={() => { setShowForm(false); setEditingId(null); }}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-porch-teal hover:bg-porch-teal/90 transition-colors disabled:opacity-50"
                >
                  {saving ? "Saving..." : editingId ? "Update" : "Create Reminder"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete confirmation ── */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center">
          <div className="fixed inset-0 bg-black/40" onClick={() => setDeleteConfirm(null)} />
          <div className="relative bg-white rounded-2xl p-6 max-w-sm mx-4 shadow-xl z-10 text-center">
            <h3 className="text-base font-bold text-foreground mb-2">Delete Reminder?</h3>
            <p className="text-sm text-muted mb-5">
              This will permanently remove the reminder and stop all future notifications for it.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors"
              >
                Keep It
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm)}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-red-500 hover:bg-red-600 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Reminder list ── */}
      {reminders.length > 0 ? (
        <div className="space-y-3">
          {reminders.map((r) => (
            <div
              key={r.id}
              className={`bg-white rounded-xl shadow-sm p-4 border border-transparent transition-colors ${
                !r.enabled ? "opacity-60" : ""
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-bold text-foreground truncate">{r.title}</h3>
                  {r.description && (
                    <p className="text-xs text-muted mt-0.5 truncate">{r.description}</p>
                  )}
                  <div className="flex items-center gap-1.5 mt-2">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5 text-porch-teal">
                      <path fillRule="evenodd" d="M1 8a7 7 0 1 1 14 0A7 7 0 0 1 1 8Zm7.75-4.25a.75.75 0 0 0-1.5 0V8c0 .414.336.75.75.75h3.25a.75.75 0 0 0 0-1.5h-2.5v-3.5Z" clipRule="evenodd" />
                    </svg>
                    <span className="text-xs text-porch-brown-light">{formatSchedule(r)}</span>
                  </div>
                  {r.next_due_at && r.enabled && (
                    <p className="text-[11px] text-muted mt-1">
                      Next: {formatNextDue(r.next_due_at)}
                    </p>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 shrink-0">
                  {/* Toggle */}
                  <button
                    onClick={() => handleToggle(r)}
                    className={`relative w-10 h-6 rounded-full transition-colors ${
                      r.enabled ? "bg-porch-teal" : "bg-gray-300"
                    }`}
                    aria-label={r.enabled ? "Disable reminder" : "Enable reminder"}
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                        r.enabled ? "translate-x-4" : "translate-x-0"
                      }`}
                    />
                  </button>

                  {/* Edit */}
                  <button
                    onClick={() => openEditForm(r)}
                    className="text-gray-400 hover:text-porch-teal p-1 transition-colors"
                    aria-label="Edit reminder"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
                      <path d="M13.488 2.513a1.75 1.75 0 0 0-2.475 0L6.75 6.774a2.75 2.75 0 0 0-.596.892l-.848 2.047a.75.75 0 0 0 .98.98l2.047-.848a2.75 2.75 0 0 0 .892-.596l4.261-4.262a1.75 1.75 0 0 0 0-2.474Z" />
                      <path d="M4.75 3.5c-.69 0-1.25.56-1.25 1.25v6.5c0 .69.56 1.25 1.25 1.25h6.5c.69 0 1.25-.56 1.25-1.25V9A.75.75 0 0 1 14 9v2.25A2.75 2.75 0 0 1 11.25 14h-6.5A2.75 2.75 0 0 1 2 11.25v-6.5A2.75 2.75 0 0 1 4.75 2H7a.75.75 0 0 1 0 1.5H4.75Z" />
                    </svg>
                  </button>

                  {/* Delete */}
                  <button
                    onClick={() => setDeleteConfirm(r.id)}
                    className="text-gray-400 hover:text-red-500 p-1 transition-colors"
                    aria-label="Delete reminder"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
                      <path fillRule="evenodd" d="M5 3.25V4H2.75a.75.75 0 0 0 0 1.5h.3l.815 8.15A1.5 1.5 0 0 0 5.357 15h5.285a1.5 1.5 0 0 0 1.493-1.35l.815-8.15h.3a.75.75 0 0 0 0-1.5H11v-.75A2.25 2.25 0 0 0 8.75 1h-1.5A2.25 2.25 0 0 0 5 3.25Zm2.25-.75a.75.75 0 0 0-.75.75V4h3v-.75a.75.75 0 0 0-.75-.75h-1.5ZM6.05 6a.75.75 0 0 1 .787.713l.275 5.5a.75.75 0 0 1-1.498.075l-.275-5.5A.75.75 0 0 1 6.05 6Zm3.9 0a.75.75 0 0 1 .712.787l-.275 5.5a.75.75 0 0 1-1.498-.075l.275-5.5a.75.75 0 0 1 .786-.711Z" clipRule="evenodd" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* ── Empty state ── */
        <div className="text-center py-10">
          <div className="w-16 h-16 bg-porch-cream rounded-full flex items-center justify-center mx-auto mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-8 h-8 text-porch-teal">
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
            </svg>
          </div>
          <h3 className="text-base font-bold text-foreground mb-1">No Reminders Yet</h3>
          <p className="text-sm text-muted mb-6 max-w-xs mx-auto">
            Tap a suggestion below to get started, or add your own custom reminder.
          </p>
        </div>
      )}

      {/* ── Suggestion chips ── */}
      <div className="mt-6">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
          Quick Add Suggestions
        </p>
        <div className="flex flex-wrap gap-2">
          {SUGGESTED_REMINDERS.map((s) => {
            // Don't show suggestion if already exists
            const alreadyExists = reminders.some(
              (r) => r.title.toLowerCase() === s.title.toLowerCase()
            );
            if (alreadyExists) return null;

            return (
              <button
                key={s.title}
                onClick={() => openNewForm(s)}
                className="bg-white border border-gray-200 rounded-full px-3 py-1.5 text-xs text-gray-700 hover:border-porch-teal hover:text-porch-teal transition-colors"
              >
                + {s.title}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
