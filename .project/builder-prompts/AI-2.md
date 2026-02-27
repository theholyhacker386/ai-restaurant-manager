# AI-2: Chat UI Component

AGENT_ROLE: builder
PROJECT: porch-financial

## Task
Build the frontend chat interface for the AI Assistant Manager. This includes a floating action button (FAB) visible on all pages, and a slide-up chat panel with message bubbles, text input, and action cards for when the AI performs operations.

## Context
- Spec: `.project/architect/features/ai-assistant-manager.md`
- Layout: `src/app/layout.tsx` (where to add the FAB)
- Bottom nav: `src/components/BottomNav.tsx` (FAB sits above this)
- Styling: Tailwind CSS v4 (mobile-first)
- Brand colors: `porch-teal`, `porch-brown`, `porch-cream` (see existing components)
- The chat API (AI-1) streams SSE events in format: `data: {"type": "text"|"tool_call"|"done", ...}\n\n`

## What to Build

### 1. Chat FAB (`src/components/AssistantFAB.tsx`)
- Floating circular button, 56px, positioned bottom-right
- Sits ABOVE the bottom nav (bottom: calc(4rem + env(safe-area-inset-bottom) + 16px))
- Background: `porch-teal`, white icon
- Icon: chat bubble icon (when closed), X icon (when open)
- Tap to toggle chat panel open/closed
- Subtle entrance animation (scale up from 0)
- z-index above bottom nav but below chat panel

### 2. Chat Panel (`src/components/AssistantChat.tsx`)
- Slides up from bottom when FAB is tapped
- Height: ~70vh on mobile, fixed 500px on desktop
- Background white, rounded top corners
- Header bar: "AI Assistant" title + close X button, porch-teal background
- Message area: scrollable, auto-scrolls to bottom on new messages
- Input area at bottom: text input + send button + mic button

**Message Types:**
- **User message**: Right-aligned bubble, porch-teal background, white text
- **Assistant message**: Left-aligned bubble, gray-50 background, dark text. Support markdown-ish formatting (bold, line breaks)
- **Action card**: Special styled card shown when AI executes a tool:
  ```
  ┌─────────────────────────┐
  │ ✅ Menu Item Added      │
  │ Chicken Alfredo         │
  │ Price: $13.99           │
  │ [View →]                │
  └─────────────────────────┘
  ```
  Green border-left for success, amber for warnings, linked to relevant page
- **Thinking indicator**: Three bouncing dots while AI is processing

**Streaming behavior:**
- When API streams text chunks, append them to the current assistant message in real-time (like ChatGPT typing effect)
- When API streams a tool_call event, show an action card
- When API streams done, finalize the message

### 3. Chat Hook (`src/hooks/useAssistantChat.ts`)
Custom React hook that manages:
- `messages` array state
- `isLoading` boolean
- `sendMessage(text: string)` function that:
  1. Adds user message to state
  2. POSTs to `/api/assistant/chat` with message + history
  3. Reads the SSE stream
  4. Builds up the assistant response from stream chunks
  5. Handles tool_call events by creating action cards
  6. Sets isLoading false when done event received
- `conversationId` tracking

### 4. Integration in Layout
Add the FAB component to `src/app/layout.tsx` so it appears on every page.
It should be a client component wrapper that manages the open/close state.

## Design Specifications

**Colors:**
- FAB: bg-porch-teal, text-white
- Chat header: bg-porch-teal, text-white
- User bubble: bg-porch-teal, text-white
- Assistant bubble: bg-gray-50, text-gray-900
- Action card success: border-l-4 border-green-500, bg-green-50
- Action card info: border-l-4 border-blue-500, bg-blue-50
- Mic button: bg-gray-100 (idle), bg-red-500 (recording)
- Send button: bg-porch-teal

**Animations:**
- Panel slide up: transform translateY, 300ms ease-out
- Message appear: fade in + slight slide up, 200ms
- Thinking dots: bounce animation
- FAB: scale transition on tap

**Mobile-specific:**
- Panel should respect safe area insets (notch, home indicator)
- Input should not be covered by iOS keyboard (use visualViewport API if needed)
- Tap outside panel to close
- Prevent body scroll when panel is open

## Acceptance Criteria
- [ ] FAB visible on all pages, above bottom nav
- [ ] Tapping FAB opens chat panel with slide-up animation
- [ ] Can type a message and see it appear as a user bubble
- [ ] Sending a message shows thinking indicator
- [ ] AI response streams in character-by-character
- [ ] Action cards appear when AI executes operations (tool_call events)
- [ ] Auto-scrolls to newest message
- [ ] Close button and tap-outside-to-close both work
- [ ] Works correctly on iPhone Safari (keyboard handling, safe areas)
- [ ] Does not overlap or interfere with existing bottom nav
