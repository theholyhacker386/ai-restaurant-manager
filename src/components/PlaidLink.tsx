"use client";

import { useCallback, useEffect, useState } from "react";
import { usePlaidLink } from "react-plaid-link";

/* eslint-disable @typescript-eslint/no-explicit-any */

interface ConnectedAccount {
  account_id: string;
  name: string;
  official_name: string;
  type: string;
  subtype: string;
  mask: string;
  current_balance: number;
  available_balance: number;
  institution_name: string;
  last_synced: string;
  item_status: string;
  item_id: string;
}

interface PlaidTransaction {
  id: string;
  transaction_id: string;
  amount: number;
  date: string;
  name: string;
  merchant_name: string;
  category: string;
  category_detailed: string;
  pending: boolean;
  review_status: string;
  suggested_category_id: string;
  approved_category_id: string;
  source: string;
}

interface Category {
  id: string;
  name: string;
  type: string;
}

export default function PlaidLinkSection() {
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<ConnectedAccount[]>([]);
  const [transactions, setTransactions] = useState<PlaidTransaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [categorizing, setCategorizing] = useState(false);
  const [error, setError] = useState("");
  const [view, setView] = useState<"summary" | "review" | "history" | "transfers">("summary");

  const fetchPlaidData = useCallback(async () => {
    try {
      const [plaidRes, expRes] = await Promise.all([
        fetch("/api/plaid/accounts"),
        fetch("/api/expenses"),
      ]);
      if (plaidRes.ok) {
        const data = await plaidRes.json();
        setAccounts(data.accounts || []);
        setTransactions(data.transactions || []);
      }
      if (expRes.ok) {
        const data = await expRes.json();
        setCategories(data.categories || []);
      }
    } catch {
      // Silent
    }
  }, []);

  useEffect(() => {
    fetchPlaidData();
  }, [fetchPlaidData]);

  // Auto-show review tab if there are transactions to review
  useEffect(() => {
    const pending = transactions.filter(
      (t) => t.review_status === "needs_review"
    );
    if (pending.length > 0 && view === "summary") {
      setView("review");
    }
  }, [transactions, view]);

  const startConnect = async () => {
    setConnecting(true);
    setError("");
    try {
      const res = await fetch("/api/plaid/create-link-token", {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setLinkToken(data.link_token);
    } catch {
      setError("Could not start bank connection. Please try again.");
      setConnecting(false);
    }
  };

  const disconnectAccount = async (itemId: string, bankName: string) => {
    if (!confirm(`Are you sure you want to disconnect ${bankName}?`)) return;
    try {
      const res = await fetch("/api/plaid/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item_id: itemId }),
      });
      if (!res.ok) throw new Error("Failed");
      await fetchPlaidData();
    } catch {
      setError("Failed to disconnect bank account. Please try again.");
    }
  };

  const syncAndCategorize = async () => {
    setSyncing(true);
    setError("");
    try {
      await fetch("/api/plaid/sync-transactions", { method: "POST" });
      setCategorizing(true);
      await fetch("/api/plaid/categorize", { method: "POST" });
      await fetchPlaidData();
      setView("review");
    } catch {
      setError("Could not sync transactions. Please try again.");
    } finally {
      setSyncing(false);
      setCategorizing(false);
    }
  };

  const approveTransaction = async (
    txnId: string,
    categoryId: string,
    categoryName: string
  ) => {
    try {
      await fetch("/api/plaid/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transaction_id: txnId,
          category_id: categoryId,
          category_name: categoryName,
        }),
      });
      await fetchPlaidData();
    } catch {
      setError("Failed to approve");
    }
  };

  const approveAll = async () => {
    const toApprove = needsReview.filter((t) => t.suggested_category_id);
    if (toApprove.length === 0) return;
    try {
      await fetch("/api/plaid/approve", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          approvals: toApprove.map((t) => ({
            transaction_id: t.transaction_id,
            category_id: t.suggested_category_id,
            category_name:
              categories.find((c) => c.id === t.suggested_category_id)?.name || "",
          })),
        }),
      });
      await fetchPlaidData();
    } catch {
      setError("Failed to approve");
    }
  };

  const isConnected = accounts.length > 0;
  const needsReview = transactions.filter(
    (t) => t.review_status === "needs_review"
  );
  const approvedTxns = transactions.filter(
    (t) => t.review_status === "approved" || t.review_status === "auto_approved"
  );
  const transferTxns = transactions.filter(
    (t) => t.review_status === "transfer"
  );

  return (
    <div className="space-y-3">
      {/* Connection card */}
      <div className="bg-white rounded-2xl border border-porch-cream-dark/50 p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl bg-porch-cream flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-5 h-5 text-porch-teal">
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008z" />
            </svg>
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-porch-brown">
              Bank Connection
            </h3>
            <p className="text-[10px] text-porch-brown-light/50">
              {isConnected
                ? `Connected to ${accounts[0]?.institution_name || "your bank"}`
                : "Import expenses automatically from your bank"}
            </p>
          </div>
          {isConnected && (
            <span className="w-3 h-3 rounded-full bg-status-good" />
          )}
        </div>

        {isConnected ? (
          <>
            {accounts.map((acc) => (
              <div
                key={acc.account_id}
                className="bg-porch-cream/50 rounded-xl px-3 py-2.5 mb-2"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-porch-brown">
                      {acc.name}
                    </p>
                    <p className="text-[10px] text-porch-brown-light/50">
                      {acc.institution_name} ••••{acc.mask}
                    </p>
                  </div>
                  <p className="text-sm font-bold text-porch-brown">
                    $
                    {(acc.current_balance || 0).toLocaleString("en-US", {
                      minimumFractionDigits: 2,
                    })}
                  </p>
                </div>
                <button
                  onClick={() => disconnectAccount(acc.item_id, acc.institution_name || acc.name)}
                  className="text-[10px] text-porch-brown/50 hover:text-status-danger transition-colors mt-1"
                >
                  Disconnect
                </button>
              </div>
            ))}

            <button
              onClick={syncAndCategorize}
              disabled={syncing || categorizing}
              className="w-full py-2.5 rounded-xl bg-porch-teal text-white text-sm font-semibold disabled:opacity-50 active:scale-[0.98] transition-transform"
            >
              {syncing
                ? "Syncing from bank..."
                : categorizing
                ? "Analyzing transactions..."
                : "Sync & Categorize"}
            </button>

            {/* Review badge */}
            {needsReview.length > 0 && view !== "review" && (
              <button
                onClick={() => setView("review")}
                className="w-full mt-2 py-2 rounded-xl bg-status-warning/10 border border-status-warning/30 text-sm font-medium text-status-warning"
              >
                {needsReview.length} transaction
                {needsReview.length !== 1 ? "s" : ""} need your approval
              </button>
            )}

            {/* View tabs */}
            {transactions.length > 0 && (
              <div className="flex gap-1 mt-3 bg-porch-cream rounded-xl p-1">
                {(["summary", "review", "history", "transfers"] as const).map((v) => (
                  <button
                    key={v}
                    onClick={() => setView(v)}
                    className={`flex-1 py-1.5 rounded-lg text-[10px] font-semibold transition-colors ${
                      view === v
                        ? "bg-white text-porch-brown shadow-sm"
                        : "text-porch-brown-light/60"
                    }`}
                  >
                    {v === "summary"
                      ? "Summary"
                      : v === "review"
                      ? `Review (${needsReview.length})`
                      : v === "transfers"
                      ? `Transfers (${transferTxns.length})`
                      : "History"}
                  </button>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            <p className="text-xs text-porch-brown-light/60 mb-3">
              Connect your restaurant&apos;s bank account to automatically import
              and categorize transactions. The app learns from your approvals
              and gets smarter over time!
            </p>
            <button
              onClick={startConnect}
              disabled={connecting}
              className="w-full py-3 rounded-xl bg-porch-teal text-white text-sm font-semibold disabled:opacity-50 active:scale-[0.98] transition-transform"
            >
              {connecting ? "Starting..." : "Connect Bank Account"}
            </button>
          </>
        )}

        {error && (
          <p className="text-xs text-status-danger mt-2">{error}</p>
        )}
      </div>

      {/* REVIEW PANEL */}
      {view === "review" && needsReview.length > 0 && (
        <div className="bg-white rounded-2xl border border-porch-cream-dark/50 overflow-hidden">
          <div className="px-4 py-2.5 border-b border-porch-cream-dark/30">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xs font-bold text-porch-brown uppercase tracking-wider">
                  Review Transactions
                </h3>
                <p className="text-[10px] text-porch-brown-light/40 mt-0.5">
                  {needsReview.length} transactions need approval
                </p>
              </div>
              <button
                onClick={approveAll}
                className="px-3 py-1.5 rounded-lg bg-status-good text-white text-[10px] font-bold active:scale-95 transition-transform"
              >
                Approve All ({needsReview.length})
              </button>
            </div>
          </div>
          <div className="max-h-[500px] overflow-y-auto divide-y divide-porch-cream-dark/10">
            {needsReview.map((txn) => (
              <ReviewCard
                key={txn.id}
                txn={txn}
                categories={categories}
                onApprove={approveTransaction}
              />
            ))}
          </div>
        </div>
      )}

      {view === "review" && needsReview.length === 0 && (
        <div className="bg-white rounded-2xl border border-porch-cream-dark/50 p-8 text-center">
          <div className="text-3xl mb-2">&#10003;</div>
          <p className="text-sm font-medium text-porch-brown">All caught up!</p>
          <p className="text-[10px] text-porch-brown-light/50 mt-1">
            No transactions need review. Next time these merchants appear,
            they&apos;ll be categorized automatically!
          </p>
        </div>
      )}

      {/* SUMMARY PANEL */}
      {view === "summary" && isConnected && (
        <div className="bg-white rounded-2xl border border-porch-cream-dark/50 p-4">
          <h3 className="text-xs font-bold text-porch-brown mb-3">
            Bank Sync Summary
          </h3>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="bg-porch-cream/50 rounded-xl p-3">
              <p className="text-lg font-bold text-porch-brown">
                {transactions.filter((t) => t.amount > 0).length}
              </p>
              <p className="text-[10px] text-porch-brown-light/50">
                Total Expenses
              </p>
            </div>
            <div className="bg-status-good/10 rounded-xl p-3">
              <p className="text-lg font-bold text-status-good">
                {approvedTxns.length}
              </p>
              <p className="text-[10px] text-porch-brown-light/50">Approved</p>
            </div>
            <div className="bg-status-warning/10 rounded-xl p-3">
              <p className="text-lg font-bold text-status-warning">
                {needsReview.length}
              </p>
              <p className="text-[10px] text-porch-brown-light/50">
                Pending
              </p>
            </div>
          </div>
        </div>
      )}

      {/* HISTORY PANEL */}
      {view === "history" && (
        <div className="bg-white rounded-2xl border border-porch-cream-dark/50 overflow-hidden">
          <div className="px-4 py-2.5 border-b border-porch-cream-dark/30">
            <h3 className="text-xs font-bold text-porch-brown uppercase tracking-wider">
              Approved Transactions
            </h3>
          </div>
          <div className="max-h-80 overflow-y-auto divide-y divide-porch-cream-dark/10">
            {transactions
              .filter(
                (t) =>
                  t.amount > 0 &&
                  (t.review_status === "approved" ||
                    t.review_status === "auto_approved")
              )
              .map((txn) => (
                <div key={txn.id} className="px-4 py-2.5 flex items-center justify-between">
                  <div className="flex-1 min-w-0 mr-3">
                    <p className="text-xs font-medium text-porch-brown truncate">
                      {txn.merchant_name || txn.name}
                    </p>
                    <p className="text-[10px] text-porch-brown-light/50">
                      {new Date(txn.date + "T12:00:00").toLocaleDateString(
                        "en-US",
                        { month: "short", day: "numeric" }
                      )}
                      <span className="ml-1.5 px-1.5 py-0.5 bg-porch-cream rounded text-[9px]">
                        {categories.find(
                          (c) => c.id === txn.approved_category_id
                        )?.name || "Categorized"}
                      </span>
                    </p>
                  </div>
                  <span className="text-xs font-bold text-status-danger">
                    -${Math.abs(txn.amount).toFixed(2)}
                  </span>
                </div>
              ))}
            {transactions.filter(
              (t) =>
                t.amount > 0 &&
                (t.review_status === "approved" ||
                  t.review_status === "auto_approved")
            ).length === 0 && (
              <div className="p-6 text-center">
                <p className="text-xs text-porch-brown-light/50">
                  No approved transactions yet
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TRANSFERS PANEL */}
      {view === "transfers" && (
        <div className="bg-white rounded-2xl border border-porch-cream-dark/50 overflow-hidden">
          <div className="px-4 py-2.5 border-b border-porch-cream-dark/30">
            <h3 className="text-xs font-bold text-porch-brown uppercase tracking-wider">
              Transfers (Skipped)
            </h3>
            <p className="text-[10px] text-porch-brown-light/40 mt-0.5">
              These are money moving between accounts — not real expenses
            </p>
          </div>
          <div className="max-h-80 overflow-y-auto divide-y divide-porch-cream-dark/10">
            {transferTxns.length > 0 ? transferTxns.map((txn) => (
              <div key={txn.id} className="px-4 py-2.5 flex items-center justify-between">
                <div className="flex-1 min-w-0 mr-3">
                  <p className="text-xs font-medium text-porch-brown/60 truncate">
                    {txn.merchant_name || txn.name}
                  </p>
                  <p className="text-[10px] text-porch-brown-light/40">
                    {new Date(txn.date + "T12:00:00").toLocaleDateString("en-US", {
                      month: "short", day: "numeric",
                    })}
                    <span className="ml-1.5 px-1.5 py-0.5 bg-gray-100 rounded text-[9px] text-gray-500">
                      Transfer
                    </span>
                  </p>
                </div>
                <span className="text-xs font-bold text-porch-brown-light/40">
                  ${Math.abs(txn.amount).toFixed(2)}
                </span>
              </div>
            )) : (
              <div className="p-6 text-center">
                <p className="text-xs text-porch-brown-light/50">
                  No transfers detected yet
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Plaid Link modal */}
      {linkToken && (
        <PlaidLinkModal
          linkToken={linkToken}
          onSuccess={async (publicToken, metadata) => {
            setConnecting(true);
            try {
              const res = await fetch("/api/plaid/exchange-token", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  public_token: publicToken,
                  institution: metadata.institution,
                }),
              });
              if (!res.ok) throw new Error("Exchange failed");
              await fetchPlaidData();
              await syncAndCategorize();
            } catch {
              setError("Failed to save bank connection. Please try again.");
            } finally {
              setConnecting(false);
              setLinkToken(null);
            }
          }}
          onExit={() => {
            setLinkToken(null);
            setConnecting(false);
          }}
        />
      )}
    </div>
  );
}

/**
 * Individual transaction review card
 */
function ReviewCard({
  txn,
  categories,
  onApprove,
}: {
  txn: PlaidTransaction;
  categories: Category[];
  onApprove: (txnId: string, catId: string, catName: string) => void;
}) {
  const [selectedCat, setSelectedCat] = useState(
    txn.suggested_category_id || ""
  );
  const [showPicker, setShowPicker] = useState(false);
  const [approving, setApproving] = useState(false);

  const [pendingApprove, setPendingApprove] = useState<string | null>(null);
  useEffect(() => {
    if (!pendingApprove) return;
    const catName = categories.find((c) => c.id === pendingApprove)?.name || "";
    setApproving(true);
    onApprove(txn.transaction_id, pendingApprove, catName);
    setPendingApprove(null);
  }, [pendingApprove]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedName =
    categories.find((c) => c.id === selectedCat)?.name || "Select category...";

  const groupedCats: Record<string, Category[]> = {};
  categories.forEach((c) => {
    if (!groupedCats[c.type]) groupedCats[c.type] = [];
    groupedCats[c.type].push(c);
  });

  const typeLabels: Record<string, string> = {
    cogs: "Food & Supplies",
    labor: "Labor",
    occupancy: "Rent",
    utilities: "Utilities",
    direct_ops: "Operations",
    marketing: "Marketing",
    technology: "Technology",
    admin: "Admin",
    repairs: "Repairs",
    regulatory: "Licenses",
    financial: "Financial",
    other: "Other",
    overhead: "Overhead",
  };

  const shortName = selectedName
    .replace("Ingredients/Food Purchases", "Ingredients")
    .replace("Supplies (cups, napkins, straws)", "Supplies")
    .replace("Paper, Packaging & To-Go Containers", "Packaging")
    .replace("Kitchen Equipment Repairs", "Equipment Repair")
    .replace("General Liability Insurance", "Insurance")
    .replace("Credit Card Processing Fees", "CC Processing")
    .replace("Software & Subscriptions", "Software")
    .replace("Digital Advertising", "Digital Ads")
    .replace("Cost of Goods", "COGS")
    .replace("Print Marketing & Flyers", "Print Marketing")
    .replace("Office Supplies & Postage", "Office")
    .replace("Bank Fees & Charges", "Bank Fees")
    .replace("Accounting & Bookkeeping", "Accounting")
    .replace("Travel & Transportation", "Travel")
    .replace("Meals & Entertainment", "Meals")
    .replace("Other/Miscellaneous", "Other")
    .replace("Trash Removal & Recycling", "Trash")
    .replace("Cleaning & Janitorial", "Cleaning")
    .replace("Water & Sewage", "Water")
    .replace("Rent/Lease Payment", "Rent")
    .replace("Internet/Phone", "Internet")
    .replace("Natural Gas", "Gas")
    .replace("Payroll/Wages", "Payroll")
    .replace("Payroll Taxes", "Payroll Tax")
    .replace("Business License", "License");

  const isCredit = txn.amount < 0;

  return (
    <div className="px-3 py-2.5">
      <div className="flex items-center gap-1.5">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-porch-brown truncate">
            {txn.merchant_name || txn.name}
          </p>
          <p className="text-[9px] text-porch-brown-light/40">
            {new Date(txn.date + "T12:00:00").toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            })}
            <span className={`ml-1 font-semibold ${isCredit ? "text-status-good" : "text-status-danger"}`}>
              {isCredit ? "+" : "-"}${Math.abs(txn.amount).toFixed(2)}
            </span>
          </p>
        </div>

        {!showPicker ? (
          <button
            onClick={() => setShowPicker(true)}
            className={`shrink-0 max-w-[100px] px-2 py-1.5 rounded-lg text-[10px] font-medium border text-left truncate transition-colors ${
              selectedCat
                ? "bg-porch-cream/50 border-porch-cream-dark/50 text-porch-brown"
                : "bg-status-warning/10 border-status-warning/30 text-status-warning"
            }`}
          >
            {shortName}
          </button>
        ) : (
          <select
            value={selectedCat}
            onChange={(e) => {
              const newCatId = e.target.value;
              setSelectedCat(newCatId);
              setShowPicker(false);
              if (newCatId) {
                setPendingApprove(newCatId);
              }
            }}
            onBlur={() => setShowPicker(false)}
            autoFocus
            className="shrink-0 max-w-[140px] px-1 py-1.5 rounded-lg border border-porch-teal text-[10px] bg-white focus:outline-none"
          >
            <option value="">Select...</option>
            {Object.entries(groupedCats).map(([type, cats]) => (
              <optgroup key={type} label={typeLabels[type] || type}>
                {cats.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        )}

        <button
          onClick={async () => {
            if (!selectedCat) {
              setShowPicker(true);
              return;
            }
            setApproving(true);
            await onApprove(txn.transaction_id, selectedCat, selectedName);
            setApproving(false);
          }}
          disabled={approving}
          className="w-8 h-7 rounded-lg bg-status-good text-white text-sm font-bold disabled:opacity-50 active:scale-95 transition-transform shrink-0 flex items-center justify-center"
        >
          {approving ? "·" : "✓"}
        </button>
      </div>
    </div>
  );
}

function PlaidLinkModal({
  linkToken,
  onSuccess,
  onExit,
}: {
  linkToken: string;
  onSuccess: (publicToken: string, metadata: any) => void;
  onExit: () => void;
}) {
  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess: (public_token, metadata) => {
      onSuccess(public_token, metadata);
    },
    onExit: () => {
      onExit();
    },
  });

  useEffect(() => {
    if (ready) {
      open();
    }
  }, [ready, open]);

  return null;
}
