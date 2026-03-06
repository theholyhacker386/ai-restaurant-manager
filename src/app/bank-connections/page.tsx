"use client";

import PlaidLinkSection from "@/components/PlaidLink";

export default function BankConnectionsPage() {
  return (
    <div>
      <h1 className="text-xl font-bold text-porch-brown mb-1">Bank Connections</h1>
      <p className="text-sm text-gray-500 mb-5">
        Connect your bank to automatically import and categorize expenses
      </p>
      <PlaidLinkSection />
    </div>
  );
}
