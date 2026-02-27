# Decision Log

## 2026-02-11 - Tech Stack: Next.js + SQLite
**Context**: Choosing how to build the café financial dashboard
**Decision**: Next.js 16 (App Router) with SQLite via better-sqlite3, Tailwind CSS, deployed on Vercel
**Rationale**: Simple, free to host, no external database service needed. Jennifer already has Next.js experience from triply-vintage. SQLite is perfect for a single-user app — no setup, no monthly costs.

## 2026-02-11 - Phase 1 Priority: Menu Costing Before Integrations
**Context**: Jennifer needs to know if she should raise prices. Originally planned Square connection first.
**Decision**: Build menu cost calculator first (Phase 1), Square/Plaid connections second (Phase 2)
**Rationale**: Jennifer can start entering her menu items and Walmart ingredient costs immediately without waiting for API connections. This gives her actionable data fastest. The question "am I charging enough?" can be answered with just the menu costing tool.

## 2026-02-11 - Build Custom vs Buy Existing (MarginEdge/Restaurant365)
**Context**: Existing restaurant management tools cost $250-$330/month
**Decision**: Build custom
**Rationale**: At $260K revenue, $330/month (MarginEdge) = $3,960/year = 1.5% of revenue. Jennifer is already financially stressed. Square API is free, Plaid is ~$2/month, hosting is free on Vercel. Custom build costs nothing ongoing and is tailored to her exact workflow.

## 2026-02-11 - Bank: Wells Fargo via Plaid
**Context**: Need to connect Jennifer's business bank account
**Decision**: Use Plaid SDK to connect Wells Fargo
**Rationale**: Wells Fargo is fully supported by Plaid. Plaid offers free tier (5 connections) which is all we need. Provides 24 months of transaction history with auto-categorization (90%+ accuracy).

## 2026-02-11 - Walmart: Switch to Walmart Business Account
**Context**: Jennifer currently uses a personal Walmart account for café supplies
**Decision**: Recommend switching to free Walmart Business account
**Rationale**: Walmart Business provides itemized purchase reports downloadable as CSV/Excel — critical for tracking ingredient costs. Does not affect personal Walmart+ membership or in-home delivery perks. Free to set up.

## 2026-02-23 - AI Assistant Manager: Voice + Function Calling Architecture
**Context**: Need an AI assistant that restaurant owners can talk to for managing their business. Key sellable feature.
**Decision**: Web Speech API for voice (free, browser-native) + OpenAI GPT-4o with function calling for the AI brain. Tools call database directly (not HTTP to own API routes). SSE streaming for responses.
**Rationale**: Web Speech API is free vs Whisper at $0.006/min — critical when selling to many restaurants. Function calling is more reliable than prompt-based parsing. Direct DB access avoids serverless timeout issues from self-calling HTTP endpoints. Streaming keeps UX responsive within Vercel's 30s streaming limit.

## 2026-02-23 - AI Assistant: Build for Single-Tenant First, SaaS Later
**Context**: Platform needs to be sellable but is currently single-user SQLite
**Decision**: Build the assistant for the current single-tenant architecture. Design tool system through API-like abstractions so it can be adapted to multi-tenant later without rewriting.
**Rationale**: Getting the feature working and proving the concept is more valuable than premature multi-tenant architecture. The tool abstraction layer means the AI logic doesn't need to change when the database backend changes.
