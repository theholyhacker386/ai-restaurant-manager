# Max Parallelization Plan - Phase 1

## Wave Analysis

### Wave 1 — Can run in parallel (NO dependencies between them)
| Task | Builder Prompt | What It Builds | Est. Complexity |
|------|---------------|----------------|-----------------|
| UI-1 | `builder-prompts/UI-1.md` | Dashboard home page, app layout, bottom nav, global styles | Medium |
| UI-3 | `builder-prompts/UI-3.md` | Ingredient manager — list, add, edit pages | Medium |

**Why parallel:** UI-1 builds the app shell/layout. UI-3 builds ingredient pages. They don't touch the same files. Both read from existing API routes.

### Wave 2 — Needs Wave 1 complete
| Task | Builder Prompt | What It Builds | Depends On |
|------|---------------|----------------|------------|
| UI-2 | `builder-prompts/UI-2.md` | Menu items list, add/edit pages | UI-1 (app layout) |

**Why sequential:** Menu pages need the navigation layout from UI-1 to be consistent.

### Wave 3 — Needs Wave 2 complete
| Task | Builder Prompt | What It Builds | Depends On |
|------|---------------|----------------|------------|
| UI-4 | `builder-prompts/UI-4.md` | Recipe builder (core costing feature) | UI-2 + UI-3 |

**Why sequential:** Recipe builder needs both menu item pages and ingredient pages to exist — it links them together.

## Foundation Already Built (by Architect)
These files already exist and builders will use them:
- `src/lib/db.ts` — Database schema and initialization
- `src/lib/square.ts` — Square API helper functions
- `src/lib/calculations.ts` — Financial calculation engine
- `src/app/api/menu-items/route.ts` — Menu items API
- `src/app/api/ingredients/route.ts` — Ingredients API
- `src/app/api/recipes/route.ts` — Recipes API
- `src/app/api/categories/route.ts` — Categories API

## Execution Summary
- **Wave 1**: 2 builders in parallel (UI-1 + UI-3)
- **Wave 2**: 1 builder (UI-2)
- **Wave 3**: 1 builder (UI-4)
- **Total builders needed**: 4 (2 concurrent max)
