"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";

/* eslint-disable @typescript-eslint/no-explicit-any */

interface HubCard {
  title: string;
  description: string;
  href: string;
  ownerOnly?: boolean;
  icon: React.ReactNode;
}

const cards: HubCard[] = [
  {
    title: "Sales",
    description: "Today's revenue, top sellers, daily trends",
    href: "/sales",
    ownerOnly: true,
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-7 h-7">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
      </svg>
    ),
  },
  {
    title: "P&L & Expenses",
    description: "Profit & loss, expense tracking, KPIs",
    href: "/expenses",
    ownerOnly: true,
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-7 h-7">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    title: "Projections",
    description: "Forecasts, survival score, cash flow",
    href: "/projections",
    ownerOnly: true,
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-7 h-7">
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
      </svg>
    ),
  },
  {
    title: "Hourly Breakdown",
    description: "Revenue by hour, staffing efficiency",
    href: "/hourly",
    ownerOnly: true,
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-7 h-7">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    title: "Bank Connections",
    description: "Connect bank accounts, sync & categorize transactions",
    href: "/bank-connections",
    ownerOnly: true,
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-7 h-7">
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008z" />
      </svg>
    ),
  },
];

export default function MoneyHub() {
  const { data: session } = useSession();
  const role = (session?.user as any)?.role || "manager";

  const visibleCards = cards.filter((card) =>
    role === "owner" ? true : !card.ownerOnly
  );

  if (visibleCards.length === 0) {
    return (
      <div className="text-center py-16 text-gray-500">
        <p>No financial pages available for your role.</p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-xl font-bold text-porch-brown mb-1">Money</h1>
      <p className="text-sm text-gray-500 mb-5">Financial reports & analysis</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {visibleCards.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="flex items-start gap-4 bg-white rounded-xl p-4 shadow-sm border border-gray-100 hover:shadow-md hover:border-porch-teal/30 transition-all active:scale-[0.98]"
          >
            <span className="text-porch-teal mt-0.5 shrink-0">{card.icon}</span>
            <div className="min-w-0">
              <h2 className="font-semibold text-porch-brown text-[15px]">{card.title}</h2>
              <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{card.description}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
