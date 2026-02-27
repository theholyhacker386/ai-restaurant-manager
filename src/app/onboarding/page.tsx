"use client";

import { useState, useEffect, useRef, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";

/* ── Types ─────────────────────────────────────────────── */

interface Message {
  id: string;
  role: "assistant" | "user" | "system";
  content: string;
  timestamp: number;
  attachments?: { name: string; type: string }[];
}

interface SessionData {
  businessInfo: { name?: string; type?: string; tenure?: string } | null;
  suppliers: string[];
  menuItems: { name: string; selling_price: number }[];
  ingredients: { name: string; package_size?: number | null; package_unit?: string; package_price?: number | null; supplier?: string }[];
  targets: { food_cost: number; labor_cost: number } | null;
  pinSet: boolean;
  pinValue: string;
  progress: number;
}

/* ── Constants ─────────────────────────────────────────── */

const INITIAL_SESSION: SessionData = {
  businessInfo: null,
  suppliers: [],
  menuItems: [],
  ingredients: [],
  targets: null,
  pinSet: false,
  pinValue: "",
  progress: 0,
};

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

/* ── Checklist Items ───────────────────────────────────── */

const CHECKLIST_REQUIRED = [
  { id: "menu", icon: "\uD83C\uDF7D\uFE0F", label: "Your menu with prices", desc: "A printed menu, PDF, or photo. Or be ready to list your items and prices." },
  { id: "receipts", icon: "\uD83E\uDDFE", label: "Recent receipts or supplier invoices", desc: "Photos or PDFs of receipts from wherever you buy food. One from each supplier is ideal." },
  { id: "suppliers", icon: "\uD83D\uDED2", label: "Know your supplier names", desc: "The stores, distributors, and websites you buy food and supplies from." },
];

const CHECKLIST_OPTIONAL = [
  { id: "spreadsheet", icon: "\uD83D\uDCCA", label: "Cost spreadsheet or P&L", desc: "If you track costs in a spreadsheet, have it ready to upload. CSV, Excel, or PDF." },
  { id: "costs", icon: "\uD83D\uDCB0", label: "Monthly overhead costs", desc: "Rent, utilities, insurance amounts. Helpful but not required right now." },
  { id: "pos", icon: "\uD83D\uDCF1", label: "POS system info", desc: "Know which system you use (Square, Toast, Clover, etc.)" },
];

/* ── Data Tag Parsing ──────────────────────────────────── */

function parseDataTags(text: string, session: SessionData): { cleanText: string; updatedSession: SessionData } {
  const updated = { ...session };

  // Progress
  const progressMatch = text.match(/\[PROGRESS:(\d+)\]/);
  if (progressMatch) {
    updated.progress = parseInt(progressMatch[1]);
  }

  // Business info
  const bizMatch = text.match(/\[BUSINESS_INFO:(\{.*?\})\]/);
  if (bizMatch) {
    try {
      const info = JSON.parse(bizMatch[1]);
      updated.businessInfo = { ...updated.businessInfo, ...info };
    } catch { /* ignore */ }
  }

  // Suppliers
  const supMatch = text.match(/\[ADD_SUPPLIERS:(\[.*?\])\]/);
  if (supMatch) {
    try {
      const names: string[] = JSON.parse(supMatch[1]);
      const existing = new Set(updated.suppliers.map((s) => s.toLowerCase()));
      for (const n of names) {
        if (!existing.has(n.toLowerCase())) {
          updated.suppliers.push(n);
          existing.add(n.toLowerCase());
        }
      }
    } catch { /* ignore */ }
  }

  // Menu items
  const menuMatch = text.match(/\[ADD_MENU_ITEMS:(\[[\s\S]*?\])\]/);
  if (menuMatch) {
    try {
      const items = JSON.parse(menuMatch[1]);
      const existing = new Set(updated.menuItems.map((m) => m.name.toLowerCase()));
      for (const item of items) {
        if (!existing.has(item.name.toLowerCase())) {
          updated.menuItems.push({ name: item.name, selling_price: Number(item.selling_price || item.price) || 0 });
          existing.add(item.name.toLowerCase());
        }
      }
    } catch { /* ignore */ }
  }

  // Ingredients
  const ingMatch = text.match(/\[ADD_INGREDIENTS:(\[[\s\S]*?\])\]/);
  if (ingMatch) {
    try {
      const items = JSON.parse(ingMatch[1]);
      const existing = new Set(updated.ingredients.map((i) => i.name.toLowerCase()));
      for (const item of items) {
        if (!existing.has(item.name.toLowerCase())) {
          updated.ingredients.push({
            name: item.name,
            package_size: item.package_size || item.packageSize || null,
            package_unit: item.package_unit || item.packageUnit || "",
            package_price: item.package_price || item.cost ? Number(item.package_price || item.cost) : null,
            supplier: item.supplier || "",
          });
          existing.add(item.name.toLowerCase());
        }
      }
    } catch { /* ignore */ }
  }

  // Targets
  const targetMatch = text.match(/\[SET_TARGETS:(\{.*?\})\]/);
  if (targetMatch) {
    try {
      const t = JSON.parse(targetMatch[1]);
      updated.targets = { food_cost: Number(t.food_cost) || 30, labor_cost: Number(t.labor_cost) || 28 };
    } catch { /* ignore */ }
  }

  // PIN
  const pinMatch = text.match(/\[SET_PIN:"?(\d{4,6})"?\]/);
  if (pinMatch) {
    updated.pinSet = true;
    updated.pinValue = pinMatch[1];
  }

  // Clean text — strip all data tags so user doesn't see them
  const cleanText = text
    .replace(/\[PROGRESS:\d+\]/g, "")
    .replace(/\[BUSINESS_INFO:\{.*?\}]/g, "")
    .replace(/\[ADD_SUPPLIERS:\[.*?\]]/g, "")
    .replace(/\[ADD_MENU_ITEMS:\[[\s\S]*?\]]/g, "")
    .replace(/\[ADD_INGREDIENTS:\[[\s\S]*?\]]/g, "")
    .replace(/\[SET_TARGETS:\{.*?\}]/g, "")
    .replace(/\[SET_PIN:"?\d{4,6}"?]/g, "")
    .replace(/\[ONBOARDING_COMPLETE]/g, "")
    .replace(/\[EXPENSES:\[[\s\S]*?\]]/g, "")
    .trim();

  return { cleanText, updatedSession: updated };
}

/* ── Chat Component ────────────────────────────────────── */

function OnboardingChat() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token");

  // Phase: "checklist" → "chat" → "complete"
  const [phase, setPhase] = useState<"loading" | "checklist" | "chat" | "complete" | "error">("loading");
  const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set());

  // Session
  const [userId, setUserId] = useState("");
  const [userName, setUserName] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [sessionData, setSessionData] = useState<SessionData>(INITIAL_SESSION);
  const [conversationHistory, setConversationHistory] = useState<{ role: string; content: string }[]>([]);

  // UI state
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [showUploadMenu, setShowUploadMenu] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadTypeRef = useRef<"menu" | "receipt" | "spreadsheet">("menu");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const savingRef = useRef(false);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, thinking]);

  /* ── Initialize ──────────────────────────────────────── */

  useEffect(() => {
    initSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function initSession() {
    try {
      // Both flows (token and logged-in) use the same GET endpoint
      const url = token
        ? `/api/onboarding/complete?token=${token}`
        : "/api/onboarding/complete";

      const res = await fetch(url);

      if (!res.ok) {
        if (token) {
          setErrorMsg("This setup link is invalid or has expired. Ask your manager for a new one.");
          setPhase("error");
        } else {
          // Not logged in and no token — shouldn't happen (middleware would redirect)
          setPhase("checklist");
        }
        return;
      }

      const data = await res.json();
      setUserName(data.userName || "");
      setUserId(data.userId || "");

      if (data.conversationHistory?.length > 0) {
        // Returning user — restore session and go straight to chat
        restoreSession(data);
        setPhase("chat");
        return;
      }

      setPhase("checklist");
    } catch {
      setPhase("checklist");
    }
  }

  function restoreSession(data: any) {
    if (data.conversationHistory) {
      setConversationHistory(data.conversationHistory);
      const msgs: Message[] = data.conversationHistory
        .filter((m: any) => !(m.role === "user" && m.content.includes("Start the onboarding")))
        .map((msg: any, i: number) => ({
          id: `restored-${i}`,
          role: msg.role,
          content: parseDataTags(msg.content, INITIAL_SESSION).cleanText,
          timestamp: Date.now() - (data.conversationHistory.length - i) * 1000,
        }));
      setMessages(msgs);
    }
    if (data.sessionData) {
      setSessionData(data.sessionData);
    }
    if (data.userName) setUserName(data.userName);
    if (data.userId) setUserId(data.userId);
  }

  /* ── Start Chat ──────────────────────────────────────── */

  async function startChat() {
    setPhase("chat");
    setThinking(true);

    try {
      const res = await fetch("/api/onboarding/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: "Start the onboarding. Greet me warmly and ask the first question.",
          conversationHistory: [],
          userName,
          sessionData: INITIAL_SESSION,
        }),
      });

      const data = await res.json();
      if (data.reply) {
        const { cleanText } = parseDataTags(data.reply, INITIAL_SESSION);
        const aiMsg: Message = {
          id: generateId(),
          role: "assistant",
          content: cleanText,
          timestamp: Date.now(),
        };
        setMessages([aiMsg]);
        setConversationHistory([
          { role: "user", content: "Start the onboarding. Greet me warmly and ask the first question." },
          { role: "assistant", content: data.reply },
        ]);
      }
    } catch {
      const fallbackMsg: Message = {
        id: generateId(),
        role: "assistant",
        content: `Hey${userName ? ` ${userName}` : ""}! Welcome to Porch Manager! I'm here to help you get your restaurant all set up. This takes about 10-15 minutes, and I'll walk you through everything step by step.\n\nLet's start with the basics \u2014 what's the name of your restaurant?`,
        timestamp: Date.now(),
      };
      setMessages([fallbackMsg]);
    }

    setThinking(false);
  }

  /* ── Send Message ────────────────────────────────────── */

  const sendMessage = useCallback(async (text?: string, fileResults?: any) => {
    if (thinking || uploading) return;
    const userText = text || input.trim();
    if (!userText && !fileResults) return;

    // Add user message to chat
    if (userText && !fileResults) {
      const userMsg: Message = {
        id: generateId(),
        role: "user",
        content: userText,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, userMsg]);
    }

    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    setThinking(true);

    const newHistory = [...conversationHistory];
    if (userText) {
      newHistory.push({ role: "user", content: userText });
    }

    try {
      const res = await fetch("/api/onboarding/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userText || undefined,
          conversationHistory,
          fileResults,
          sessionData,
          userName,
        }),
      });

      const data = await res.json();
      if (data.reply) {
        const { cleanText, updatedSession } = parseDataTags(data.reply, sessionData);

        const aiMsg: Message = {
          id: generateId(),
          role: "assistant",
          content: cleanText,
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, aiMsg]);

        newHistory.push({ role: "assistant", content: data.reply });
        setConversationHistory(newHistory);
        setSessionData(updatedSession);

        // Save session to database
        saveSession(updatedSession, newHistory);

        // Handle PIN
        if (updatedSession.pinSet && updatedSession.pinValue) {
          savePIN(updatedSession.pinValue);
        }

        // Handle completion
        if (data.reply.includes("[ONBOARDING_COMPLETE]")) {
          await completeOnboarding(updatedSession, newHistory);
          setPhase("complete");
        }
      }
    } catch {
      const errorMsg: Message = {
        id: generateId(),
        role: "assistant",
        content: "Sorry, I had a little hiccup there. Could you try saying that again?",
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    }

    setThinking(false);
  }, [thinking, uploading, input, conversationHistory, sessionData, userName]);

  /* ── File Upload ─────────────────────────────────────── */

  async function handleFileUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setShowUploadMenu(false);
    setUploading(true);

    const file = files[0];
    const uploadType = uploadTypeRef.current;

    // Show upload message in chat
    const uploadMsg: Message = {
      id: generateId(),
      role: "user",
      content: `Uploading ${uploadType}: ${file.name}`,
      timestamp: Date.now(),
      attachments: [{ name: file.name, type: file.type }],
    };
    setMessages((prev) => [...prev, uploadMsg]);

    // Show processing message
    const processingMsg: Message = {
      id: generateId(),
      role: "system",
      content: `Reading your ${uploadType}... this may take a moment.`,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, processingMsg]);

    try {
      const formData = new FormData();
      let endpoint = "";
      let resultType = uploadType;

      if (uploadType === "menu") {
        formData.append("files", file);
        endpoint = "/api/onboarding/parse-menu";
      } else if (uploadType === "receipt") {
        formData.append("image", file);
        endpoint = "/api/receipts/scan";
      } else {
        formData.append("files", file);
        endpoint = "/api/onboarding/parse-spreadsheet";
      }

      const res = await fetch(endpoint, { method: "POST", body: formData });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Failed to read file");
      }

      const parsed = await res.json();

      // Remove processing message
      setMessages((prev) => prev.filter((m) => m.id !== processingMsg.id));

      // Send results to chat AI
      setUploading(false);
      await sendMessage(`I uploaded a ${uploadType}: ${file.name}`, {
        type: resultType,
        data: parsed,
      });
    } catch (err) {
      // Remove processing message
      setMessages((prev) => prev.filter((m) => m.id !== processingMsg.id));

      const errMsg: Message = {
        id: generateId(),
        role: "assistant",
        content: `I had trouble reading that file. ${err instanceof Error ? err.message : ""}. Could you try uploading it again, or just tell me the info manually?`,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, errMsg]);
      setUploading(false);
    }
  }

  function triggerUpload(type: "menu" | "receipt" | "spreadsheet") {
    uploadTypeRef.current = type;
    setShowUploadMenu(false);
    if (fileInputRef.current) {
      fileInputRef.current.accept = type === "spreadsheet"
        ? ".csv,.xlsx,.xls,.pdf"
        : "image/*,.pdf";
      fileInputRef.current.click();
    }
  }

  /* ── Save to Database ────────────────────────────────── */

  async function saveSession(data: SessionData, history: any[]) {
    if (savingRef.current) return;
    savingRef.current = true;

    try {
      await fetch("/api/onboarding/complete", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: token || undefined,
          sessionData: data,
          conversationHistory: history,
          progress: data.progress,
        }),
      });
    } catch (err) {
      console.error("Failed to save session:", err);
    } finally {
      savingRef.current = false;
    }
  }

  async function savePIN(pin: string) {
    try {
      // Always use the onboarding API for PIN — this doesn't clear the setup token
      // (the setup API would clear it, breaking subsequent token-based calls)
      await fetch("/api/onboarding/complete", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save-pin",
          pin,
          token: token || undefined,
        }),
      });
    } catch (err) {
      console.error("Failed to save PIN:", err);
    }
  }

  async function completeOnboarding(data: SessionData, history: any[]) {
    try {
      // Save suppliers
      if (data.suppliers.length > 0) {
        await fetch("/api/onboarding/suppliers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ suppliers: data.suppliers }),
        });
      }

      // Save menu items
      for (const item of data.menuItems) {
        await fetch("/api/menu-items", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: item.name, selling_price: item.selling_price }),
        });
      }

      // Save ingredients (only ones not already saved from receipt scanning)
      for (const ing of data.ingredients) {
        if (ing.name?.trim()) {
          await fetch("/api/ingredients", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: ing.name,
              unit: ing.package_unit || "each",
              package_size: ing.package_size || null,
              package_unit: ing.package_unit || null,
              package_price: ing.package_price || null,
              supplier: ing.supplier || "Other",
            }),
          });
        }
      }

      // Save cost targets
      if (data.targets) {
        await fetch("/api/settings", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            food_cost_target: data.targets.food_cost,
            food_cost_warning: data.targets.food_cost + 5,
            labor_cost_target: data.targets.labor_cost,
            rplh_target: 50,
            max_staff: 3,
            min_shift_hours: 4,
            employer_burden_rate: 12,
            business_hours: {
              "0": { open: "12:00", close: "17:00" },
              "1": null,
              "2": { open: "08:00", close: "18:00" },
              "3": { open: "08:00", close: "18:00" },
              "4": { open: "08:00", close: "18:00" },
              "5": { open: "08:00", close: "18:00" },
              "6": { open: "08:00", close: "18:00" },
            },
          }),
        });
      }

      // Mark onboarding complete
      await fetch("/api/onboarding/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: token || undefined,
          restaurantName: data.businessInfo?.name,
          ownerName: userName,
          restaurantType: data.businessInfo?.type,
          tenure: data.businessInfo?.tenure,
        }),
      });
    } catch (err) {
      console.error("Error completing onboarding:", err);
    }
  }

  /* ── Keyboard Handler ────────────────────────────────── */

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  function handleTextareaChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  }

  /* ── Render: Loading ─────────────────────────────────── */

  if (phase === "loading") {
    return (
      <div className="min-h-screen bg-porch-cream flex items-center justify-center">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-porch-brown flex items-center justify-center animate-pulse">
            <span className="text-white font-bold text-sm">AI</span>
          </div>
          <span className="text-porch-brown-light">Loading...</span>
        </div>
      </div>
    );
  }

  /* ── Render: Error ───────────────────────────────────── */

  if (phase === "error") {
    return (
      <div className="min-h-screen bg-porch-cream flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <div className="text-5xl mb-4">&#128279;</div>
          <h1 className="text-xl font-semibold text-porch-brown mb-2">Invalid Link</h1>
          <p className="text-porch-brown-light mb-6">{errorMsg}</p>
        </div>
      </div>
    );
  }

  /* ── Render: Checklist ───────────────────────────────── */

  if (phase === "checklist") {
    const requiredDone = CHECKLIST_REQUIRED.filter((i) => checkedItems.has(i.id)).length;
    const allRequiredDone = requiredDone === CHECKLIST_REQUIRED.length;

    return (
      <div className="min-h-screen bg-porch-cream">
        {/* Header */}
        <header className="bg-porch-brown text-white px-4 py-3">
          <div className="max-w-2xl mx-auto flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">
              <span className="text-white font-bold text-sm">AI</span>
            </div>
            <div>
              <h1 className="text-base font-semibold">Porch Manager</h1>
              <p className="text-xs text-white/70">Restaurant Setup</p>
            </div>
          </div>
        </header>

        <div className="max-w-2xl mx-auto p-4 pb-32">
          {/* Intro */}
          <div className="text-center mb-6 mt-4">
            <div className="text-4xl mb-3">&#128221;</div>
            <h2 className="text-2xl font-bold text-porch-brown mb-2">
              {userName ? `Hey ${userName}! ` : ""}Before We Get Started
            </h2>
            <p className="text-sm text-porch-brown-light max-w-md mx-auto">
              Our AI assistant will walk you through setting up your restaurant. Gather what you can from this checklist first &mdash; the more you have ready, the smoother it&apos;ll go.
            </p>
          </div>

          {/* Time estimate */}
          <div className="bg-porch-teal/10 rounded-xl p-4 mb-6 flex items-center gap-3">
            <span className="text-2xl">&#9201;</span>
            <div>
              <p className="text-sm font-medium text-porch-brown">About 10-15 minutes</p>
              <p className="text-xs text-porch-brown-light">Your progress saves automatically &mdash; you can pause and come back anytime</p>
            </div>
          </div>

          {/* Required */}
          <div className="mb-6">
            <h3 className="text-xs font-semibold text-porch-brown uppercase tracking-wide mb-3 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-status-danger" />
              You&apos;ll Need These
            </h3>
            <div className="space-y-2">
              {CHECKLIST_REQUIRED.map((item) => (
                <ChecklistCard
                  key={item.id}
                  item={item}
                  checked={checkedItems.has(item.id)}
                  onToggle={() => {
                    setCheckedItems((prev) => {
                      const next = new Set(prev);
                      next.has(item.id) ? next.delete(item.id) : next.add(item.id);
                      return next;
                    });
                  }}
                />
              ))}
            </div>
          </div>

          {/* Optional */}
          <div className="mb-6">
            <h3 className="text-xs font-semibold text-porch-brown uppercase tracking-wide mb-3 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-status-gray" />
              Helpful If You Have It
            </h3>
            <div className="space-y-2">
              {CHECKLIST_OPTIONAL.map((item) => (
                <ChecklistCard
                  key={item.id}
                  item={item}
                  checked={checkedItems.has(item.id)}
                  onToggle={() => {
                    setCheckedItems((prev) => {
                      const next = new Set(prev);
                      next.has(item.id) ? next.delete(item.id) : next.add(item.id);
                      return next;
                    });
                  }}
                />
              ))}
            </div>
          </div>

          {/* Pro tip */}
          <div className="bg-amber-50 rounded-xl p-4 mb-6 flex items-start gap-3">
            <span className="text-xl mt-0.5">&#128161;</span>
            <div>
              <p className="text-sm font-medium text-amber-900">Pro tip</p>
              <p className="text-xs text-amber-800">
                You can upload photos of your menu and receipts directly in the chat &mdash; our AI will read them automatically. So snap some pictures before you start!
              </p>
            </div>
          </div>
        </div>

        {/* Fixed bottom */}
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-porch-cream-dark px-4 py-4">
          <div className="max-w-2xl mx-auto">
            {!allRequiredDone && (
              <p className="text-center text-xs text-porch-brown-light mb-2">
                Check off the required items when you have them ready ({requiredDone}/{CHECKLIST_REQUIRED.length})
              </p>
            )}
            <button
              onClick={startChat}
              className={`w-full py-3.5 rounded-xl text-lg font-medium transition-all ${
                allRequiredDone
                  ? "bg-porch-teal text-white hover:bg-porch-teal-light shadow-lg"
                  : "bg-porch-cream text-porch-brown-light"
              }`}
            >
              {allRequiredDone ? "I'm Ready \u2014 Let's Go!" : `Check off required items (${requiredDone}/${CHECKLIST_REQUIRED.length})`}
            </button>
            {!allRequiredDone && (
              <button
                onClick={startChat}
                className="w-full mt-2 text-sm text-porch-brown-light hover:text-porch-brown py-2"
              >
                Skip checklist and start anyway
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  /* ── Render: Complete ────────────────────────────────── */

  if (phase === "complete") {
    return (
      <div className="min-h-screen bg-porch-cream flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center">
          <div className="text-5xl mb-4">&#127881;</div>
          <h1 className="text-2xl font-bold text-porch-brown mb-2">You&apos;re All Set!</h1>
          <p className="text-sm text-porch-brown-light mb-6">
            Your restaurant is fully configured and ready to go.
          </p>

          <div className="grid grid-cols-3 gap-3 mb-6">
            <div className="bg-white rounded-lg p-3 shadow-sm">
              <div className="text-2xl font-bold text-porch-teal">{sessionData.suppliers.length}</div>
              <div className="text-xs text-porch-brown-light">Suppliers</div>
            </div>
            <div className="bg-white rounded-lg p-3 shadow-sm">
              <div className="text-2xl font-bold text-porch-teal">{sessionData.ingredients.length}</div>
              <div className="text-xs text-porch-brown-light">Ingredients</div>
            </div>
            <div className="bg-white rounded-lg p-3 shadow-sm">
              <div className="text-2xl font-bold text-porch-teal">{sessionData.menuItems.length}</div>
              <div className="text-xs text-porch-brown-light">Menu Items</div>
            </div>
          </div>

          {sessionData.targets && (
            <div className="bg-white rounded-lg p-3 shadow-sm mb-6 text-sm text-porch-brown-light">
              Food cost target: <strong className="text-porch-brown">{sessionData.targets.food_cost}%</strong> &nbsp;|&nbsp;
              Labor target: <strong className="text-porch-brown">{sessionData.targets.labor_cost}%</strong>
            </div>
          )}

          <button
            onClick={() => router.push("/login")}
            className="w-full bg-porch-brown text-white py-3 rounded-xl font-semibold hover:bg-porch-brown-light transition-colors text-base"
          >
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  /* ── Render: Chat ────────────────────────────────────── */

  return (
    <div className="flex flex-col h-dvh bg-porch-cream">
      {/* Header */}
      <header className="bg-porch-brown text-white px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">
            <span className="text-white font-bold text-sm">AI</span>
          </div>
          <div>
            <h1 className="text-base font-semibold">Porch Manager</h1>
            <p className="text-xs text-white/70">Restaurant Setup</p>
          </div>
        </div>
        {/* Stats pill */}
        <div className="flex items-center gap-2 text-xs text-white/60">
          {sessionData.menuItems.length > 0 && <span>{sessionData.menuItems.length} items</span>}
          {sessionData.ingredients.length > 0 && <span>{sessionData.ingredients.length} ingredients</span>}
        </div>
      </header>

      {/* Progress bar */}
      <div className="bg-white border-b border-porch-cream-dark px-4 py-2">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-porch-brown-light">Setup Progress</span>
            <span className="text-xs font-semibold text-porch-teal">{sessionData.progress}%</span>
          </div>
          <div className="w-full bg-porch-cream-dark rounded-full h-2">
            <div
              className="bg-porch-teal h-2 rounded-full transition-all duration-500"
              style={{ width: `${sessionData.progress}%` }}
            />
          </div>
          <div className="flex justify-between mt-1 text-[10px] text-porch-brown-light">
            <span className={sessionData.progress >= 10 ? "text-porch-teal font-medium" : ""}>Info</span>
            <span className={sessionData.progress >= 20 ? "text-porch-teal font-medium" : ""}>Suppliers</span>
            <span className={sessionData.progress >= 40 ? "text-porch-teal font-medium" : ""}>Menu</span>
            <span className={sessionData.progress >= 60 ? "text-porch-teal font-medium" : ""}>Costs</span>
            <span className={sessionData.progress >= 85 ? "text-porch-teal font-medium" : ""}>Targets</span>
            <span className={sessionData.progress >= 95 ? "text-porch-teal font-medium" : ""}>PIN</span>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="max-w-2xl mx-auto">
          {messages.map((msg) => (
            <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : msg.role === "system" ? "justify-center" : "justify-start"} mb-4`}>
              {msg.role === "system" ? (
                <div className="flex items-center gap-2 bg-porch-cream rounded-lg px-3 py-2 text-xs text-porch-brown-light">
                  <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-porch-teal" />
                  {msg.content}
                </div>
              ) : (
                <div
                  className={`max-w-[85%] sm:max-w-[75%] rounded-2xl px-4 py-3 ${
                    msg.role === "user"
                      ? "bg-porch-teal text-white rounded-tr-sm"
                      : "bg-white text-porch-brown rounded-tl-sm shadow-sm"
                  }`}
                >
                  {msg.role === "assistant" && (
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-5 h-5 rounded-full bg-porch-brown flex items-center justify-center">
                        <span className="text-white text-[9px] font-bold">AI</span>
                      </div>
                      <span className="text-[10px] font-medium text-porch-brown-light">Porch AI</span>
                    </div>
                  )}
                  <div className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</div>
                  {msg.attachments && msg.attachments.length > 0 && (
                    <div className="mt-2">
                      {msg.attachments.map((a, i) => (
                        <div key={i} className={`flex items-center gap-1 text-xs px-2 py-1 rounded ${msg.role === "user" ? "bg-porch-teal-light/30" : "bg-porch-cream"}`}>
                          &#128206; {a.name}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}

          {/* Typing indicator */}
          {thinking && (
            <div className="flex justify-start mb-4">
              <div className="bg-white rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 bg-porch-brown-light rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                  <div className="w-2 h-2 bg-porch-brown-light rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                  <div className="w-2 h-2 bg-porch-brown-light rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input area */}
      <div className="border-t border-porch-cream-dark bg-white px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-end gap-2">
          {/* Upload button */}
          <div className="relative">
            <button
              onClick={() => setShowUploadMenu(!showUploadMenu)}
              disabled={thinking || uploading}
              className="flex items-center justify-center w-10 h-10 rounded-full bg-porch-cream hover:bg-porch-cream-dark transition-colors disabled:opacity-50"
            >
              &#128206;
            </button>

            {showUploadMenu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowUploadMenu(false)} />
                <div className="absolute bottom-12 left-0 z-20 bg-white rounded-lg shadow-lg border border-porch-cream-dark py-1 min-w-[200px]">
                  <button onClick={() => triggerUpload("menu")} className="w-full text-left px-4 py-2.5 text-sm hover:bg-porch-cream flex items-center gap-2">
                    &#127860; Upload Menu
                  </button>
                  <button onClick={() => triggerUpload("receipt")} className="w-full text-left px-4 py-2.5 text-sm hover:bg-porch-cream flex items-center gap-2">
                    &#129534; Upload Receipt / Invoice
                  </button>
                  <button onClick={() => triggerUpload("spreadsheet")} className="w-full text-left px-4 py-2.5 text-sm hover:bg-porch-cream flex items-center gap-2">
                    &#128202; Upload Spreadsheet / P&amp;L
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Text input */}
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleTextareaChange}
            onKeyDown={handleKeyDown}
            disabled={thinking || uploading}
            placeholder={thinking ? "Thinking..." : "Type your answer..."}
            rows={1}
            className="flex-1 resize-none rounded-2xl border border-porch-cream-dark px-4 py-2.5 text-sm bg-porch-warm-white text-porch-brown focus:outline-none focus:border-porch-teal focus:ring-1 focus:ring-porch-teal disabled:bg-porch-cream disabled:text-porch-brown-light"
          />

          {/* Send button */}
          <button
            onClick={() => sendMessage()}
            disabled={thinking || uploading || !input.trim()}
            className="flex items-center justify-center w-10 h-10 rounded-full bg-porch-teal hover:bg-porch-teal-light transition-colors disabled:bg-porch-cream-dark disabled:cursor-not-allowed"
          >
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14m-7-7l7 7-7 7" />
            </svg>
          </button>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept="image/*,.pdf"
          onChange={(e) => handleFileUpload(e.target.files)}
        />
      </div>
    </div>
  );
}

/* ── Checklist Card Component ──────────────────────────── */

function ChecklistCard({ item, checked, onToggle }: {
  item: { id: string; icon: string; label: string; desc: string };
  checked: boolean;
  onToggle: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={`bg-white rounded-xl border transition-all ${checked ? "border-status-good bg-green-50/50" : "border-porch-cream-dark"}`}>
      <div className="flex items-center gap-3 px-4 py-3">
        <button
          onClick={onToggle}
          className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center flex-shrink-0 transition-all ${
            checked ? "bg-status-good border-status-good text-white" : "border-porch-cream-dark hover:border-porch-teal"
          }`}
        >
          {checked && (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          )}
        </button>
        <span className="text-lg">{item.icon}</span>
        <span className={`flex-1 text-sm font-medium ${checked ? "text-green-800" : "text-porch-brown"}`}>{item.label}</span>
        <button onClick={() => setExpanded(!expanded)} className="text-porch-brown-light hover:text-porch-brown p-1">
          <svg className={`w-4 h-4 transition-transform ${expanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>
      {expanded && (
        <div className="px-4 pb-3 pl-16">
          <p className="text-xs text-porch-brown-light leading-relaxed">{item.desc}</p>
        </div>
      )}
    </div>
  );
}

/* ── Page Export ────────────────────────────────────────── */

export default function OnboardingPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-porch-cream flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-porch-brown" />
      </div>
    }>
      <OnboardingChat />
    </Suspense>
  );
}
