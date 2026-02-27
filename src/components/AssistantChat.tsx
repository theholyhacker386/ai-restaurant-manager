"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { useAssistantChat, type ActionCard } from "@/hooks/useAssistantChat";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";

export default function AssistantChat() {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const {
    messages,
    isLoading,
    pendingScreenshot,
    sendMessage,
    captureScreenshot,
    clearScreenshot,
  } = useAssistantChat();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const chatPanelRef = useRef<HTMLDivElement>(null);
  const fabRef = useRef<HTMLButtonElement>(null);

  // Draggable FAB state
  const [fabPos, setFabPos] = useState<{ x: number; y: number } | null>(null);
  const fabPosRef = useRef<{ x: number; y: number } | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; startPosX: number; startPosY: number; moved: boolean } | null>(null);
  const wasDragged = useRef(false);

  // Attach native touch listeners with { passive: false } so drag works on iOS
  useEffect(() => {
    const fab = fabRef.current;
    if (!fab) return;

    function onTouchStart(e: TouchEvent) {
      if (isOpen) return;
      const touch = e.touches[0];
      const rect = fab!.getBoundingClientRect();
      wasDragged.current = false;
      dragRef.current = {
        startX: touch.clientX,
        startY: touch.clientY,
        startPosX: rect.left,
        startPosY: rect.top,
        moved: false,
      };
    }

    function onTouchMove(e: TouchEvent) {
      if (!dragRef.current || isOpen) return;
      const touch = e.touches[0];
      const dx = touch.clientX - dragRef.current.startX;
      const dy = touch.clientY - dragRef.current.startY;
      if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
        dragRef.current.moved = true;
        wasDragged.current = true;
      }
      if (!dragRef.current.moved) return;
      e.preventDefault();
      const newX = dragRef.current.startPosX + dx;
      const newY = dragRef.current.startPosY + dy;
      const maxX = window.innerWidth - 56;
      const maxY = window.innerHeight - 56;
      const pos = {
        x: Math.max(0, Math.min(maxX, newX)),
        y: Math.max(0, Math.min(maxY, newY)),
      };
      fabPosRef.current = pos;
      // Move directly via style for smooth dragging (no re-render lag)
      fab!.style.left = pos.x + "px";
      fab!.style.top = pos.y + "px";
      fab!.style.right = "auto";
      fab!.style.bottom = "auto";
    }

    function onTouchEnd() {
      if (dragRef.current?.moved && fabPosRef.current) {
        setFabPos({ ...fabPosRef.current });
      }
      dragRef.current = null;
    }

    fab.addEventListener("touchstart", onTouchStart, { passive: true });
    fab.addEventListener("touchmove", onTouchMove, { passive: false });
    fab.addEventListener("touchend", onTouchEnd, { passive: true });

    return () => {
      fab.removeEventListener("touchstart", onTouchStart);
      fab.removeEventListener("touchmove", onTouchMove);
      fab.removeEventListener("touchend", onTouchEnd);
    };
  }, [isOpen]);

  const handleFabClick = () => {
    if (wasDragged.current) {
      wasDragged.current = false;
      return;
    }
    setIsOpen(!isOpen);
    if (!isOpen) {
      setFabPos(null);
      fabPosRef.current = null;
    }
  };

  // Speech recognition — auto-send when speech finishes
  const handleSpeechResult = useCallback(
    (text: string) => {
      setInput("");
      sendMessage(text);
    },
    [sendMessage]
  );

  const { isListening, transcript, isSupported, error: speechError, startListening, stopListening } =
    useSpeechRecognition(handleSpeechResult);

  // Show interim transcript in input
  useEffect(() => {
    if (isListening && transcript) {
      setInput(transcript);
    }
  }, [isListening, transcript]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input when panel opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    sendMessage(input.trim());
    setInput("");
  };

  const toggleMic = () => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };

  const handleScreenshot = async () => {
    // Hide chat panel + FAB so they don't appear in screenshot
    const panel = chatPanelRef.current;
    const fab = fabRef.current;
    if (panel) panel.style.visibility = "hidden";
    if (fab) fab.style.visibility = "hidden";

    await captureScreenshot(null); // we handle hiding ourselves

    // Restore visibility
    if (panel) panel.style.visibility = "";
    if (fab) fab.style.visibility = "";
  };

  return (
    <>
      {/* Floating Action Button */}
      <button
        ref={fabRef}
        onClick={handleFabClick}
        className={`fixed z-[60] shadow-lg ${
          isOpen
            ? "right-4 bottom-[calc(70vh+0.5rem)] bg-white/90 text-gray-600 w-10 h-10 rounded-full transition-all duration-300 ease-out"
            : "bg-porch-teal text-white w-14 h-14 rounded-full active:scale-95 touch-none"
        }`}
        style={
          !isOpen && fabPos
            ? { left: fabPos.x, top: fabPos.y, right: "auto", bottom: "auto" }
            : !isOpen
            ? { right: "1rem", bottom: "calc(4rem + env(safe-area-inset-bottom) + 12px)" }
            : undefined
        }
        aria-label={isOpen ? "Close assistant" : "Open assistant"}
      >
        {isOpen ? (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 mx-auto">
            <path fillRule="evenodd" d="M5.47 5.47a.75.75 0 011.06 0L12 10.94l5.47-5.47a.75.75 0 111.06 1.06L13.06 12l5.47 5.47a.75.75 0 11-1.06 1.06L12 13.06l-5.47 5.47a.75.75 0 01-1.06-1.06L10.94 12 5.47 6.53a.75.75 0 010-1.06z" clipRule="evenodd" />
          </svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-7 h-7 mx-auto">
            <path fillRule="evenodd" d="M4.848 2.771A49.144 49.144 0 0112 2.25c2.43 0 4.817.178 7.152.52 1.978.292 3.348 2.024 3.348 3.97v6.02c0 1.946-1.37 3.678-3.348 3.97a48.901 48.901 0 01-3.476.383.39.39 0 00-.297.17l-2.755 4.133a.75.75 0 01-1.248 0l-2.755-4.133a.39.39 0 00-.297-.17 48.9 48.9 0 01-3.476-.384c-1.978-.29-3.348-2.024-3.348-3.97V6.741c0-1.946 1.37-3.68 3.348-3.97z" clipRule="evenodd" />
          </svg>
        )}
      </button>

      {/* Chat Panel */}
      <div
        ref={chatPanelRef}
        className={`fixed inset-x-0 bottom-0 z-50 transition-transform duration-300 ease-out ${
          isOpen ? "translate-y-0" : "translate-y-full"
        }`}
        style={{ height: "70vh" }}
      >
        {/* Backdrop */}
        {isOpen && (
          <div
            className="fixed inset-0 bg-black/20 -z-10"
            onClick={() => setIsOpen(false)}
          />
        )}

        <div className="h-full bg-white rounded-t-2xl shadow-2xl flex flex-col overflow-hidden">
          {/* Header */}
          <div className="bg-porch-teal text-white px-4 py-3 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                <path d="M16.5 7.5h-9v9h9v-9z" />
                <path fillRule="evenodd" d="M8.25 2.25A.75.75 0 019 3v.75h2.25V3a.75.75 0 011.5 0v.75H15V3a.75.75 0 011.5 0v.75h.75a3 3 0 013 3v.75H21A.75.75 0 0121 9h-.75v2.25H21a.75.75 0 010 1.5h-.75V15H21a.75.75 0 010 1.5h-.75v.75a3 3 0 01-3 3h-.75V21a.75.75 0 01-1.5 0v-.75h-2.25V21a.75.75 0 01-1.5 0v-.75H9V21a.75.75 0 01-1.5 0v-.75h-.75a3 3 0 01-3-3v-.75H3A.75.75 0 013 15h.75v-2.25H3a.75.75 0 010-1.5h.75V9H3a.75.75 0 010-1.5h.75v-.75a3 3 0 013-3h.75V3a.75.75 0 01.75-.75zM6 6.75A.75.75 0 016.75 6h10.5a.75.75 0 01.75.75v10.5a.75.75 0 01-.75.75H6.75a.75.75 0 01-.75-.75V6.75z" clipRule="evenodd" />
              </svg>
              <div>
                <h2 className="text-sm font-bold">AI Assistant</h2>
                <p className="text-[10px] text-white/70">Your restaurant manager</p>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="p-1 rounded-full hover:bg-white/20 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                <path fillRule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25zm-1.72 6.97a.75.75 0 10-1.06 1.06L10.94 12l-1.72 1.72a.75.75 0 101.06 1.06L12 13.06l1.72 1.72a.75.75 0 101.06-1.06L13.06 12l1.72-1.72a.75.75 0 10-1.06-1.06L12 10.94l-1.72-1.72z" clipRule="evenodd" />
              </svg>
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {messages.length === 0 && (
              <div className="text-center py-8">
                <div className="w-12 h-12 bg-porch-teal/10 rounded-full flex items-center justify-center mx-auto mb-3">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6 text-porch-teal">
                    <path fillRule="evenodd" d="M4.848 2.771A49.144 49.144 0 0112 2.25c2.43 0 4.817.178 7.152.52 1.978.292 3.348 2.024 3.348 3.97v6.02c0 1.946-1.37 3.678-3.348 3.97a48.901 48.901 0 01-3.476.383.39.39 0 00-.297.17l-2.755 4.133a.75.75 0 01-1.248 0l-2.755-4.133a.39.39 0 00-.297-.17 48.9 48.9 0 01-3.476-.384c-1.978-.29-3.348-2.024-3.348-3.97V6.741c0-1.946 1.37-3.68 3.348-3.97z" clipRule="evenodd" />
                  </svg>
                </div>
                <p className="text-sm font-semibold text-gray-800">Hey! How can I help today?</p>
                <p className="text-xs text-gray-500 mt-1">
                  Try: &quot;How are my sales this month?&quot; or &quot;Add a new menu item&quot;
                </p>

                {/* Suggested prompts */}
                <div className="flex flex-wrap gap-2 justify-center mt-4">
                  {[
                    "How are sales this week?",
                    "What's my food cost?",
                    "Show me my KPIs",
                    "Any recommendations?",
                  ].map((prompt) => (
                    <button
                      key={prompt}
                      onClick={() => {
                        sendMessage(prompt);
                      }}
                      className="text-xs px-3 py-1.5 rounded-full bg-porch-teal/10 text-porch-teal hover:bg-porch-teal/20 transition-colors"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg) => (
              <div key={msg.id}>
                {/* Screenshot attachment */}
                {msg.screenshotUrl && (
                  <div className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"} mb-1`}>
                    <div className="max-w-[85%] rounded-xl overflow-hidden border border-gray-200 shadow-sm">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={msg.screenshotUrl}
                        alt="Screenshot"
                        className="w-full max-h-40 object-cover"
                      />
                      <div className="px-2 py-1 bg-gray-50 text-[10px] text-gray-500 flex items-center gap-1">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
                          <path fillRule="evenodd" d="M1 5.25A2.25 2.25 0 013.25 3h13.5A2.25 2.25 0 0119 5.25v9.5A2.25 2.25 0 0116.75 17H3.25A2.25 2.25 0 011 14.75v-9.5zm1.5 5.81v3.69c0 .414.336.75.75.75h13.5a.75.75 0 00.75-.75v-2.69l-2.22-2.219a.75.75 0 00-1.06 0l-1.91 1.909-4.97-4.969a.75.75 0 00-1.06 0L2.5 11.06zM12.75 7a1.25 1.25 0 100 2.5 1.25 1.25 0 000-2.5z" clipRule="evenodd" />
                        </svg>
                        Screenshot attached
                      </div>
                    </div>
                  </div>
                )}

                {/* Message bubble */}
                <div
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                      msg.role === "user"
                        ? "bg-porch-teal text-white rounded-br-sm"
                        : "bg-gray-100 text-gray-800 rounded-bl-sm"
                    }`}
                  >
                    {msg.content || (msg.isStreaming && !msg.actionCards?.length ? (
                      <ThinkingDots />
                    ) : null)}
                  </div>
                </div>

                {/* Action cards */}
                {msg.actionCards?.map((card, i) => (
                  <div key={i} className="mt-2 ml-0">
                    <ActionCardComponent card={card} />
                  </div>
                ))}
              </div>
            ))}

            <div ref={messagesEndRef} />
          </div>

          {/* Pending screenshot preview */}
          {pendingScreenshot && (
            <div className="px-3 py-2 border-t border-gray-100 bg-gray-50 flex items-center gap-2">
              <div className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={pendingScreenshot}
                  alt="Screenshot preview"
                  className="h-12 w-20 object-cover rounded-lg border border-gray-200"
                />
                <button
                  onClick={clearScreenshot}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center text-xs shadow"
                >
                  &times;
                </button>
              </div>
              <span className="text-xs text-gray-500">Screenshot ready to send</span>
            </div>
          )}

          {/* Speech error */}
          {speechError && (
            <div className="px-4 py-1">
              <p className="text-xs text-red-500">{speechError}</p>
            </div>
          )}

          {/* Input */}
          <form
            onSubmit={handleSubmit}
            className="shrink-0 border-t border-gray-200 px-3 py-2 flex items-center gap-2"
            style={{ paddingBottom: "calc(0.5rem + env(safe-area-inset-bottom))" }}
          >
            {/* Screenshot button */}
            <button
              type="button"
              onClick={handleScreenshot}
              className="w-10 h-10 rounded-full flex items-center justify-center bg-gray-100 text-gray-500 hover:bg-gray-200 transition-all shrink-0"
              aria-label="Take screenshot"
              title="Capture screenshot"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                <path d="M12 9a3.75 3.75 0 100 7.5A3.75 3.75 0 0012 9z" />
                <path fillRule="evenodd" d="M9.344 3.071a49.52 49.52 0 015.312 0c.967.052 1.83.585 2.332 1.39l.821 1.317c.24.383.645.643 1.11.71.386.054.77.113 1.152.177 1.432.239 2.429 1.493 2.429 2.909V18a3 3 0 01-3 3H4.5a3 3 0 01-3-3V9.574c0-1.416.997-2.67 2.429-2.909.382-.064.766-.123 1.151-.178a1.56 1.56 0 001.11-.71l.822-1.315a2.942 2.942 0 012.332-1.39zM6.75 12.75a5.25 5.25 0 1110.5 0 5.25 5.25 0 01-10.5 0zm12-2.25a.75.75 0 01.75-.75h.008a.75.75 0 01.75.75v.008a.75.75 0 01-.75.75H19.5a.75.75 0 01-.75-.75V10.5z" clipRule="evenodd" />
              </svg>
            </button>

            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={isListening ? "Listening..." : "Type or tap the mic..."}
              className="flex-1 text-sm bg-gray-100 rounded-full px-4 py-2.5 outline-none focus:ring-2 focus:ring-porch-teal/30 placeholder:text-gray-400"
              disabled={isLoading && !isListening}
            />

            {/* Mic button */}
            {isSupported && (
              <button
                type="button"
                onClick={toggleMic}
                className={`w-10 h-10 rounded-full flex items-center justify-center transition-all shrink-0 ${
                  isListening
                    ? "bg-red-500 text-white animate-pulse"
                    : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                }`}
                aria-label={isListening ? "Stop recording" : "Start recording"}
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                  <path d="M8.25 4.5a3.75 3.75 0 117.5 0v8.25a3.75 3.75 0 11-7.5 0V4.5z" />
                  <path d="M6 10.5a.75.75 0 01.75.75v1.5a5.25 5.25 0 1010.5 0v-1.5a.75.75 0 011.5 0v1.5a6.751 6.751 0 01-6 6.709v2.291h3a.75.75 0 010 1.5h-7.5a.75.75 0 010-1.5h3v-2.291a6.751 6.751 0 01-6-6.709v-1.5A.75.75 0 016 10.5z" />
                </svg>
              </button>
            )}

            {/* Send button */}
            <button
              type="submit"
              disabled={!input.trim() || isLoading}
              className="w-10 h-10 rounded-full bg-porch-teal text-white flex items-center justify-center disabled:opacity-40 transition-opacity shrink-0"
              aria-label="Send message"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                <path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" />
              </svg>
            </button>
          </form>
        </div>
      </div>
    </>
  );
}

/** Three bouncing dots while AI is thinking */
function ThinkingDots() {
  return (
    <div className="flex items-center gap-1 py-1">
      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
    </div>
  );
}

/** Styled action card for when AI performs operations */
function ActionCardComponent({ card }: { card: ActionCard }) {
  const colors = {
    success: "border-l-green-500 bg-green-50",
    info: "border-l-blue-500 bg-blue-50",
    warning: "border-l-amber-500 bg-amber-50",
  };

  const icons = {
    success: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 text-green-600">
        <path fillRule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12zm13.36-1.814a.75.75 0 10-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.14-.094l3.75-5.25z" clipRule="evenodd" />
      </svg>
    ),
    info: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 text-blue-600">
        <path fillRule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12zm8.706-1.442c1.146-.573 2.437.463 2.126 1.706l-.709 2.836.042-.02a.75.75 0 01.67 1.34l-.04.022c-1.147.573-2.438-.463-2.127-1.706l.71-2.836-.042.02a.75.75 0 11-.671-1.34l.041-.022zM12 9a.75.75 0 100-1.5.75.75 0 000 1.5z" clipRule="evenodd" />
      </svg>
    ),
    warning: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 text-amber-600">
        <path fillRule="evenodd" d="M9.401 3.003c1.155-2 4.043-2 5.197 0l7.355 12.748c1.154 2-.29 4.5-2.599 4.5H4.645c-2.309 0-3.752-2.5-2.598-4.5L9.4 3.003zM12 8.25a.75.75 0 01.75.75v3.75a.75.75 0 01-1.5 0V9a.75.75 0 01.75-.75zm0 8.25a.75.75 0 100-1.5.75.75 0 000 1.5z" clipRule="evenodd" />
      </svg>
    ),
  };

  return (
    <div className={`border-l-4 ${colors[card.type]} rounded-lg p-3 ml-0`}>
      <div className="flex items-center gap-1.5">
        {icons[card.type]}
        <span className="text-xs font-semibold text-gray-800">{card.title}</span>
      </div>
      <p className="text-xs text-gray-600 mt-1">{card.details}</p>
      {card.link && (
        <Link
          href={card.link}
          className="text-xs text-porch-teal font-medium mt-1.5 inline-block hover:underline"
        >
          View &rarr;
        </Link>
      )}
    </div>
  );
}
