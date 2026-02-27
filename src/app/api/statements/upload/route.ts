import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { getDb } from "@/lib/db";
import { ensurePlaidTables } from "@/lib/plaid";
import { processAllQueued } from "@/lib/process-statement";
import { v4 as uuid } from "uuid";

// Allow up to 5 minutes for background processing after the response is sent
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();

    // Support both single "file" and multiple "files" fields
    const files: File[] = [];
    const singleFile = formData.get("file") as File | null;
    if (singleFile) {
      files.push(singleFile);
    }
    const multiFiles = formData.getAll("files") as File[];
    for (const f of multiFiles) {
      if (f instanceof File) files.push(f);
    }

    if (files.length === 0) {
      return NextResponse.json(
        { error: "No files provided" },
        { status: 400 }
      );
    }

    const sql = getDb();
    await ensurePlaidTables(sql);

    const savedStatements: { id: string; file_name: string; status: string }[] = [];
    const errors: { file_name: string; error: string }[] = [];

    for (const file of files) {
      // Validate it's a PDF
      if (
        file.type !== "application/pdf" &&
        !file.name.toLowerCase().endsWith(".pdf")
      ) {
        errors.push({ file_name: file.name, error: "Not a PDF file" });
        continue;
      }

      // Read file bytes and save as base64
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);
      const base64 = buffer.toString("base64");
      const statementId = uuid();

      // Save immediately with status "queued" — no AI processing yet
      await sql`
        INSERT INTO bank_statements (id, file_name, status, pdf_data)
        VALUES (${statementId}, ${file.name}, 'queued', ${base64})
      `;

      savedStatements.push({
        id: statementId,
        file_name: file.name,
        status: "queued",
      });
    }

    if (savedStatements.length === 0) {
      return NextResponse.json(
        { error: errors[0]?.error || "No valid PDF files provided" },
        { status: 400 }
      );
    }

    // Kick off background processing AFTER the response is sent
    // This uses Next.js 16's after() — the server stays alive to do the work
    after(async () => {
      try {
        await processAllQueued();
      } catch (err) {
        console.error("[upload] Background processing error:", err);
      }
    });

    // Return instantly — user sees their files are queued
    return NextResponse.json({
      statements: savedStatements,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error: unknown) {
    console.error("Error uploading statements:", error);
    const message =
      error instanceof Error ? error.message : "Failed to save statements";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
