"use client";

import { useState, useEffect, useRef, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { usePlaidLink } from "react-plaid-link";
import SupplierPicker from "@/components/SupplierPicker";

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
  categories: { name: string; items: string[] }[];
  businessHours: Record<string, { open: string; close: string } | null> | null;
  squareConnected: boolean;
  bankConnected: boolean;
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
  categories: [],
  businessHours: null,
  squareConnected: false,
  bankConnected: false,
};

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

/* ── Checklist Items ───────────────────────────────────── */

const CHECKLIST_REQUIRED = [
  { id: "menu", icon: "\uD83C\uDF7D\uFE0F", label: "Menu with prices", desc: "A printed menu, PDF, or photo. Or be ready to list your items and prices." },
  { id: "recipes", icon: "\uD83D\uDCCB", label: "Recipes for every menu item", desc: "We need to know what goes into each item you sell. For example: a Latte = 9oz milk + 20g coffee beans + 0.75oz vanilla syrup. Even coffee drinks, sauces, and blends need recipes so we can calculate your true cost per item." },
  { id: "bank", icon: "\uD83C\uDFE6", label: "Bank login info", desc: "We\u2019ll connect your bank account to automatically find your suppliers, track expenses, and monitor income. We analyze your transactions to identify where you\u2019re buying from \u2014 then we\u2019ll ask you to confirm. Have your online banking login ready." },
];

const CHECKLIST_OPTIONAL = [
  { id: "receipts", icon: "\uD83E\uDDFE", label: "Receipts or invoices from suppliers", desc: "We\u2019ll search online for prices first (Walmart, Costco, etc.). For suppliers where we can\u2019t find prices online, we\u2019ll let you know which ones need a receipt or invoice." },
  { id: "spreadsheet", icon: "\uD83D\uDCCA", label: "Cost spreadsheet or P&L", desc: "If you track costs in a spreadsheet, have it ready to upload. CSV, Excel, or PDF." },
  { id: "inventory", icon: "\uD83D\uDCE6", label: "Current inventory counts", desc: "A rough count of what you have on hand right now (cases of chicken, gallons of milk, etc.). This helps us build accurate shopping lists from day one." },
  { id: "tax", icon: "\uD83D\uDCB0", label: "Your state & sales tax rate", desc: "Know what state you're in and your sales tax percentage. This lets us track how much tax you're collecting and when it's due." },
];

/* ── Data Tag Parsing ──────────────────────────────────── */

