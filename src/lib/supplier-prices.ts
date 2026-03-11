/**
 * Smart auto-price detection for suppliers.
 * Uses AI to check if a supplier's website has publicly accessible prices.
 */
import { neon } from "@neondatabase/serverless";
import { analyzeWebPage } from "@/lib/claude";

/* ── Known supplier URLs ─────────────────────────────── */

const KNOWN_URLS: Record<string, string> = {
  "walmart": "https://www.walmart.com/search?q=",
  "sam's club": "https://www.samsclub.com/s/",
  "costco": "https://www.costco.com/CatalogSearch?keyword=",
  "restaurant depot": "https://www.restaurantdepot.com",
  "sysco": "https://www.sysco.com",
  "us foods": "https://www.usfoods.com",
  "gordon food service": "https://www.gfs.com",
  "chef's warehouse": "https://www.chefswarehouse.com",
  "webstaurantstore": "https://www.webstaurantstore.com/search/",
};

/**
 * Check if a supplier has publicly accessible prices online.
 * Returns { autoFetchable, reason }.
 */
export async function checkSupplierWebsite(
  supplierName: string,
  websiteUrl?: string | null
): Promise<{ autoFetchable: boolean; reason: string }> {
  const sql = neon(process.env.NEON_DATABASE_URL!);
  const key = supplierName.toLowerCase();

  // Check the directory first — maybe we already know
  const existing = await sql`
    SELECT auto_fetchable, last_checked, check_result
    FROM supplier_directory
    WHERE LOWER(name) = ${key}
  `;

  if (existing.length > 0 && existing[0].last_checked) {
    const lastChecked = new Date(existing[0].last_checked);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // If checked within last 30 days, use cached result
    if (lastChecked > thirtyDaysAgo) {
      return {
        autoFetchable: existing[0].auto_fetchable === true,
        reason: existing[0].check_result || "cached",
      };
    }
  }

  // Determine URL to check
  let url = websiteUrl;
  if (!url) {
    url = KNOWN_URLS[key] || null;
    if (!url) {
      // Try a Google search as fallback
      url = `https://www.google.com/search?q=${encodeURIComponent(supplierName + " grocery supplier")}`;
    }
  }

  try {
    // Fetch the website
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      },
    });
    clearTimeout(timeout);

    if (!response.ok) {
      const reason = `Website returned ${response.status}`;
      await updateDirectory(sql, key, false, reason);
      return { autoFetchable: false, reason };
    }

    const html = await response.text();

    // Ask AI to check if there are public prices
    const analysis = await analyzeWebPage(
      html,
      `Does this website show product prices that are publicly accessible without logging in?
       Look for things like "$X.XX" price tags, shopping cart buttons, product listings with prices.
       Answer with a JSON object: {"hasPrices": true/false, "reason": "brief explanation"}
       If it requires login, membership, or account creation to see prices, hasPrices should be false.`
    );

    // Parse AI response
    let hasPrices = false;
    let reason = "Unknown";

    try {
      const jsonMatch = analysis.match(/\{[\s\S]*?"hasPrices"[\s\S]*?\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        hasPrices = parsed.hasPrices === true;
        reason = parsed.reason || "Checked by AI";
      }
    } catch {
      reason = "Could not parse AI response";
    }

    await updateDirectory(sql, key, hasPrices, reason);
    return { autoFetchable: hasPrices, reason };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Check failed";
    await updateDirectory(sql, key, false, reason);
    return { autoFetchable: false, reason };
  }
}

/**
 * Look up a specific ingredient price from a supplier's website.
 */
export async function lookupPrice(
  supplierName: string,
  ingredientName: string
): Promise<{ found: boolean; price?: number; unit?: string; productName?: string }> {
  const key = supplierName.toLowerCase();
  const searchUrl = KNOWN_URLS[key];

  if (!searchUrl) {
    return { found: false };
  }

  // Build search URL
  const url = searchUrl.includes("?")
    ? searchUrl + encodeURIComponent(ingredientName)
    : searchUrl + encodeURIComponent(ingredientName);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      },
    });
    clearTimeout(timeout);

    if (!response.ok) return { found: false };

    const html = await response.text();

    const analysis = await analyzeWebPage(
      html,
      `Find the price for "${ingredientName}" on this page.
       Look for the most relevant product match and its price.
       Answer with JSON: {"found": true/false, "price": 4.99, "unit": "32 oz", "productName": "Great Value Whole Milk 1 Gallon"}
       If no price found, return {"found": false}`
    );

    try {
      const jsonMatch = analysis.match(/\{[\s\S]*?"found"[\s\S]*?\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          found: parsed.found === true,
          price: parsed.price ? Number(parsed.price) : undefined,
          unit: parsed.unit,
          productName: parsed.productName,
        };
      }
    } catch { /* ignore parse errors */ }

    return { found: false };
  } catch {
    return { found: false };
  }
}

/**
 * Check multiple suppliers in batch with rate limiting.
 */
export async function checkMultipleSuppliers(
  suppliers: { name: string; websiteUrl?: string }[]
): Promise<Record<string, { autoFetchable: boolean; reason: string }>> {
  const results: Record<string, { autoFetchable: boolean; reason: string }> = {};
  const maxConcurrent = 3;
  const delayMs = 2000;

  // Process in batches
  for (let i = 0; i < suppliers.length; i += maxConcurrent) {
    const batch = suppliers.slice(i, i + maxConcurrent);

    const batchResults = await Promise.all(
      batch.map((s) => checkSupplierWebsite(s.name, s.websiteUrl))
    );

    batch.forEach((s, idx) => {
      results[s.name] = batchResults[idx];
    });

    // Delay between batches (but not after the last one)
    if (i + maxConcurrent < suppliers.length) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  return results;
}

/* ── Helper ──────────────────────────────────────────── */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function updateDirectory(
  sql: any,
  nameKey: string,
  autoFetchable: boolean,
  checkResult: string
) {
  try {
    await sql`
      UPDATE supplier_directory
      SET auto_fetchable = ${autoFetchable},
          last_checked = NOW(),
          check_result = ${checkResult}
      WHERE LOWER(name) = ${nameKey}
    `;
  } catch (e) {
    console.error("Failed to update supplier directory:", e);
  }
}
