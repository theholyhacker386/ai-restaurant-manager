# FIX-2: Receipt Scanner Filesystem Error on Vercel

AGENT_ROLE: builder
PROJECT: porch-financial

## Task
Fix the receipt scanner crash: `ENOENT: no such file or directory, mkdir '/var/task/data/receipts'`. Vercel serverless functions have a read-only filesystem. The receipt scan route writes images to disk with `fs.writeFileSync`, and the image-serving route reads them with `fs.readFileSync`. Both must be changed to use database storage instead.

## Root Cause
`src/app/api/receipts/scan/route.ts` (lines 26-34) calls `fs.mkdirSync` and `fs.writeFileSync` to save receipt images to `data/receipts/` on the local filesystem. Vercel serverless functions cannot write to the filesystem.

`src/app/api/receipts/image/route.ts` (lines 27-36) calls `fs.readFileSync` to serve those images back. Even if the write worked, the files wouldn't persist between serverless invocations.

## Context
- Relevant files:
  - `src/app/api/receipts/scan/route.ts` — Receipt upload & AI extraction (the broken write)
  - `src/app/api/receipts/image/route.ts` — Image serving endpoint (the broken read)
  - `src/lib/db.ts` — Database schema (needs `image_data` and `image_mime_type` columns on `receipts` table)
  - `src/app/receipts/[id]/page.tsx` — Receipt detail page (may reference image_path)
  - `src/app/receipts/[id]/review/page.tsx` — Receipt review page
- Spec: `.project/architect/features/demo-fixes.md`
- **NOTE:** This fix depends on FIX-3 (database migration to Neon). If FIX-3 is done first, the schema changes here should be made in Neon/Postgres. If working before FIX-3, make the changes in the SQLite schema for now.

## Implementation Plan

### Step 1: Add database columns for image storage
In the `receipts` table schema (defined in `src/lib/db.ts` `initializeDb` function, around line 137-148), add two columns:
- `image_data TEXT` — stores base64-encoded image data
- `image_mime_type TEXT DEFAULT 'image/jpeg'` — stores the MIME type

If modifying SQLite, use `ALTER TABLE IF NOT EXISTS` or add to the CREATE TABLE. If on Neon/Postgres, run a migration.

### Step 2: Modify the scan endpoint to store images in DB
In `src/app/api/receipts/scan/route.ts`:

1. **Remove** the filesystem imports and writes:
   - Remove `import fs from "fs"` and `import path from "path"`
   - Remove lines 26-34 (the `receiptsDir`, `mkdirSync`, `writeFileSync` block)
   - Remove the `relativePath` variable

2. **Store base64 in the database** instead. The code already converts to base64 on line 39 (`const base64 = buffer.toString("base64")`). Use this value:

```ts
// In the INSERT statement, add image_data and image_mime_type
db.prepare(
  `INSERT INTO receipts (id, supplier, receipt_date, subtotal, tax, total, image_data, image_mime_type, status)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')`
).run(
  receiptId,
  extracted.supplier || null,
  extracted.receipt_date || null,
  extracted.subtotal || 0,
  extracted.tax || 0,
  extracted.total || 0,
  base64,
  mimeType
);
```

3. Remove the old `image_path` from the INSERT (or set it to null for backward compat).

### Step 3: Modify the image endpoint to read from DB
Rewrite `src/app/api/receipts/image/route.ts`:

1. **Remove** `import fs from "fs"` and `import path from "path"`
2. **Add** `import { getDb } from "@/lib/db"`
3. Change the GET handler to:
   - Accept a `receiptId` query parameter (instead of `path`)
   - Query the database: `SELECT image_data, image_mime_type FROM receipts WHERE id = ?`
   - Convert base64 back to a Buffer and return it with the correct Content-Type

```ts
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const receiptId = searchParams.get("id");
    if (!receiptId) {
      return NextResponse.json({ error: "No receipt ID provided" }, { status: 400 });
    }

    const db = getDb();
    const receipt = db.prepare(
      "SELECT image_data, image_mime_type FROM receipts WHERE id = ?"
    ).get(receiptId) as { image_data: string; image_mime_type: string } | undefined;

    if (!receipt || !receipt.image_data) {
      return NextResponse.json({ error: "Image not found" }, { status: 404 });
    }

    const buffer = Buffer.from(receipt.image_data, "base64");
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": receipt.image_mime_type || "image/jpeg",
        "Cache-Control": "private, max-age=86400",
      },
    });
  } catch (error) {
    console.error("Error serving receipt image:", error);
    return NextResponse.json({ error: "Failed to serve image" }, { status: 500 });
  }
}
```

### Step 4: Update any frontend references to the image endpoint
Search for any component that calls `/api/receipts/image?path=...` and change it to `/api/receipts/image?id=RECEIPT_ID`. Check:
- `src/app/receipts/[id]/page.tsx`
- `src/app/receipts/[id]/review/page.tsx`
- Any other page that displays receipt images

### Step 5: Clean up
- Remove the `data/receipts/` directory reference from `.gitignore` if present
- Ensure no other code references `image_path` for filesystem reads

## Acceptance Criteria
- [ ] Receipt scanning works on Vercel without any filesystem errors
- [ ] Uploaded receipt images are stored as base64 in the `receipts` table
- [ ] The image endpoint (`/api/receipts/image`) serves images from the database
- [ ] No `fs.writeFileSync`, `fs.readFileSync`, or `fs.mkdirSync` calls remain in receipt routes
- [ ] Receipt images display correctly on the receipt detail and review pages
- [ ] The `fs` and `path` imports are removed from both receipt route files