function parseDataTags(text: string, session: SessionData): { cleanText: string; updatedSession: SessionData; email?: string } {
  const updated = { ...session };
  let email: string | undefined;

  // Progress
  const progressMatch = text.match(/\[PROGRESS:(\d+)\]/);
  if (progressMatch) {
    updated.progress = parseInt(progressMatch[1]);
  }

  // Email
  const emailMatch = text.match(/\[SET_EMAIL:"([^"]+)"\]/);
  if (emailMatch) {
    email = emailMatch[1];
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

  // Categories
  const catMatch = text.match(/\[SET_CATEGORIES:(\[[\s\S]*?\])\]/);
  if (catMatch) {
    try {
      const cats = JSON.parse(catMatch[1]);
      updated.categories = cats.map((c: any) => ({
        name: c.name || "Uncategorized",
        items: c.items || [],
      }));
    } catch { /* ignore */ }
  }

  // Business hours
  const hoursMatch = text.match(/\[SET_HOURS:(\{[\s\S]*?\})\]/);
  if (hoursMatch) {
    try {
      updated.businessHours = JSON.parse(hoursMatch[1]);
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
    .replace(/\[SET_EMAIL:"[^"]*"\]/g, "")
    .replace(/\[BUSINESS_INFO:\{.*?\}]/g, "")
    .replace(/\[ADD_SUPPLIERS:\[.*?\]]/g, "")
    .replace(/\[SHOW_SUPPLIER_PICKER\]/g, "")
    .replace(/\[SHOW_SQUARE_CONNECT\]/g, "")
    .replace(/\[SHOW_BANK_CONNECT\]/g, "")
    .replace(/\[ADD_MENU_ITEMS:\[[\s\S]*?\]]/g, "")
    .replace(/\[ADD_INGREDIENTS:\[[\s\S]*?\]]/g, "")
    .replace(/\[SET_CATEGORIES:\[[\s\S]*?\]]/g, "")
    .replace(/\[SET_HOURS:\{[\s\S]*?\}]/g, "")
    .replace(/\[SET_TARGETS:\{.*?\}]/g, "")
    .replace(/\[SET_PIN:"?\d{4,6}"?]/g, "")
    .replace(/\[ONBOARDING_COMPLETE]/g, "")
    .replace(/\[EXPENSES:\[[\s\S]*?\]]/g, "")
    .trim();

  return { cleanText, updatedSession: updated, email };
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

  // Anonymous / frictionless onboarding state
  const [tempSessionId, setTempSessionId] = useState("");
  const [autoLoginToken, setAutoLoginToken] = useState("");
  const [isAnonymous, setIsAnonymous] = useState(false);

  // UI state
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [showUploadMenu, setShowUploadMenu] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [showResumeLogin, setShowResumeLogin] = useState(false);
  const [resumeEmail, setResumeEmail] = useState("");
  const [resumeLoading, setResumeLoading] = useState(false);
  const [resumeError, setResumeError] = useState("");

  // Inline component state (supplier picker, square connect, bank connect)
  const [showSupplierPicker, setShowSupplierPicker] = useState(false);
  const [showSquareConnect, setShowSquareConnect] = useState(false);
  const [showBankConnect, setShowBankConnect] = useState(false);
  const [supplierPickerMsgId, setSupplierPickerMsgId] = useState("");
  const [squareConnectMsgId, setSquareConnectMsgId] = useState("");
  const [bankConnectMsgId, setBankConnectMsgId] = useState("");
  const [plaidLinkToken, setPlaidLinkToken] = useState<string | null>(null);
  const [bankConnecting, setBankConnecting] = useState(false);

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
      // Check for existing temp session in localStorage (anonymous returning user)
      const storedTempId = typeof window !== "undefined" ? localStorage.getItem("onboarding_temp_session") : null;

      // Both flows (token and logged-in) use the same GET endpoint
      let url = token
        ? `/api/onboarding/complete?token=${token}`
        : "/api/onboarding/complete";

      // If we have a stored temp session, try to load it
      if (storedTempId && !token) {
        url = `/api/onboarding/complete?tempSessionId=${storedTempId}`;
      }

      const res = await fetch(url);

      if (!res.ok) {
        if (token) {
          setErrorMsg("This setup link is invalid or has expired. Ask your manager for a new one.");
          setPhase("error");
          return;
        }
        // Not logged in and no token — start as anonymous
        startAnonymousSession(storedTempId);
        setPhase("checklist");
        return;
      }

      const data = await res.json();
      setUserName(data.userName || "");
      setUserId(data.userId || "");

      if (data.conversationHistory?.length > 0) {
        // Returning user — restore session and go straight to chat
        if (storedTempId && !data.userId) {
          setTempSessionId(storedTempId);
          setIsAnonymous(true);
        }
        restoreSession(data);
        setPhase("chat");
        return;
      }

      // If no userId from server (not logged in), set up anonymous
      if (!data.userId) {
        startAnonymousSession(storedTempId);
      }

      setPhase("checklist");
    } catch {
      startAnonymousSession(null);
      setPhase("checklist");
    }
  }

  function startAnonymousSession(existingId: string | null) {
    const id = existingId || `anon_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
    setTempSessionId(id);
    setIsAnonymous(true);
    if (typeof window !== "undefined") {
      localStorage.setItem("onboarding_temp_session", id);
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
        content: `Hey${userName ? ` ${userName}` : ""}! I'm your Personal Onboarding Manager, and I'm here to help you get your restaurant all set up. This takes about 10-15 minutes, and I'll walk you through everything step by step.\n\nLet's start with the basics \u2014 what's the name of your restaurant?`,
        timestamp: Date.now(),
      };
      setMessages([fallbackMsg]);
    }

    setThinking(false);
  }

  /* ── Send Message ────────────────────────────────────── */

  const sendMessage = useCallback(async (text?: string, fileResults?: any) => {
    // Allow file results to come through even when thinking (background uploads)
    if ((thinking || uploading) && !fileResults) return;
    const userText = text || input.trim();
    if (!userText && !fileResults) return;

    // Add user message to chat (hide [SYSTEM: ...] messages from the user)
    const isSystemInstruction = userText?.startsWith("[SYSTEM");
    if (userText && !fileResults && !isSystemInstruction) {
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
        const { cleanText, updatedSession, email } = parseDataTags(data.reply, sessionData);

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

        // Check for inline component triggers
        if (data.reply.includes("[SHOW_SUPPLIER_PICKER]")) {
          setShowSupplierPicker(true);
          setSupplierPickerMsgId(aiMsg.id);
        }
        if (data.reply.includes("[SHOW_SQUARE_CONNECT]")) {
          setShowSquareConnect(true);
          setSquareConnectMsgId(aiMsg.id);
        }
        if (data.reply.includes("[SHOW_BANK_CONNECT]")) {
          setShowBankConnect(true);
          setBankConnectMsgId(aiMsg.id);
        }

        // Save session to database
        saveSession(updatedSession, newHistory);

        // Handle email — silently create account
        if (email && isAnonymous) {
          createAccountSilently(email);
        }

        // Handle PIN
        if (updatedSession.pinSet && updatedSession.pinValue) {
          savePIN(updatedSession.pinValue);
        }

        // Handle completion
        if (data.reply.includes("[ONBOARDING_COMPLETE]")) {
          await completeOnboarding(updatedSession, newHistory);
          // Auto-login if we have a token, otherwise redirect
          if (autoLoginToken) {
            const result = await signIn("onboarding-token", {
              token: autoLoginToken,
              redirect: false,
            });
            if (result?.ok) {
              // Clean up localStorage
              if (typeof window !== "undefined") {
                localStorage.removeItem("onboarding_temp_session");
              }
              router.push("/launch-pad");
            } else {
              // Token login failed — fall back to login page
              setPhase("complete");
            }
          } else {
            // User was already logged in, or no token available
            router.push("/launch-pad");
          }
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thinking, uploading, input, conversationHistory, sessionData, userName, isAnonymous, autoLoginToken, userId, tempSessionId]);

  /* ── File Upload ─────────────────────────────────────── */

  async function handleFileUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setShowUploadMenu(false);

    const file = files[0];
    const uploadType = uploadTypeRef.current;

    // Show upload message in chat immediately
    const uploadMsg: Message = {
      id: generateId(),
      role: "user",
      content: `Uploading ${uploadType}: ${file.name}`,
      timestamp: Date.now(),
      attachments: [{ name: file.name, type: file.type }],
    };
    setMessages((prev) => [...prev, uploadMsg]);

    // Tell the AI right away so it can keep the conversation moving
    sendMessage(`I just uploaded a ${uploadType}: ${file.name}. It's being processed now — keep going with the next questions while it loads.`);

    // Process the file in the background (don't block the chat)
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

    // Fire off the upload in the background
    fetch(endpoint, { method: "POST", body: formData })
      .then(async (res) => {
        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.error || "Failed to read file");
        }
        return res.json();
      })
      .then((parsed) => {
        // File is done processing — send results to the AI
        sendMessage(`[SYSTEM] The ${uploadType} file "${file.name}" has been processed. Here are the results:`, {
          type: resultType,
          data: parsed,
        });
      })
      .catch((err) => {
        const errMsg: Message = {
          id: generateId(),
          role: "assistant",
          content: `I had trouble reading that file. ${err instanceof Error ? err.message : ""}. Could you try uploading it again, or just tell me the info manually?`,
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, errMsg]);
      });
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
          userId: userId || undefined,
          tempSessionId: isAnonymous ? tempSessionId : undefined,
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

  async function createAccountSilently(email: string) {
    try {
      const res = await fetch("/api/onboarding/create-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          name: userName || sessionData.businessInfo?.name || "",
          tempSessionId: tempSessionId || undefined,
        }),
      });

      const data = await res.json();

      if (data.status === "created" || data.status === "exists_incomplete") {
        setUserId(data.userId);
        setIsAnonymous(false);
        if (typeof window !== "undefined") {
          localStorage.removeItem("onboarding_temp_session");
        }

        // Sign in immediately so Plaid and other authenticated routes work during onboarding
        if (data.autoLoginToken) {
          setAutoLoginToken(data.autoLoginToken);
          try {
            await signIn("onboarding-token", {
              token: data.autoLoginToken,
              redirect: false,
            });
          } catch {
            // Sign-in may fail silently — onboarding can still continue with userId
            console.log("Auto sign-in deferred");
          }
        }
      }
    } catch (err) {
      console.error("Silent account creation failed:", err);
    }
  }

  async function handleResumeLogin(e: React.FormEvent) {
    e.preventDefault();
    setResumeLoading(true);
    setResumeError("");

    try {
      // Use the same create-account endpoint — it handles existing users
      const res = await fetch("/api/onboarding/create-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: resumeEmail.trim().toLowerCase() }),
      });

      const data = await res.json();

      if (!res.ok || data.error) {
        setResumeError(data.error || "Could not find that account. Try starting fresh below!");
        return;
      }

      if (data.userId && data.autoLoginToken) {
        setUserId(data.userId);
        setIsAnonymous(false);
        setAutoLoginToken(data.autoLoginToken);

        // Sign in
        try {
          await signIn("onboarding-token", {
            token: data.autoLoginToken,
            redirect: false,
          });
        } catch {
          console.log("Sign-in deferred during resume");
        }

        // Load saved session data
        let resumeContext = "";
        let loadedSession: any = null;
        try {
          const sessionRes = await fetch("/api/onboarding/load-session", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId: data.userId }),
          });
          const sessionResult = await sessionRes.json();
          loadedSession = sessionResult.session;

          if (loadedSession) {
            const s = loadedSession;

            // Restore session data into state
            if (s.businessInfo) {
              setSessionData((prev) => ({ ...prev, businessInfo: s.businessInfo }));
            }
            if (s.userName) setUserName(s.userName);
            if (s.menuItems?.length) {
              setSessionData((prev) => ({ ...prev, menuItems: s.menuItems }));
            }
            if (s.suppliers?.length) {
              setSessionData((prev) => ({ ...prev, suppliers: s.suppliers }));
            }
            if (s.ingredients?.length) {
              setSessionData((prev) => ({ ...prev, ingredients: s.ingredients }));
            }
            if (s.categories?.length) {
              setSessionData((prev) => ({ ...prev, categories: s.categories }));
            }
            if (s.businessHours) {
              setSessionData((prev) => ({ ...prev, businessHours: s.businessHours }));
            }
            if (s.targets) {
              setSessionData((prev) => ({ ...prev, targets: s.targets }));
            }
            if (s.progress) {
              setSessionData((prev) => ({ ...prev, progress: s.progress }));
            }
            if (s.conversationHistory?.length) {
              setConversationHistory(s.conversationHistory);
            }

            // Build context summary for the AI
            const parts: string[] = [];
            if (s.businessInfo?.name) parts.push(`Restaurant: ${s.businessInfo.name} (${s.businessInfo.type || "unknown type"})`);
            if (s.squareConnected) parts.push("Square POS: Connected");
            if (s.menuItems?.length) parts.push(`Menu items: ${s.menuItems.length} collected`);
            if (s.categories?.length) parts.push(`Categories: ${s.categories.length} set`);
            if (s.bankConnected) parts.push("Bank: Connected via Plaid");
            if (s.suppliers?.length) parts.push(`Suppliers: ${s.suppliers.join(", ")}`);
            if (s.ingredients?.length) parts.push(`Ingredients: ${s.ingredients.length} collected`);
            if (s.businessHours) parts.push("Business hours: Set");
            if (s.targets) parts.push(`Targets: Food ${s.targets.food_cost}%, Labor ${s.targets.labor_cost}%`);
            if (s.progress) parts.push(`Progress: ${s.progress}%`);

            resumeContext = parts.length > 0
              ? `Here's what's already done:\n${parts.join("\n")}\n\nPick up from the NEXT step that hasn't been completed yet.`
              : "This user started but hasn't completed much yet. Start from the beginning.";
          }
        } catch {
          resumeContext = "Could not load previous progress. Ask the user where they'd like to pick up.";
        }

        // Go straight to chat phase
        setPhase("chat");
        setShowResumeLogin(false);

        // Directly call the chat API with the LOADED conversation history
        // (we can't use sendMessage because React state hasn't updated yet,
        //  so it would send an empty conversation history and the AI would
        //  have no memory of the previous chat)
        const resumeSystemMsg = `[SYSTEM: This user is returning to continue onboarding. ${resumeContext} Greet them by name, briefly summarize what's done, and continue with the NEXT incomplete step. IMPORTANT: You MUST use the data tags to show interactive elements. If Square isn't connected, include [SHOW_SQUARE_CONNECT] in your response. If bank isn't connected, include [SHOW_BANK_CONNECT]. Always use the tags — the user needs the buttons to connect, they can't do it any other way.]`;

        // Build the session data we just loaded (can't rely on React state yet)
        const loadedSessionData = {
          businessInfo: loadedSession?.businessInfo || null,
          suppliers: loadedSession?.suppliers || [],
          menuItems: loadedSession?.menuItems || [],
          ingredients: loadedSession?.ingredients || [],
          targets: loadedSession?.targets || null,
          pinSet: false,
          pinValue: "",
          progress: loadedSession?.progress || 0,
          categories: loadedSession?.categories || [],
          businessHours: loadedSession?.businessHours || null,
          squareConnected: loadedSession?.squareConnected || false,
          bankConnected: loadedSession?.bankConnected || false,
        };

        // Use the loaded conversation history directly (not the empty state)
        const loadedHistory = loadedSession?.conversationHistory || [];

        try {
          setThinking(true);
          const chatRes = await fetch("/api/onboarding/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              message: resumeSystemMsg,
              conversationHistory: loadedHistory,
              sessionData: loadedSessionData,
              userName: loadedSession?.userName || data.userName || "",
            }),
          });
          const chatData = await chatRes.json();
          if (chatData.reply) {
            const { cleanText, updatedSession } = parseDataTags(chatData.reply, loadedSessionData);
            const aiMsg: Message = {
              id: generateId(),
              role: "assistant",
              content: cleanText,
              timestamp: Date.now(),
            };
            setMessages((prev) => [...prev, aiMsg]);

            const updatedHistory = [...loadedHistory, { role: "user", content: resumeSystemMsg }, { role: "assistant", content: chatData.reply }];
            setConversationHistory(updatedHistory);
            setSessionData(updatedSession);

            // Trigger inline components if the AI included them
            if (chatData.reply.includes("[SHOW_SQUARE_CONNECT]")) {
              setShowSquareConnect(true);
              setSquareConnectMsgId(aiMsg.id);
            }
            if (chatData.reply.includes("[SHOW_BANK_CONNECT]")) {
              setShowBankConnect(true);
              setBankConnectMsgId(aiMsg.id);
            }
            if (chatData.reply.includes("[SHOW_SUPPLIER_PICKER]")) {
              setShowSupplierPicker(true);
              setSupplierPickerMsgId(aiMsg.id);
            }
          }
          setThinking(false);
        } catch {
          setThinking(false);
          const fallbackMsg: Message = {
            id: generateId(),
            role: "assistant",
            content: `Welcome back! Let's pick up where we left off. What would you like to work on next?`,
            timestamp: Date.now(),
          };
          setMessages((prev) => [...prev, fallbackMsg]);
        }
      } else {
        setResumeError("We couldn't find an account with that email. Try starting fresh below!");
      }
    } catch (err) {
      console.error("Resume login error:", err);
      setResumeError("Something went wrong. Please try again.");
    } finally {
      setResumeLoading(false);
    }
  }

  async function savePIN(pin: string) {
    try {
      await fetch("/api/onboarding/complete", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save-pin",
          pin,
          token: token || undefined,
          userId: userId || undefined,
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

      // Save menu categories and assign items
      if (data.categories.length > 0) {
        for (let i = 0; i < data.categories.length; i++) {
          const cat = data.categories[i];
          try {
            const catRes = await fetch("/api/menu-categories", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ name: cat.name, sort_order: i + 1 }),
            });
            if (catRes.ok) {
              const catData = await catRes.json();
              const categoryId = catData.id || catData.category?.id;
              if (categoryId && cat.items) {
                for (const itemName of cat.items) {
                  await fetch("/api/menu-items/assign-category", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ itemName, categoryId }),
                  });
                }
              }
            }
          } catch (err) {
            console.error("Error saving category:", err);
          }
        }
      }

      // Save cost targets and business hours
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
            business_hours: data.businessHours || {
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

      // Link Square token to this restaurant (if they connected Square during onboarding)
      try {
        await fetch("/api/square/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ days: 30 }),
        });
      } catch {
        // Square sync is optional — don't block completion
      }

      // Mark onboarding complete
      await fetch("/api/onboarding/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: token || undefined,
          userId: userId || undefined,
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

  /* ── Supplier Picker Handler ─────────────────────────── */

  async function handleSupplierConfirm(suppliers: string[]) {
    setShowSupplierPicker(false);
    // Send supplier names back to the AI as a user message
    sendMessage(`I selected these suppliers: ${suppliers.join(", ")}`);

    // Check which suppliers have public prices — then feed results back to the AI
    try {
      const res = await fetch("/api/supplier-prices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ suppliers }),
      });
      if (res.ok) {
        const data = await res.json();
        const results = data.results || {};
        const autoFetchable: string[] = [];
        const needReceipts: string[] = [];
        for (const [name, info] of Object.entries(results)) {
          if ((info as any).autoFetchable) {
            autoFetchable.push(name);
          } else {
            needReceipts.push(name);
          }
        }
        // Feed the results into the conversation so the AI knows which suppliers need receipts
        const resultMsg = autoFetchable.length > 0 || needReceipts.length > 0
          ? `[SYSTEM: Supplier price check complete. Suppliers with prices available online: ${autoFetchable.length > 0 ? autoFetchable.join(", ") : "none"}. Suppliers that need receipts (prices not publicly available): ${needReceipts.length > 0 ? needReceipts.join(", ") : "none"}. Tell the user these results so they know which suppliers need receipts.]`
          : "";
        if (resultMsg) {
          // Small delay to let the first message process
          await new Promise((r) => setTimeout(r, 2000));
          sendMessage(resultMsg);
        }
      }
    } catch { /* non-critical */ }
  }

  /* ── Square Connect Handlers ───────────────────────── */

  function handleSquareConnect() {
    setShowSquareConnect(false);
    // Open Square OAuth in a popup — the postMessage listener handles the rest
    window.open("/api/square/oauth/authorize", "_blank", "width=600,height=700");
  }

  function handleSquareSkip() {
    setShowSquareConnect(false);
    sendMessage("I'll skip Square for now.");
  }

  // Listen for Square OAuth popup to send back a success/error message
  useEffect(() => {
    function handleSquareMessage(event: MessageEvent) {
      if (event.data?.type === "square-oauth") {
        if (event.data.status === "success") {
          // Mark Square as connected in session data so the AI knows
          setSessionData((prev) => ({ ...prev, squareConnected: true }));

          // After Square connects, try to sync data (business hours, location, sales)
          // This makes the AI smarter — it won't need to ask for info Square already has
          (async () => {
            let squareContext = "The user just connected their Square POS successfully.";
            try {
              const syncRes = await fetch("/api/square/sync", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ days: 30 }),
              });
              if (syncRes.ok) {
                const syncData = await syncRes.json();
                if (syncData.synced) {
                  const parts = [];
                  if (syncData.synced.orders > 0) parts.push(`${syncData.synced.orders} orders synced from Square`);
                  if (syncData.synced.labor > 0) parts.push(`${syncData.synced.labor} timecards synced`);
                  if (syncData.synced.location === "synced") parts.push("Business hours and location info pulled from Square automatically");
                  if (parts.length > 0) squareContext += ` We also pulled data from their Square account: ${parts.join(", ")}.`;
                  if (syncData.synced.location === "synced") {
                    squareContext += " IMPORTANT: Business hours have been auto-filled from Square — do NOT ask for business hours again, just confirm them or skip that step.";
                  }
                }
              }
            } catch {
              // Sync failed — that's OK, we'll still acknowledge the connection
            }
            sendMessage(`[SYSTEM] ${squareContext} Acknowledge the connection and move on to the next step.`);
          })();
        }
      }
    }
    window.addEventListener("message", handleSquareMessage);
    return () => window.removeEventListener("message", handleSquareMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Bank Connect Handlers ──────────────────────────── */

  const [bankConnectError, setBankConnectError] = useState("");

  async function handleBankConnect() {
    setBankConnecting(true);
    setBankConnectError("");
    try {
      const res = await fetch("/api/plaid/create-link-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      if (!res.ok) throw new Error("Failed to create link token");
      const data = await res.json();
      setPlaidLinkToken(data.link_token);
    } catch {
      // Don't hide the card — show the error ON the card so the user can retry
      setBankConnecting(false);
      setBankConnectError("Having trouble connecting. Try again, or skip and connect later from your Launch Pad.");
    }
  }

  async function handleBankConnectSuccess(publicToken: string, metadata: { institution?: { name?: string; institution_id?: string } }) {
    // Mark bank as connected in session data so the AI knows
    setSessionData((prev) => ({ ...prev, bankConnected: true }));

    try {
      // Exchange public token for access token
      const res = await fetch("/api/plaid/exchange-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          public_token: publicToken,
          institution: metadata.institution,
          userId,
        }),
      });
      if (!res.ok) throw new Error("Exchange failed");

      // Sync transactions
      await fetch("/api/plaid/sync-transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });

      // Fetch transactions and extract unique merchant/supplier names
      const accountsRes = await fetch(`/api/plaid/accounts${userId ? `?userId=${userId}` : ""}`);
      if (accountsRes.ok) {
        const accountsData = await accountsRes.json();
        const txns = accountsData.transactions || [];

        // Non-supplier categories to filter out (utilities, taxes, subscriptions, etc.)
        const NON_SUPPLIER_KEYWORDS = [
          "internal revenue", "irs", "dept revenue", "tax", "fpl", "electric", "utilities",
          "insurance", "progressive", "geico", "allstate", "state farm",
          "spectrum", "comcast", "att", "t-mobile", "verizon",
          "mortgage", "rent", "properties", "kia motors", "car payment", "loan",
          "apple", "google", "facebook", "meta", "adobe", "netflix", "hulu", "spotify",
          "amazon prime video", "adt", "security", "home shield",
          "square inc", "stripe", "paypal",
          "seaworld", "disney", "universal",
        ];

        // Extract unique merchant names from transactions (expenses only = positive amounts)
        const merchantCounts: Record<string, number> = {};
        for (const t of txns) {
          if (t.amount > 0) {
            const name = t.merchant_name || t.name;
            if (!name) continue;
            // Filter out non-supplier merchants
            const lower = name.toLowerCase();
            const isNonSupplier = NON_SUPPLIER_KEYWORDS.some(kw => lower.includes(kw));
            if (!isNonSupplier) {
              merchantCounts[name] = (merchantCounts[name] || 0) + 1;
            }
          }
        }

        // Sort by frequency (most transactions = most likely a regular supplier)
        const detectedSuppliers = Object.entries(merchantCounts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 20)
          .map(([name]) => name);

        if (detectedSuppliers.length > 0) {
          sendMessage(
            `[SYSTEM: Bank connected successfully! We analyzed the business account transactions and found these merchants the restaurant buys from regularly: ${detectedSuppliers.join(", ")}. ` +
            `Present ONLY these names to the user — do NOT add any names that aren't in this list. Ask: "Looking at your bank transactions, it looks like you buy from these places: [list them nicely]. ` +
            `Which of these are your food/ingredient suppliers? And are there any suppliers I'm missing?" Let them confirm the food-related ones. ` +
            `Use [ADD_SUPPLIERS:[...]] with their confirmed list.]`
          );
        } else {
          sendMessage(
            `[SYSTEM: Bank connected successfully! However, transaction data is still loading — this is normal and can take a few minutes. ` +
            `Tell the user: "Your bank is connected! It takes a little while for your transaction history to load — ` +
            `we'll automatically detect your suppliers from your spending once it's ready. For now, let's keep moving!" ` +
            `Do NOT suggest any supplier names — you don't have transaction data yet. Do NOT mention any specific company names. ` +
            `Just move on to the next onboarding step. We'll come back to suppliers later when the transaction data is available.]`
          );
        }
      }
    } catch {
      sendMessage("[SYSTEM: Bank connection was completed but we had trouble syncing transactions. Tell the user the bank is connected and they can sync transactions later from the Launch Pad.]");
    } finally {
      setBankConnecting(false);
      setShowBankConnect(false);
      setPlaidLinkToken(null);
    }
  }

  function handleBankSkip() {
    setShowBankConnect(false);
    setBankConnecting(false);
    sendMessage("I'll skip connecting my bank for now.");
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
              <h1 className="text-base font-semibold">AI Restaurant Manager</h1>
              <p className="text-xs text-white/70">Your Personal Onboarding Manager</p>
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
              Your Personal Onboarding Manager will walk you through setting up your restaurant. Gather what you can from this checklist first &mdash; the more you have ready, the smoother it&apos;ll go.
            </p>
          </div>

          {/* Already started? */}
          {!showResumeLogin ? (
            <button
              onClick={() => setShowResumeLogin(true)}
              className="w-full text-center text-sm text-porch-teal font-medium mb-4 hover:underline"
            >
              Already started? Log in to pick up where you left off
            </button>
          ) : (
            <div className="bg-white rounded-xl shadow p-4 mb-4">
              <p className="text-sm font-medium text-porch-brown mb-3">Enter the email you used before:</p>
              <form onSubmit={handleResumeLogin} className="flex gap-2">
                <input
                  type="email"
                  required
                  value={resumeEmail}
                  onChange={(e) => setResumeEmail(e.target.value)}
                  placeholder="your@email.com"
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-porch-teal focus:border-transparent"
                />
                <button
                  type="submit"
                  disabled={resumeLoading}
                  className="bg-porch-teal text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-porch-teal-light transition-colors disabled:opacity-50 whitespace-nowrap"
                >
                  {resumeLoading ? "..." : "Continue"}
                </button>
              </form>
              {resumeError && <p className="text-xs text-red-500 mt-2">{resumeError}</p>}
              <button
                onClick={() => { setShowResumeLogin(false); setResumeError(""); }}
                className="text-xs text-gray-400 mt-2 hover:text-gray-600"
              >
                Never mind, start fresh
              </button>
            </div>
          )}

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
            <h3 className="text-xs font-semibold text-porch-brown uppercase tracking-wide mb-2 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-status-gray" />
              Helpful If You Have It
            </h3>
            <p className="text-xs text-porch-brown-light mb-3 ml-4">
              Don&apos;t have these yet? No worries &mdash; you can start the setup now and add them later.
            </p>
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
                We&apos;ll automatically search the web for prices from your suppliers. For any that don&apos;t post prices online, you can upload photos of receipts or invoices &mdash; our AI reads them automatically!
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
          <p className="text-xs text-porch-brown-light mt-3">
            Your account is ready — log in with the email you provided during setup.
          </p>
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
            <h1 className="text-base font-semibold">AI Restaurant Manager</h1>
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
            <span className={sessionData.progress >= 7 ? "text-porch-teal font-medium" : ""}>Info</span>
            <span className={sessionData.progress >= 18 ? "text-porch-teal font-medium" : ""}>Suppliers</span>
            <span className={sessionData.progress >= 22 ? "text-porch-teal font-medium" : ""}>POS</span>
            <span className={sessionData.progress >= 30 ? "text-porch-teal font-medium" : ""}>Menu</span>
            <span className={sessionData.progress >= 42 ? "text-porch-teal font-medium" : ""}>Costs</span>
            <span className={sessionData.progress >= 58 ? "text-porch-teal font-medium" : ""}>Categories</span>
            <span className={sessionData.progress >= 65 ? "text-porch-teal font-medium" : ""}>Hours</span>
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
                      <span className="text-[10px] font-medium text-porch-brown-light">Your Onboarding Manager</span>
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
                  {/* Inline SupplierPicker */}
                  {showSupplierPicker && msg.id === supplierPickerMsgId && (
                    <div className="mt-3">
                      <SupplierPicker onConfirm={handleSupplierConfirm} />
                    </div>
                  )}
                  {/* Inline Square Connect */}
                  {showSquareConnect && msg.id === squareConnectMsgId && (
                    <div className="mt-3 bg-porch-cream rounded-xl p-4 border border-porch-cream-dark">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 bg-black rounded-lg flex items-center justify-center">
                          <span className="text-white text-lg font-bold">S</span>
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-porch-brown">Connect Square POS</p>
                          <p className="text-xs text-porch-brown-light">Pull in your sales data automatically</p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={handleSquareConnect}
                          className="flex-1 bg-porch-teal text-white py-2 rounded-lg text-sm font-medium hover:bg-porch-teal-light transition-colors"
                        >
                          Connect Square
                        </button>
                        <button
                          onClick={handleSquareSkip}
                          className="px-4 py-2 text-sm text-porch-brown-light hover:text-porch-brown transition-colors"
                        >
                          Skip
                        </button>
                      </div>
                    </div>
                  )}
                  {/* Inline Bank Connect */}
                  {showBankConnect && msg.id === bankConnectMsgId && (
                    <div className="mt-3 bg-porch-cream rounded-xl p-4 border border-porch-cream-dark">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 bg-porch-teal rounded-lg flex items-center justify-center">
                          <span className="text-white text-xl" role="img" aria-label="bank">&#x1F3E6;</span>
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-porch-brown">Connect Your Bank</p>
                          <p className="text-xs text-porch-brown-light">We&apos;ll find your suppliers automatically</p>
                        </div>
                      </div>
                      {bankConnecting ? (
                        <div className="flex items-center justify-center py-3">
                          <div className="w-5 h-5 border-2 border-porch-teal border-t-transparent rounded-full animate-spin mr-2" />
                          <span className="text-sm text-porch-brown-light">Connecting...</span>
                        </div>
                      ) : (
                        <div>
                          {bankConnectError && (
                            <p className="text-sm text-red-600 mb-2">{bankConnectError}</p>
                          )}
                          <div className="flex gap-2">
                            <button
                              onClick={handleBankConnect}
                              className="flex-1 bg-porch-teal text-white py-2 rounded-lg text-sm font-medium hover:bg-porch-teal-light transition-colors"
                            >
                              {bankConnectError ? "Try Again" : "Connect Bank"}
                            </button>
                            <button
                              onClick={handleBankSkip}
                              className="px-4 py-2 text-sm text-porch-brown-light hover:text-porch-brown transition-colors"
                            >
                              Skip for now
                            </button>
                          </div>
                        </div>
                      )}
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

      {/* Plaid Link auto-opener */}
      {plaidLinkToken && (
        <PlaidLinkOpener
          linkToken={plaidLinkToken}
          onSuccess={handleBankConnectSuccess}
          onExit={() => {
            setPlaidLinkToken(null);
            setBankConnecting(false);
          }}
        />
      )}

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

/* ── Plaid Link Opener ─────────────────────────────────── */

/* eslint-disable @typescript-eslint/no-explicit-any */
function PlaidLinkOpener({
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
    onSuccess: (public_token: string, metadata: any) => {
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
