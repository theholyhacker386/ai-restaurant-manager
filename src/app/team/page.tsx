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
    title: "Weekly Schedule",
    description: "Recommended staffing by hour",
    href: "/schedule",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-7 h-7">
        <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5m-9-6h.008v.008H12v-.008zM12 15h.008v.008H12V15zm0 2.25h.008v.008H12v-.008zM9.75 15h.008v.008H9.75V15zm0 2.25h.008v.008H9.75v-.008zM7.5 15h.008v.008H7.5V15zm0 2.25h.008v.008H7.5v-.008zm6.75-4.5h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008V15zm0 2.25h.008v.008h-.008v-.008zm2.25-4.5h.008v.008H16.5v-.008zm0 2.25h.008v.008H16.5V15z" />
      </svg>
    ),
  },
  {
    title: "Labor Costs",
    description: "Payroll breakdown, labor vs revenue",
    href: "/labor",
    ownerOnly: true,
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-7 h-7">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
      </svg>
    ),
  },
];

export default function TeamHub() {
  const { data: session } = useSession();
  const role = (session?.user as any)?.role || "manager";

  const visibleCards = cards.filter((card) =>
    role === "owner" ? true : !card.ownerOnly
  );

  if (visibleCards.length === 0) {
    return (
      <div className="text-center py-16 text-gray-500">
        <p>No team pages available for your role.</p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-xl font-bold text-porch-brown mb-1">Team</h1>
      <p className="text-sm text-gray-500 mb-5">Scheduling, labor & team management</p>

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
