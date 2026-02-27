# AI-3: Voice Input (Speech-to-Text)

AGENT_ROLE: builder
PROJECT: porch-financial

## Task
Add voice input capability to the AI Assistant chat panel using the browser's built-in Web Speech API. Users can tap the microphone button to speak instead of type.

## Context
- Spec: `.project/architect/features/ai-assistant-manager.md`
- Chat UI from AI-2: `src/components/AssistantChat.tsx`
- Chat hook from AI-2: `src/hooks/useAssistantChat.ts`

## What to Build

### 1. Speech Hook (`src/hooks/useSpeechRecognition.ts`)
Custom React hook that wraps the Web Speech API:
- `isListening` boolean
- `transcript` string (current in-progress text)
- `isSupported` boolean (false if browser doesn't support it)
- `startListening()` — begins recording
- `stopListening()` — stops recording, returns final transcript
- `error` string | null

**Implementation details:**
- Use `webkitSpeechRecognition` (Safari) or `SpeechRecognition` (Chrome)
- Set `continuous = false` (stop after one utterance)
- Set `interimResults = true` (show words as they're spoken)
- Set `lang = 'en-US'`
- On `result` event: update transcript with interim results, and when `isFinal` is true, call the provided `onResult` callback
- On `error` event: set error state, fall back gracefully
- On `end` event: clean up
- Auto-stop after 10 seconds of silence

### 2. Mic Button Integration
Update the chat panel input area:
- Add microphone button next to the text input (right side, before send button)
- When NOT listening: gray mic icon
- When listening: red pulsing mic icon + waveform animation
- Tap to start, tap again to stop
- When speech is recognized, populate the text input with the transcript
- Auto-send when speech recognition ends with a final result (user speaks, pauses, message sends)
- If speech recognition is not supported, hide the mic button entirely

### 3. Visual Feedback
- When recording: show a subtle red glow/pulse on the mic button
- Show interim transcript in the text input field as the user speaks
- Brief "Listening..." text or indicator when mic first activates

## Acceptance Criteria
- [ ] Mic button appears in chat input area (only if browser supports Web Speech API)
- [ ] Tapping mic starts listening — button turns red with pulse animation
- [ ] Words appear in text input as user speaks (interim results)
- [ ] When user stops speaking, final transcript is placed in input and auto-sent
- [ ] Tapping mic again during recording stops it
- [ ] Works on iPhone Safari
- [ ] Works on Chrome (Android/desktop)
- [ ] Gracefully falls back to text-only if speech not supported
- [ ] Error handling: if mic permission denied, show helpful message
