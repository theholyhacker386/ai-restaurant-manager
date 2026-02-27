"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import StatementUpload from "@/components/StatementUpload";

/* eslint-disable @typescript-eslint/no-explicit-any */

interface MenuItem {
  id: string;
  name: string;
  selling_price: number;
  category_name: string | null;
  food_cost_percentage: number;
  profit_per_item: number;
  status: "good" | "warning" | "danger" | "needs-input" | "incomplete";
}

interface DashboardData {
  totalItems: number;
  needsAttention: number;
  avgFoodCost: number;
  statusCounts: {
    good: number;
    warning: number;
    danger: number;
    needsInput: number;
  };
  loading: boolean;
  error: string | null;
}

export default function DashboardHome() {
  const { data: session } = useSession();
  const role = (session?.user as any)?.role || "manager";
  const userName = session?.user?.name || "";

  // Manager view — simple action buttons
  if (role === "manager") {
    return <ManagerDashboard userName={userName} />;
  }

  // Owner view — full dashboard
  return <OwnerDashboard />;
}

/* ========================= */
/* MANAGER DASHBOARD         */
/* ========================= */

function ManagerDashboard({ userName }: { userName: string }) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-foreground">
          Hey, {userName || "there"}!
        </h2>
        <p className="text-sm text-porch-brown-light/70 mt-0.5">
          What do you need to do?
        </p>
      </div>

      {/* Main action buttons */}
      <div className="space-y-3">
        <Link
          href="/receipts/scan"
          className="flex items-center gap-4 bg-white rounded-2xl p-5 shadow-sm border border-porch-cream-dark/50 active:scale-[0.98] transition-transform"
        >
          <div className="w-12 h-12 rounded-xl bg-emerald-100 flex items-center justify-center flex-shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6 text-emerald-600">
              <path d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
              <path d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Scan a Receipt</h3>
            <p className="text-xs text-muted mt-0.5">Take a photo of a delivery receipt</p>
          </div>
        </Link>

        <Link
          href="/shopping/receive"
          className="flex items-center gap-4 bg-white rounded-2xl p-5 shadow-sm border border-porch-cream-dark/50 active:scale-[0.98] transition-transform"
        >
          <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center flex-shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6 text-blue-600">
              <path d="M3.375 4.5C2.339 4.5 1.5 5.34 1.5 6.375V13.5h12V6.375c0-1.036-.84-1.875-1.875-1.875h-8.25zM13.5 15h-12v2.625c0 1.035.84 1.875 1.875 1.875h.375a3 3 0 116 0h3a3 3 0 116 0h.375c1.035 0 1.875-.84 1.875-1.875V18a3 3 0 00-3-3h-6z" />
              <path d="M15 5.25a.75.75 0 01.75-.75h3.5a.75.75 0 01.624.334l2.25 3.375a.75.75 0 01.126.416V13.5h-7.5V5.25z" />
              <path d="M7.5 18.75a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM19.5 18.75a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Receive an Order</h3>
            <p className="text-xs text-muted mt-0.5">Check in a delivery that just arrived</p>
          </div>
        </Link>

        <Link
          href="/shopping"
          className="flex items-center gap-4 bg-white rounded-2xl p-5 shadow-sm border border-porch-cream-dark/50 active:scale-[0.98] transition-transform"
        >
          <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6 text-amber-600">
              <path fillRule="evenodd" d="M7.502 6h7.128A3.375 3.375 0 0118 9.375v9.375a3 3 0 003-3V6.108c0-1.505-1.125-2.811-2.664-2.94a48.972 48.972 0 00-8.834 0A2.972 2.972 0 007.502 6zM4.5 7.5a1.5 1.5 0 00-1.5 1.5v9A1.5 1.5 0 004.5 19.5h9a1.5 1.5 0 001.5-1.5v-9a1.5 1.5 0 00-1.5-1.5h-9z" clipRule="evenodd" />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Shopping List</h3>
            <p className="text-xs text-muted mt-0.5">Generate or view shopping lists</p>
          </div>
        </Link>

        <Link
          href="/inventory"
          className="flex items-center gap-4 bg-white rounded-2xl p-5 shadow-sm border border-porch-cream-dark/50 active:scale-[0.98] transition-transform"
        >
          <div className="w-12 h-12 rounded-xl bg-teal-100 flex items-center justify-center flex-shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6 text-teal-600">
              <path d="M3.375 3C2.339 3 1.5 3.84 1.5 4.875v.75c0 1.036.84 1.875 1.875 1.875h17.25c1.035 0 1.875-.84 1.875-1.875v-.75C22.5 3.839 21.66 3 20.625 3H3.375z" />
              <path fillRule="evenodd" d="M3.087 9l.54 9.176A3 3 0 006.62 21h10.757a3 3 0 002.995-2.824L20.913 9H3.087zM12 10.5a.75.75 0 01.75.75v4.94l1.72-1.72a.75.75 0 111.06 1.06l-3 3a.75.75 0 01-1.06 0l-3-3a.75.75 0 111.06-1.06l1.72 1.72v-4.94a.75.75 0 01.75-.75z" clipRule="evenodd" />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Inventory Check</h3>
            <p className="text-xs text-muted mt-0.5">Count stock and update what&apos;s on hand</p>
          </div>
        </Link>

        <Link
          href="/recipes"
          className="flex items-center gap-4 bg-white rounded-2xl p-5 shadow-sm border border-porch-cream-dark/50 active:scale-[0.98] transition-transform"
        >
          <div className="w-12 h-12 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6 text-purple-600">
              <path fillRule="evenodd" d="M5.625 1.5c-1.036 0-1.875.84-1.875 1.875v17.25c0 1.035.84 1.875 1.875 1.875h12.75c1.035 0 1.875-.84 1.875-1.875V12.75A9.75 9.75 0 0010.5 3H5.625zM7.5 15a.75.75 0 01.75-.75h7.5a.75.75 0 010 1.5h-7.5A.75.75 0 017.5 15zm.75 2.25a.75.75 0 000 1.5H12a.75.75 0 000-1.5H8.25z" clipRule="evenodd" />
              <path d="M12.971 1.816A5.23 5.23 0 0114.25 5.25v1.875c0 .207.168.375.375.375H16.5a5.23 5.23 0 013.434 1.279 9.768 9.768 0 00-6.963-6.963z" />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">View Recipes</h3>
            <p className="text-xs text-muted mt-0.5">Look up how to make any menu item</p>
          </div>
        </Link>
      </div>

      {/* Tip */}
      <div className="bg-porch-brown/5 border border-porch-brown/15 rounded-xl p-3">
        <p className="text-xs text-porch-brown/70 text-center">
          Tap the chat bubble in the corner to do inventory counts with the AI assistant
        </p>
      </div>
    </div>
  );
}

