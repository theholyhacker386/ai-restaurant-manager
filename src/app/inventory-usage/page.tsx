"use client";

import { useEffect, useState } from "react";

/* eslint-disable @typescript-eslint/no-explicit-any */

type DatePreset = "today" | "week" | "month" | "lastMonth" | "ytd";

function formatLocalDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getDateRange(preset: DatePreset) {
  const now = new Date();
  const end = new Date();
  const start = new Date();

  switch (preset) {
    case "today":
      break;
    case "week": {
      const dayOfWeek = now.getDay();
      start.setDate(now.getDate() - dayOfWeek);
      break;
    }
    case "month":
      start.setDate(1);
      break;
    case "lastMonth":
      start.setMonth(now.getMonth() - 1, 1);
      end.setDate(0);
      break;
    case "ytd":
      start.setMonth(0, 1);
      break;
  }

  return {
    startDate: formatLocalDate(start),
    endDate: formatLocalDate(end),
  };
}

function formatPackageQty(
  totalUsed: number,
  packageSize: number | null,
  packageUnit: string | null,
  rawUnit: string
): string {
  if (!packageSize || packageSize <= 0) {
    return `${Math.round(totalUsed * 100) / 100} ${rawUnit}`;
  }
  const pkgsUsed = totalUsed / packageSize;
  const pkgUnit = packageUnit || rawUnit;
  const caseMatch = pkgUnit.match(/case|bottle|tub|box|bag|container|bucket|pack/i);
  const unitWord = caseMatch ? caseMatch[0].toLowerCase() : "pkg";
  const plural = Math.abs(pkgsUsed) !== 1;

  if (pkgsUsed === Math.floor(pkgsUsed)) {
    return `${pkgsUsed} ${unitWord}${plural ? "s" : ""}`;
  }
  return `${pkgsUsed.toFixed(1)} ${unitWord}${plural ? "s" : ""}`;
}

function formatDateHeader(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  const d = new Date(year, month - 1, day);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate()
  ) {
    return "Today";
  }
  if (
    d.getFullYear() === yesterday.getFullYear() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getDate() === yesterday.getDate()
  ) {
    return "Yesterday";
  }
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export default function InventoryUsagePage() {
  const [datePreset, setDatePreset] = useState<DatePreset>("month");
  const [usage, setUsage] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [groupBy, setGroupBy] = useState<"date" | "ingredient">("date");

  useEffect(() => {
    setLoading(true);
    const { startDate, endDate } = getDateRange(datePreset);
    fetch(`/api/inventory/deduct?startDate=${startDate}&endDate=${endDate}`)
      .then((res) => res.json())
      .then((data) => {
        setUsage(data.usage || []);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load usage:", err);
        setLoading(false);
      });
  }, [datePreset]);

  if (loading) {
    return (
      <div className="min-h-screen bg-white p-6">
        <p className="text-gray-500">Loading inventory usage...</p>
      </div>
    );
  }

  // Group usage data
  const grouped: Record<string, any[]> = {};

  usage.forEach((item) => {
    const key = groupBy === "date" ? item.date : item.ingredient_name;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(item);
  });

  // Sort group keys
  const sortedKeys = Object.keys(grouped).sort((a, b) => {
    if (groupBy === "date") {
      // Dates descending (newest first)
      return b.localeCompare(a);
    }
    // Ingredients alphabetically
    return a.localeCompare(b);
  });

  return (
    <div className="min-h-screen bg-white pb-24">
      {/* Header */}
      <div className="bg-black text-white p-6">
        <h1 className="text-2xl font-bold">Inventory Usage</h1>
        <p className="text-gray-400 text-sm mt-1">Track ingredient deductions from sales</p>
      </div>

      {/* Controls */}
      <div className="p-6 border-b border-gray-200 space-y-4">
        {/* Date Range */}
        <div>
          <div className="text-sm font-medium text-gray-700 mb-2">Date Range</div>
          <div className="flex gap-2 overflow-x-auto pb-2">
            {(["today", "week", "month", "lastMonth", "ytd"] as DatePreset[]).map((preset) => (
              <button
                key={preset}
                onClick={() => setDatePreset(preset)}
                className={`px-4 py-2 rounded-lg whitespace-nowrap transition-colors ${
                  datePreset === preset
                    ? "bg-black text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                {preset === "today" && "Today"}
                {preset === "week" && "This Week"}
                {preset === "month" && "This Month"}
                {preset === "lastMonth" && "Last Month"}
                {preset === "ytd" && "Year to Date"}
              </button>
            ))}
          </div>
        </div>

        {/* Group By */}
        <div>
          <div className="text-sm font-medium text-gray-700 mb-2">Group By</div>
          <div className="flex gap-2">
            {(["date", "ingredient"] as const).map((group) => (
              <button
                key={group}
                onClick={() => setGroupBy(group)}
                className={`px-4 py-2 rounded-lg transition-colors ${
                  groupBy === group
                    ? "bg-black text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                {group === "date" && "Date"}
                {group === "ingredient" && "Ingredient"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Usage Data */}
      {usage.length === 0 ? (
        <div className="p-6 text-center text-gray-500">
          <p>No usage data for this period.</p>
          <p className="text-sm mt-2">Usage is tracked when sales happen in Square.</p>
        </div>
      ) : (
        <div className="p-6 space-y-6">
          {sortedKeys.map((key) => {
            const items = grouped[key];

            return (
              <div key={key} className="border border-gray-200 rounded-lg overflow-hidden">
                {/* Group Header */}
                <div className="bg-gray-100 p-4">
                  <h3 className="font-semibold text-lg">
                    {groupBy === "date" ? formatDateHeader(key) : key}
                  </h3>
                  {groupBy === "date" && key !== formatDateHeader(key) && (
                    <p className="text-sm text-gray-500">{key}</p>
                  )}
                  <p className="text-sm text-gray-600">
                    {items.length} ingredient{items.length !== 1 ? "s" : ""}
                  </p>
                </div>

                {/* Group Items */}
                <div className="divide-y divide-gray-200">
                  {items.map((item: any, idx: number) => {
                    const totalUsed = Number(item.total_used);
                    const pkgQty = formatPackageQty(
                      totalUsed,
                      item.package_size ? Number(item.package_size) : null,
                      item.package_unit,
                      item.unit
                    );

                    return (
                      <div key={idx} className="p-4 hover:bg-gray-50">
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <div className="font-medium">
                              {groupBy === "date" ? item.ingredient_name : formatDateHeader(item.date)}
                            </div>
                            <div className="text-xs text-gray-500 mt-1">
                              {Math.round(totalUsed * 100) / 100} {item.unit} across{" "}
                              {item.transaction_count} sale{item.transaction_count !== 1 ? "s" : ""}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-lg font-bold text-red-600">
                              -{pkgQty}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4">
        <div className="flex justify-around max-w-md mx-auto">
          <a href="/" className="flex flex-col items-center text-gray-600">
            <span className="text-2xl">🏠</span>
            <span className="text-xs mt-1">Home</span>
          </a>
          <a href="/orders" className="flex flex-col items-center text-gray-600">
            <span className="text-2xl">🛒</span>
            <span className="text-xs mt-1">Orders</span>
          </a>
          <a href="/inventory-usage" className="flex flex-col items-center text-black">
            <span className="text-2xl">📊</span>
            <span className="text-xs mt-1">Usage</span>
          </a>
          <a href="/ingredients" className="flex flex-col items-center text-gray-600">
            <span className="text-2xl">🥕</span>
            <span className="text-xs mt-1">Stock</span>
          </a>
        </div>
      </div>
    </div>
  );
}
