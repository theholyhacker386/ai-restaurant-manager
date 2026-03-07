"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

/* eslint-disable @typescript-eslint/no-explicit-any */

interface LaunchPadData {
  restaurantName: string;
  menuItemCount: number;
  ingredientCount: number;
  supplierCount: number;
  categoryCount: number;
  businessHoursSet: boolean;
  foodCostTarget: number;
  laborCostTarget: number;
  bankConnected: boolean;
  bankAccountCount: number;
  teamCount: number;
  recipesWithItems: number;
  totalMenuItems: number;
}

const INITIAL_DATA: LaunchPadData = {
  restaurantName: "Your Restaurant",
  menuItemCount: 0,
  ingredientCount: 0,
  supplierCount: 0,
  categoryCount: 0,
  businessHoursSet: false,
  foodCostTarget: 30,
  laborCostTarget: 28,
  bankConnected: false,
  bankAccountCount: 0,
  teamCount: 0,
  recipesWithItems: 0,
  totalMenuItems: 0,
};

export default function LaunchPadPage() {
  const router = useRouter();
  const [data, setData] = useState<LaunchPadData>(INITIAL_DATA);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAllData();
  }, []);

  async function fetchAllData() {
    try {
      // Fetch all data sources in parallel
      const [settingsRes, onboardingRes, plaidRes, teamRes] = await Promise.allSettled([
        fetch("/api/settings"),
        fetch("/api/onboarding/complete"),
        fetch("/api/plaid/accounts"),
        fetch("/api/team"),
      ]);

      const updated = { ...INITIAL_DATA };

      // Parse settings (business hours, cost targets)
      if (settingsRes.status === "fulfilled" && settingsRes.value.ok) {
        const settingsJson = await settingsRes.value.json();
        const s = settingsJson.settings;
        if (s) {
          updated.foodCostTarget = s.food_cost_target || 30;
          updated.laborCostTarget = s.labor_cost_target || 28;
          // Check if business hours have been set (at least one day has hours)
          if (s.business_hours) {
            const hours = s.business_hours;
            const hasHours = Object.values(hours).some((v: any) => v !== null && v !== undefined);
            updated.businessHoursSet = hasHours;
          }
        }
      }

      // Parse onboarding session data (menu items, ingredients, suppliers, restaurant name)
      if (onboardingRes.status === "fulfilled" && onboardingRes.value.ok) {
        const obJson = await onboardingRes.value.json();
        if (obJson.sessionData) {
          const sd = obJson.sessionData;
          updated.menuItemCount = sd.menuItems?.length || 0;
          updated.ingredientCount = sd.ingredients?.length || 0;
          updated.supplierCount = sd.suppliers?.length || 0;
          if (sd.businessInfo?.name) {
            updated.restaurantName = sd.businessInfo.name;
          }
        }
        if (obJson.userName && !updated.restaurantName) {
          updated.restaurantName = "Your Restaurant";
        }
      }

      // If menu item count is 0 from onboarding, try fetching from menu-items API
      if (updated.menuItemCount === 0) {
        try {
          const menuRes = await fetch("/api/menu-items");
          if (menuRes.ok) {
            const menuJson = await menuRes.json();
            const items = Array.isArray(menuJson) ? menuJson : menuJson.items || [];
            updated.menuItemCount = items.length;
            updated.totalMenuItems = items.length;
            // Count unique categories
            const categories = new Set(items.map((i: any) => i.category).filter(Boolean));
            updated.categoryCount = categories.size;
          }
        } catch { /* ignore */ }
      } else {
        updated.totalMenuItems = updated.menuItemCount;
      }

      // Parse bank connection status
      if (plaidRes.status === "fulfilled" && plaidRes.value.ok) {
        const plaidJson = await plaidRes.value.json();
        const accounts = plaidJson.accounts || [];
        updated.bankConnected = accounts.length > 0;
        updated.bankAccountCount = accounts.length;
      }

      // Parse team count
      if (teamRes.status === "fulfilled" && teamRes.value.ok) {
        const teamJson = await teamRes.value.json();
        const members = Array.isArray(teamJson) ? teamJson : [];
        // Subtract 1 for the owner — we show "beyond the owner"
        updated.teamCount = Math.max(0, members.length - 1);
      }

      setData(updated);
    } catch (err) {
      console.error("Failed to load launch pad data:", err);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-porch-cream flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-porch-brown flex items-center justify-center animate-pulse">
            <span className="text-white font-bold text-sm">AI</span>
          </div>
          <span className="text-porch-brown-light text-sm">Loading your launch pad...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-porch-cream pb-24">
      {/* Header */}
      <header className="bg-porch-brown text-white px-4 py-5">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-2xl" role="img" aria-label="rocket">&#x1F680;</span>
            <h1 className="text-xl font-bold">Your Launch Pad</h1>
          </div>
          <p className="text-sm text-white/80">
            {data.restaurantName} is set up and ready! Complete these steps to get the most out of your platform.
          </p>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 pt-5">
        {/* Completed Items Section */}
        <div className="bg-white rounded-xl shadow-sm p-4 mb-5">
          <h2 className="text-xs font-semibold text-porch-brown uppercase tracking-wide mb-3 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-500" />
            What You&apos;ve Completed
          </h2>
          <div className="space-y-2.5">
            <CompletedItem text="Restaurant info configured" />
            <CompletedItem
              text={
                data.menuItemCount > 0
                  ? `${data.menuItemCount} menu items added${data.categoryCount > 0 ? ` across ${data.categoryCount} categories` : ""}`
                  : "Menu items added"
              }
            />
            <CompletedItem
              text={
                data.ingredientCount > 0
                  ? `${data.ingredientCount} ingredients with costs loaded`
                  : "Ingredients with costs loaded"
              }
            />
            <CompletedItem text={data.businessHoursSet ? "Business hours set" : "Business hours configured"} />
            <CompletedItem
              text={`Cost targets configured (food: ${data.foodCostTarget}%, labor: ${data.laborCostTarget}%)`}
            />
          </div>
        </div>

        {/* Connect Your Tools */}
        <div className="mb-5">
          <h2 className="text-xs font-semibold text-porch-brown uppercase tracking-wide mb-3 flex items-center gap-2 px-1">
            Connect Your Tools
          </h2>
          <div className="space-y-3">
            {/* Bank Connection */}
            <ActionCard
              icon={<span className="text-xl" role="img" aria-label="bank">&#x1F3E6;</span>}
              title="Connect Bank Account"
              description="Import transactions automatically from your bank."
              status={data.bankConnected ? `${data.bankAccountCount} account${data.bankAccountCount !== 1 ? "s" : ""} connected` : "Not connected"}
              statusColor={data.bankConnected ? "green" : "gray"}
              buttonLabel="Connect Bank"
              onClick={() => router.push("/bank-connections")}
            />

            {/* Square POS */}
            <ActionCard
              icon={<span className="text-xl" role="img" aria-label="phone">&#x1F4F1;</span>}
              title="Connect Square POS"
              description="Pull in sales and labor data automatically."
              status="Coming soon"
              statusColor="gray"
              buttonLabel="Coming Soon"
              disabled
            />
          </div>
        </div>

        {/* Set Up Your Team */}
        <div className="mb-5">
          <h2 className="text-xs font-semibold text-porch-brown uppercase tracking-wide mb-3 flex items-center gap-2 px-1">
            Set Up Your Team
          </h2>
          <div className="space-y-3">
            <ActionCard
              icon={<span className="text-xl" role="img" aria-label="team">&#x1F465;</span>}
              title="Add Team Members"
              description="Create logins for your managers and staff."
              status={data.teamCount > 0 ? `${data.teamCount} team member${data.teamCount !== 1 ? "s" : ""}` : "Just you so far"}
              statusColor={data.teamCount > 0 ? "green" : "gray"}
              buttonLabel="Add Team"
              onClick={() => router.push("/settings")}
            />
          </div>
        </div>

        {/* Build Your Recipes */}
        <div className="mb-5">
          <h2 className="text-xs font-semibold text-porch-brown uppercase tracking-wide mb-3 flex items-center gap-2 px-1">
            Build Your Recipes
          </h2>
          <div className="space-y-3">
            <ActionCard
              icon={<span className="text-xl" role="img" aria-label="recipes">&#x1F4CB;</span>}
              title="Link Ingredients to Menu Items"
              description="Tell us what goes into each dish — include exact amounts like ounces, grams, or cups (not just '2 carrots' since sizes vary). This is how we calculate your real cost per plate."
              status={
                data.recipesWithItems > 0
                  ? `${data.recipesWithItems} of ${data.totalMenuItems} items have recipes`
                  : "No recipes yet"
              }
              statusColor={data.recipesWithItems > 0 ? "green" : "gray"}
              buttonLabel="Build Recipes"
              onClick={() => router.push("/recipes")}
            />
          </div>
        </div>

        {/* Go to Dashboard */}
        <div className="mt-8 mb-6">
          <button
            onClick={() => router.push("/")}
            className="w-full bg-porch-brown text-white py-3.5 rounded-xl font-semibold hover:bg-porch-brown-light transition-colors text-base flex items-center justify-center gap-2"
          >
            Go to Dashboard
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---- Completed Item Component ---- */

function CompletedItem({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="w-5 h-5 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
        <svg className="w-3.5 h-3.5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <span className="text-sm text-green-800">{text}</span>
    </div>
  );
}

/* ---- Action Card Component ---- */

function ActionCard({
  icon,
  title,
  description,
  status,
  statusColor,
  buttonLabel,
  onClick,
  disabled,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  status: string;
  statusColor: "green" | "gray";
  buttonLabel: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="bg-white rounded-xl shadow-sm p-4">
      <div className="flex items-start gap-3">
        <div className="mt-0.5">{icon}</div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-porch-brown">{title}</h3>
          <p className="text-xs text-porch-brown-light mt-0.5">{description}</p>
          <div className="flex items-center justify-between mt-3">
            <span
              className={`text-xs font-medium ${
                statusColor === "green" ? "text-green-600" : "text-gray-400"
              }`}
            >
              {status}
            </span>
            <button
              onClick={onClick}
              disabled={disabled}
              className={`text-sm font-medium px-4 py-2 rounded-lg transition-colors ${
                disabled
                  ? "bg-gray-200 text-gray-500 cursor-not-allowed"
                  : "bg-porch-teal text-white hover:bg-porch-teal-light"
              }`}
            >
              {buttonLabel} {!disabled && <span aria-hidden="true">&rarr;</span>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
