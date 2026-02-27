"use client";

import { useState, useCallback, useRef } from "react";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  actionCards?: ActionCard[];
  screenshotUrl?: string; // data URL of attached screenshot
  isStreaming?: boolean;
}

export interface ActionCard {
  type: "success" | "info" | "warning";
  title: string;
  details: string;
  link?: string;
}

/** Collect page context so the AI knows where the user is and what device they're on */
function getPageContext() {
  return {
    url: window.location.href,
    pathname: window.location.pathname,
    pageTitle: document.title,
    viewport: { width: window.innerWidth, height: window.innerHeight },
    userAgent: navigator.userAgent,
    timestamp: new Date().toISOString(),
  };
}

/** Load html2canvas on demand (only when screenshot is needed) */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let html2canvasPromise: Promise<any> | null = null;
function loadHtml2Canvas() {
  if (html2canvasPromise) return html2canvasPromise;
  html2canvasPromise = new Promise((resolve, reject) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((window as any).html2canvas) { resolve((window as any).html2canvas); return; }
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    s.onload = () => resolve((window as any).html2canvas);
    s.onerror = () => reject(new Error("Failed to load screenshot library"));
    document.head.appendChild(s);
  });
  return html2canvasPromise;
}

export function useAssistantChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [pendingScreenshot, setPendingScreenshot] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const conversationIdRef = useRef<string | null>(null);

  /** Capture a screenshot of the current page (hides the chat panel first) */
  const captureScreenshot = useCallback(async (chatPanelRef?: HTMLElement | null) => {
    try {
      // Temporarily hide the chat panel so it doesn't appear in the screenshot
      if (chatPanelRef) chatPanelRef.style.display = "none";

      const h2c = await loadHtml2Canvas();
      const canvas = await h2c(document.body, {
        useCORS: true,
        scale: Math.min(window.devicePixelRatio || 1, 2), // cap at 2x to keep size reasonable
        logging: false,
        width: window.innerWidth,
        height: window.innerHeight,
        x: window.scrollX,
        y: window.scrollY,
        windowWidth: window.innerWidth,
        windowHeight: window.innerHeight,
      });

      // Restore chat panel
      if (chatPanelRef) chatPanelRef.style.display = "";

      // Compress as JPEG to keep the data URL small
      const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
      setPendingScreenshot(dataUrl);
      return dataUrl;
    } catch (err) {
      console.error("Screenshot capture failed:", err);
      if (chatPanelRef) chatPanelRef.style.display = "";
      return null;
    }
  }, []);

  const clearScreenshot = useCallback(() => {
    setPendingScreenshot(null);
  }, []);

  const sendMessage = useCallback(
    async (text: string, screenshot?: string | null) => {
      const trimmed = text.trim();
      if (!trimmed || isLoading) return;

      // Use passed screenshot or pending screenshot
      const screenshotToSend = screenshot || pendingScreenshot;

      // Add user message (with screenshot thumbnail if attached)
      const userMsg: ChatMessage = {
        id: `user-${Date.now()}`,
        role: "user",
        content: trimmed,
        screenshotUrl: screenshotToSend || undefined,
      };

      // Add placeholder assistant message for streaming
      const assistantId = `assistant-${Date.now()}`;
      const assistantMsg: ChatMessage = {
        id: assistantId,
        role: "assistant",
        content: "",
        actionCards: [],
        isStreaming: true,
      };

      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setIsLoading(true);
      setPendingScreenshot(null); // Clear after sending

      // Build history from existing messages (excluding the new ones)
      const history = messages
        .filter((m) => !m.isStreaming)
        .map((m) => ({ role: m.role, content: m.content }));

      try {
        abortRef.current = new AbortController();

        const res = await fetch("/api/assistant/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: trimmed,
            history,
            pageContext: getPageContext(),
            screenshot: screenshotToSend || undefined,
            conversationId: conversationIdRef.current || undefined,
          }),
          signal: abortRef.current.signal,
        });

        if (!res.ok) {
          throw new Error(`Server error: ${res.status}`);
        }

        const reader = res.body?.getReader();
        if (!reader) throw new Error("No response stream");

        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // Process complete SSE events
          const lines = buffer.split("\n");
          buffer = lines.pop() || ""; // Keep incomplete line in buffer

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;

            try {
              const event = JSON.parse(line.slice(6));

              if (event.type === "conversation_id" && event.id) {
                conversationIdRef.current = event.id;
              } else if (event.type === "text") {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId
                      ? { ...m, content: m.content + event.content }
                      : m
                  )
                );
              } else if (event.type === "tool_call" && event.actionCard) {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId
                      ? {
                          ...m,
                          actionCards: [
                            ...(m.actionCards || []),
                            event.actionCard,
                          ],
                        }
                      : m
                  )
                );
              } else if (event.type === "error") {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId
                      ? {
                          ...m,
                          content:
                            "I'm having trouble right now. Try again in a moment.",
                        }
                      : m
                  )
                );
              }
            } catch {
              // Skip malformed events
            }
          }
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "AbortError") {
          // User cancelled
        } else {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? {
                    ...m,
                    content:
                      m.content ||
                      "Something went wrong. Please try again.",
                  }
                : m
            )
          );
        }
      } finally {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, isStreaming: false } : m
          )
        );
        setIsLoading(false);
        abortRef.current = null;
      }
    },
    [messages, isLoading, pendingScreenshot]
  );

  const clearMessages = useCallback(() => {
    setMessages([]);
    setPendingScreenshot(null);
    conversationIdRef.current = null;
  }, []);

  return {
    messages,
    isLoading,
    pendingScreenshot,
    sendMessage,
    clearMessages,
    captureScreenshot,
    clearScreenshot,
  };
}