/* ========================= */
/* OWNER DASHBOARD           */
/* ========================= */

function OwnerDashboard() {
  const [data, setData] = useState<DashboardData>({
    totalItems: 0,
    needsAttention: 0,
    avgFoodCost: 0,
    statusCounts: { good: 0, warning: 0, danger: 0, needsInput: 0 },
    loading: true,
    error: null,
  });

  useEffect(() => {
    async function fetchDashboard() {
      try {
        const res = await fetch("/api/menu-items");
        if (!res.ok) throw new Error("Failed to load");
        const { items }: { items: MenuItem[] } = await res.json();

        const costedItems = items.filter((i) => i.status !== "needs-input" && i.status !== "incomplete");
        const avgCost =
          costedItems.length > 0
            ? costedItems.reduce((sum, i) => sum + i.food_cost_percentage, 0) /
              costedItems.length
            : 0;

        const statusCounts = {
          good: items.filter((i) => i.status === "good").length,
          warning: items.filter((i) => i.status === "warning").length,
          danger: items.filter((i) => i.status === "danger").length,
          needsInput: items.filter((i) => i.status === "needs-input" || i.status === "incomplete").length,
        };

        setData({
          totalItems: items.length,
          needsAttention: statusCounts.danger + statusCounts.warning,
          avgFoodCost: Math.round(avgCost * 10) / 10,
          statusCounts,
          loading: false,
          error: null,
        });
      } catch {
        setData((prev) => ({
          ...prev,
          loading: false,
          error: "Couldn't load your menu data. Pull down to try again.",
        }));
      }
    }

    fetchDashboard();
  }, []);

  if (data.loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <div className="w-8 h-8 border-3 border-porch-cream-dark border-t-porch-teal rounded-full animate-spin" />
        <p className="text-sm text-porch-brown-light/70">Loading your dashboard...</p>
      </div>
    );
  }

  if (data.error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-center px-6">
        <div className="w-12 h-12 bg-status-danger/10 rounded-full flex items-center justify-center">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6 text-status-danger">
            <path fillRule="evenodd" d="M9.401 3.003c1.155-2 4.043-2 5.197 0l7.355 12.748c1.154 2-.29 4.5-2.599 4.5H4.645c-2.309 0-3.752-2.5-2.598-4.5L9.4 3.003zM12 8.25a.75.75 0 01.75.75v3.75a.75.75 0 01-1.5 0V9a.75.75 0 01.75-.75zm0 8.25a.75.75 0 100-1.5.75.75 0 000 1.5z" clipRule="evenodd" />
          </svg>
        </div>
        <p className="text-sm text-foreground/70">{data.error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Welcome */}
      <div>
        <h2 className="text-xl font-bold text-foreground">
          Good {getGreeting()}!
        </h2>
        <p className="text-sm text-porch-brown-light/70 mt-0.5">
          Here&apos;s how your menu is doing
        </p>
      </div>

      {/* Quick Stats Cards */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard
          label="Menu Items"
          value={data.totalItems}
          sublabel="total"
          color="teal"
          href="/menu"
        />
        <StatCard
          label="Need Review"
          value={data.needsAttention}
          sublabel={data.needsAttention === 1 ? "item" : "items"}
          color={data.needsAttention > 0 ? "amber" : "green"}
          href="/menu?filter=review"
        />
        <StatCard
          label="Avg Food Cost"
          value={data.avgFoodCost > 0 ? `${data.avgFoodCost}%` : "—"}
          sublabel={data.avgFoodCost > 0 ? getFoodCostLabel(data.avgFoodCost) : "no data yet"}
          color={getFoodCostColor(data.avgFoodCost)}
        />
      </div>

      {/* Menu Health Summary */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-porch-cream-dark/50">
        <h3 className="text-sm font-semibold text-foreground mb-3">
          Menu Health
        </h3>

        {data.totalItems === 0 ? (
          <p className="text-sm text-porch-brown-light/60 text-center py-4">
            No menu items yet. Add your first one below!
          </p>
        ) : (
          <div className="space-y-2.5">
            <HealthBar label="Healthy" count={data.statusCounts.good} total={data.totalItems} color="bg-status-good" dotColor="bg-status-good" />
            <HealthBar label="Watch" count={data.statusCounts.warning} total={data.totalItems} color="bg-status-warning" dotColor="bg-status-warning" />
            <HealthBar label="Over Budget" count={data.statusCounts.danger} total={data.totalItems} color="bg-status-danger" dotColor="bg-status-danger" />
            <HealthBar label="Needs Info" count={data.statusCounts.needsInput} total={data.totalItems} color="bg-status-gray" dotColor="bg-status-gray" />
          </div>
        )}
      </div>

      {/* PDF Statement Upload */}
      <StatementUpload />

      {/* Quick Actions */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground">
          Quick Actions
        </h3>
        <div className="grid grid-cols-3 gap-3">
          <Link
            href="/menu?action=add"
            className="flex flex-col items-center justify-center gap-2 bg-porch-teal text-white rounded-2xl p-4 min-h-[88px] active:scale-[0.97] transition-transform shadow-sm"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
              <path fillRule="evenodd" d="M12 3.75a.75.75 0 01.75.75v6.75h6.75a.75.75 0 010 1.5h-6.75v6.75a.75.75 0 01-1.5 0v-6.75H4.5a.75.75 0 010-1.5h6.75V4.5a.75.75 0 01.75-.75z" clipRule="evenodd" />
            </svg>
            <span className="text-xs font-semibold">Add Menu Item</span>
          </Link>
          <Link
            href="/ingredients?action=add"
            className="flex flex-col items-center justify-center gap-2 bg-porch-brown text-white rounded-2xl p-4 min-h-[88px] active:scale-[0.97] transition-transform shadow-sm"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
              <path d="M2.25 2.25a.75.75 0 000 1.5h1.386c.17 0 .318.114.362.278l2.558 9.592a3.752 3.752 0 00-2.806 3.63c0 .414.336.75.75.75h15.75a.75.75 0 000-1.5H5.378A2.25 2.25 0 017.5 15h11.218a.75.75 0 00.674-.421 60.358 60.358 0 002.96-7.228.75.75 0 00-.525-.965A60.864 60.864 0 005.68 4.509l-.232-.867A1.875 1.875 0 003.636 2.25H2.25zM3.75 20.25a1.5 1.5 0 113 0 1.5 1.5 0 01-3 0zM16.5 20.25a1.5 1.5 0 113 0 1.5 1.5 0 01-3 0z" />
            </svg>
            <span className="text-xs font-semibold">Add Ingredient</span>
          </Link>
          <Link
            href="/receipts/scan"
            className="flex flex-col items-center justify-center gap-2 bg-emerald-600 text-white rounded-2xl p-4 min-h-[88px] active:scale-[0.97] transition-transform shadow-sm"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
              <path d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
              <path d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" />
            </svg>
            <span className="text-xs font-semibold">Scan Receipt</span>
          </Link>
        </div>
      </div>
    </div>
  );
}

/* --- Helper Components --- */

function StatCard({
  label,
  value,
  sublabel,
  color,
  href,
}: {
  label: string;
  value: number | string;
  sublabel: string;
  color: "teal" | "green" | "amber" | "red" | "gray";
  href?: string;
}) {
  const colorMap = {
    teal: "bg-porch-teal/10 text-porch-teal",
    green: "bg-status-good/10 text-status-good",
    amber: "bg-status-warning/10 text-status-warning",
    red: "bg-status-danger/10 text-status-danger",
    gray: "bg-status-gray/10 text-status-gray",
  };

  const content = (
    <>
      <p className="text-[10px] font-medium text-porch-brown-light/60 uppercase tracking-wider">
        {label}
      </p>
      <p
        className={`text-2xl font-bold mt-1 ${colorMap[color]?.split(" ")[1] || "text-foreground"}`}
      >
        {value}
      </p>
      <p className="text-[10px] text-porch-brown-light/50 mt-0.5">{sublabel}</p>
    </>
  );

  if (href) {
    return (
      <Link href={href} className="bg-white rounded-2xl p-3 shadow-sm border border-porch-cream-dark/50 text-center active:scale-[0.97] transition-transform">
        {content}
      </Link>
    );
  }

  return (
    <div className="bg-white rounded-2xl p-3 shadow-sm border border-porch-cream-dark/50 text-center">
      {content}
    </div>
  );
}

function HealthBar({
  label,
  count,
  total,
  color,
  dotColor,
}: {
  label: string;
  count: number;
  total: number;
  color: string;
  dotColor: string;
}) {
  const pct = total > 0 ? (count / total) * 100 : 0;

  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-1.5 w-24 shrink-0">
        <span className={`w-2 h-2 rounded-full ${dotColor}`} />
        <span className="text-xs text-foreground/70">{label}</span>
      </div>
      <div className="flex-1 bg-porch-cream rounded-full h-2.5 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs font-semibold text-foreground/80 w-6 text-right">
        {count}
      </span>
    </div>
  );
}

/* --- Helper Functions --- */

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}

function getFoodCostColor(pct: number): "green" | "amber" | "red" | "gray" {
  if (pct === 0) return "gray";
  if (pct <= 30) return "green";
  if (pct <= 35) return "amber";
  return "red";
}

function getFoodCostLabel(pct: number): string {
  if (pct <= 30) return "on target";
  if (pct <= 35) return "getting high";
  return "too high";
}
