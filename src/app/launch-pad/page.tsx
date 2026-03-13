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

interface ReadinessData {
  ready: boolean;
  score: number;
  checks: {
    recipesComplete: { pass: boolean; done: number; total: number };
    suppliersAssigned: { pass: boolean; done: number; total: number };
    ingredientsPriced: { pass: boolean; done: number; total: number };
    businessHoursSet: { pass: boolean };
    costTargetsSet: { pass: boolean };
    categoriesSet: { pass: boolean };
  };
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

const INITIAL_READINESS: ReadinessData = {
  ready: false,
  score: 0,
  checks: {
    recipesComplete: { pass: false, done: 0, total: 0 },
    suppliersAssigned: { pass: false, done: 0, total: 0 },
    ingredientsPriced: { pass: false, done: 0, total: 0 },
    businessHoursSet: { pass: false },
    costTargetsSet: { pass: false },
    categoriesSet: { pass: false },
  },
};

export default function LaunchPadPage() {
  const router = useRouter();
  const [data, setData] = useState<LaunchPadData>(INITIAL_DATA);
  const [readiness, setReadiness] = useState<ReadinessData>(INITIAL_READINESS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAllData();
  }, []);

  async function fetchAllData() {
    try {
      // Fetch all data sources in parallel, including the new readiness API
      const [settingsRes, onboardingRes, plaidRes, teamRes, readinessRes] = await Promise.allSettled([
        fetch("/api/settings"),
        fetch("/api/onboarding/complete"),
        fetch("/api/plaid/accounts"),
        fetch("/api/team"),
        fetch("/api/launch-readiness"),
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

      // Parse launch readiness data
      if (readinessRes.status === "fulfilled" && readinessRes.value.ok) {
        const readinessJson = await readinessRes.value.json();
        setReadiness(readinessJson);
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
        {/* Readiness Meter */}
        <ReadinessMeter score={readiness.score} ready={readiness.ready} />

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

        {/* Complete Your Setup — most important section for launch readiness */}
        <div className="mb-5">
          <h2 className="text-xs font-semibold text-porch-brown uppercase tracking-wide mb-3 flex items-center gap-2 px-1">
            Complete Your Setup
          </h2>
          <div className="space-y-3">
            {/* Add Your Recipes */}
            <ActionCard
              icon={<span className="text-xl" role="img" aria-label="recipes">&#x1F4CB;</span>}
              title="Add Your Recipes"
              description={
                "Every menu item needs a recipe \u2014 even coffee drinks, smoothies, and sauces. " +
                "For example: a Latte = 9oz milk + 20g coffee beans + 0.75oz vanilla syrup. " +
                "Without this, we can\u2019t calculate what each item actually costs you to make."
              }
              status={
                readiness.checks.recipesComplete.total > 0
                  ? `${readiness.checks.recipesComplete.done} of ${readiness.checks.recipesComplete.total} menu items have recipes`
                  : "No menu items yet"
              }
              statusColor={readiness.checks.recipesComplete.pass ? "green" : "gray"}
              buttonLabel="Add Recipes"
              onClick={() => router.push("/recipes/wizard")}
            />

            {/* Assign Ingredient Suppliers */}
            <ActionCard
              icon={<span className="text-xl" role="img" aria-label="truck">&#x1F69A;</span>}
              title="Review Ingredient Suppliers"
              description={
                "We\u2019ll identify your suppliers from your bank transactions and ask you to confirm. " +
                "Then we\u2019ll search online for prices \u2014 and only ask for receipts when we can\u2019t find them."
              }
              status={
                readiness.checks.suppliersAssigned.total > 0
                  ? `${readiness.checks.suppliersAssigned.done} of ${readiness.checks.suppliersAssigned.total} ingredients have a supplier`
                  : "No ingredients yet"
              }
              statusColor={readiness.checks.suppliersAssigned.pass ? "green" : "gray"}
              buttonLabel="Assign Suppliers"
              onClick={() => router.push("/ingredients/sourcing")}
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

/* ---- Readiness Meter Component ---- */

function ReadinessMeter({ score, ready }: { score: number; ready: boolean }) {
  // Determine color based on score
  const getColor = () => {
    if (score > 75) return { bar: "bg-green-500", text: "text-green-700", ring: "stroke-green-500" };
    if (score >= 40) return { bar: "bg-yellow-500", text: "text-yellow-700", ring: "stroke-yellow-500" };
    return { bar: "bg-red-500", text: "text-red-700", ring: "stroke-red-500" };
  };

  const colors = getColor();

  // Circle SVG parameters
  const size = 96;
  const strokeWidth = 8;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const filled = (score / 100) * circumference;
  const gap = circumference - filled;

  return (
    <div className="bg-white rounded-xl shadow-sm p-5 mb-5">
      <div className="flex items-center gap-5">
        {/* Circular progress */}
        <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
          <svg width={size} height={size} className="-rotate-90">
            {/* Background circle */}
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke="#e5e7eb"
              strokeWidth={strokeWidth}
            />
            {/* Progress circle */}
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              className={colors.ring}
              strokeWidth={strokeWidth}
              strokeDasharray={`${filled} ${gap}`}
              strokeLinecap="round"
            />
          </svg>
          {/* Score text in center */}
          <div className="absolute inset-0 flex items-center justify-center">
            <span className={`text-xl font-bold ${colors.text}`}>{score}%</span>
          </div>
        </div>

        {/* Label */}
        <div>
          <h2 className={`text-lg font-bold ${colors.text}`}>
            Launch Readiness: {score}%
          </h2>
          <p className="text-sm text-porch-brown-light mt-0.5">
            {ready
              ? "You're all set! Your restaurant is fully configured."
              : "Complete the steps below to get the most accurate reports and cost tracking."}
          </p>
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
