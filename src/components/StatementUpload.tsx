"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface StatementStatus {
  id: string;
  file_name: string;
  status: "queued" | "processing" | "completed" | "error";
  bank_name: string | null;
  transaction_count: number;
  error_message: string | null;
  created_at: string;
}

interface StatusSummary {
  total: number;
  queued: number;
  processing: number;
  completed: number;
  errors: number;
  total_transactions: number;
  categorized: boolean;
}

interface StatusResponse {
  statements: StatementStatus[];
  summary: StatusSummary;
}

export default function StatementUpload() {
  const [uploading, setUploading] = useState(false);
  const [tracking, setTracking] = useState(false);
  const [statusData, setStatusData] = useState<StatusResponse | null>(null);
  const [error, setError] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [uploadedIds, setUploadedIds] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Fetch current status from the server
  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/statements/status");
      if (res.ok) {
        const data: StatusResponse = await res.json();
        setStatusData(data);

        // Stop polling if nothing is queued/processing
        if (data.summary.queued === 0 && data.summary.processing === 0 && pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      }
    } catch {
      // Silent — don't break the UI over a status check
    }
  }, []);

  // Start polling every 3 seconds
  const startPolling = useCallback(() => {
    if (pollRef.current) return; // Already polling
    fetchStatus(); // Fetch immediately
    pollRef.current = setInterval(fetchStatus, 15000);
  }, [fetchStatus]);

  // Clean up polling on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  // Load initial status on mount
  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const handleUpload = async (files: FileList) => {
    const fileArray = Array.from(files).filter(
      (f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf")
    );

    if (fileArray.length === 0) {
      setError("No PDF files selected");
      return;
    }

    setUploading(true);
    setError("");

    const formData = new FormData();
    for (const file of fileArray) {
      formData.append("files", file);
    }

    try {
      const res = await fetch("/api/statements/upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Upload failed");
        setUploading(false);
        return;
      }

      // Track which statements we just uploaded
      const newIds = new Set(uploadedIds);
      for (const stmt of data.statements) {
        newIds.add(stmt.id);
      }
      setUploadedIds(newIds);

      // Switch to tracking mode and start polling
      setTracking(true);
      startPolling();
    } catch {
      setError("Something went wrong uploading. Please try again.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // Get only the statements we uploaded in this session (for the progress view)
  const currentBatch = statusData?.statements.filter((s) => uploadedIds.has(s.id)) || [];
  const summary = statusData?.summary;

  // Are we still processing?
  const isProcessing = (summary?.queued ?? 0) > 0 || (summary?.processing ?? 0) > 0;
  const allDone = tracking && !isProcessing && currentBatch.length > 0;

  const statusIcon = (status: string) => {
    switch (status) {
      case "queued": return "⏳";
      case "processing": return "🔄";
      case "completed": return "✅";
      case "error": return "❌";
      default: return "📄";
    }
  };

  const statusLabel = (status: string) => {
    switch (status) {
      case "queued": return "Waiting in line";
      case "processing": return "AI is reading it...";
      case "completed": return "Done";
      case "error": return "Error";
      default: return status;
    }
  };

  // All past statements (not in current batch)
  const historyStatements = statusData?.statements.filter(
    (s) => !uploadedIds.has(s.id) && s.status === "completed"
  ) || [];

  return (
    <div className="bg-white rounded-2xl border border-porch-cream-dark/50 p-4">
      {/* Header */}
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-xl bg-porch-cream flex items-center justify-center">
          <span className="text-xl">📄</span>
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-porch-brown">
            Upload Bank Statements
          </h3>
          <p className="text-[10px] text-porch-brown-light/50">
            Upload PDF statements to import transactions — they process in the background
          </p>
        </div>
      </div>

      {/* Upload area — show when not tracking or when done */}
      {(!tracking || allDone) && !uploading && (
        <>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,application/pdf"
            multiple
            className="hidden"
            onChange={(e) => {
              const files = e.target.files;
              if (files && files.length > 0) handleUpload(files);
            }}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full py-4 rounded-xl border-2 border-dashed border-porch-cream-dark/60 bg-porch-cream/30 text-sm font-medium text-porch-brown-light/60 active:scale-[0.98] transition-transform hover:border-porch-teal/50 hover:text-porch-teal"
          >
            <div className="flex flex-col items-center gap-1.5">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
                <path fillRule="evenodd" d="M11.47 2.47a.75.75 0 011.06 0l4.5 4.5a.75.75 0 01-1.06 1.06l-3.22-3.22V16.5a.75.75 0 01-1.5 0V4.81L8.03 8.03a.75.75 0 01-1.06-1.06l4.5-4.5z" clipRule="evenodd" />
                <path d="M3.75 15.75a.75.75 0 01.75.75v2.25a1.5 1.5 0 001.5 1.5h12a1.5 1.5 0 001.5-1.5V16.5a.75.75 0 011.5 0v2.25a3 3 0 01-3 3H6a3 3 0 01-3-3V16.5a.75.75 0 01.75-.75z" />
              </svg>
              <span>{allDone ? "Upload more statements" : "Tap to upload PDF statements"}</span>
              <span className="text-[10px] text-porch-brown-light/40">You can select multiple files at once</span>
            </div>
          </button>
        </>
      )}

      {/* Uploading (saving files) */}
      {uploading && (
        <div className="flex flex-col items-center gap-3 py-6">
          <div className="w-8 h-8 border-3 border-porch-cream-dark border-t-porch-teal rounded-full animate-spin" />
          <p className="text-sm font-medium text-porch-brown">Saving your files...</p>
          <p className="text-[10px] text-porch-brown-light/50">This only takes a moment</p>
        </div>
      )}

      {/* Live progress — tracking uploaded files */}
      {tracking && !uploading && currentBatch.length > 0 && (
        <div className="space-y-3">
          {/* Progress bar */}
          {isProcessing && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-xs font-medium text-porch-brown">
                  Processing {summary?.completed ?? 0} of {currentBatch.length}
                </p>
                {summary?.categorized && (
                  <span className="text-[10px] text-porch-teal font-medium">Categorized!</span>
                )}
              </div>
              <div className="w-full bg-porch-cream rounded-full h-2">
                <div
                  className="bg-porch-teal rounded-full h-2 transition-all duration-500"
                  style={{
                    width: `${currentBatch.length > 0 ? (currentBatch.filter((s) => s.status === "completed" || s.status === "error").length / currentBatch.length) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>
          )}

          {/* All done banner */}
          {allDone && (
            <div className={`rounded-xl p-3 text-center ${summary?.categorized ? "bg-status-good/10" : "bg-porch-cream/50"}`}>
              <p className="text-2xl mb-1">{summary?.categorized ? "✅" : "📊"}</p>
              <p className="text-sm font-semibold text-porch-brown">
                {summary?.categorized
                  ? `All done! ${summary.total_transactions} transactions categorized`
                  : `${currentBatch.filter((s) => s.status === "completed").length} of ${currentBatch.length} statements processed`}
              </p>
              {summary?.categorized && (
                <a
                  href="/expenses"
                  className="inline-block mt-2 text-xs font-medium text-porch-teal underline underline-offset-2"
                >
                  Review transactions →
                </a>
              )}
            </div>
          )}

          {/* Individual file statuses */}
          <div className="space-y-1.5 max-h-64 overflow-y-auto">
            {currentBatch.map((stmt) => (
              <div
                key={stmt.id}
                className={`rounded-xl px-3 py-2 ${
                  stmt.status === "error" ? "bg-status-danger/5" : "bg-porch-cream/40"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 min-w-0 flex-1">
                    <span className="text-sm shrink-0">{statusIcon(stmt.status)}</span>
                    <span className="text-xs font-medium text-porch-brown truncate">
                      {stmt.status === "completed" && stmt.bank_name ? stmt.bank_name : stmt.file_name}
                    </span>
                  </div>
                  <div className="text-right shrink-0 ml-2">
                    {stmt.status === "completed" ? (
                      <span className="text-xs font-bold text-porch-brown">
                        {stmt.transaction_count} expenses
                      </span>
                    ) : (
                      <span className="text-[10px] text-porch-brown-light/50">
                        {statusLabel(stmt.status)}
                      </span>
                    )}
                  </div>
                </div>
                {stmt.status === "error" && stmt.error_message && (
                  <p className="text-[10px] text-status-danger mt-1 ml-6">{stmt.error_message}</p>
                )}
              </div>
            ))}
          </div>

          {/* Reset button when done */}
          {allDone && (
            <button
              onClick={() => {
                setTracking(false);
                setUploadedIds(new Set());
              }}
              className="w-full py-2 rounded-xl text-xs text-porch-brown-light/50 active:scale-[0.98] transition-transform"
            >
              Upload more statements
            </button>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <p className="text-xs text-status-danger mt-2">{error}</p>
      )}

      {/* Upload history */}
      {historyStatements.length > 0 && (
        <div className="mt-3 pt-3 border-t border-porch-cream-dark/30">
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="flex items-center justify-between w-full text-xs text-porch-brown-light/60"
          >
            <span className="font-medium">
              Upload History ({historyStatements.length})
            </span>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className={`w-4 h-4 transition-transform ${showHistory ? "rotate-180" : ""}`}
            >
              <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
            </svg>
          </button>

          {showHistory && (
            <div className="mt-2 space-y-2">
              {historyStatements.map((s) => (
                <div
                  key={s.id}
                  className="bg-porch-cream/40 rounded-xl px-3 py-2"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0 mr-2">
                      <p className="text-xs font-medium text-porch-brown truncate">
                        {s.bank_name || s.file_name}
                      </p>
                      <p className="text-[10px] text-porch-brown-light/50">
                        {new Date(s.created_at).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs font-bold text-porch-brown">
                        {s.transaction_count}
                      </p>
                      <p className="text-[9px] text-porch-brown-light/40">
                        transactions
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
