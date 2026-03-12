/**
 * Smart Price Engine — automatically finds ingredient prices from supplier websites.
 *
 * Strategy:
 * 1. Direct store search — go to the store's website, search for the item, AI reads the price
 * 2. Web search fallback — search the web (like Googling it) and AI extracts the price
 * 3. Cache results — store prices in the database so we don't re-fetch constantly
 *
 * Receipts are a LAST RESORT, not the default.
 */
import { neon } from "@neondatabase/serverless";
import { analyzeWebPage } from "@/lib/claude";

/* eslint-disable @typescript-eslint/no-explicit-any */

/* ── Known Supplier Search URLs ───────────────────────── */

const STORE_SEARCH_URLS: Record<string, { url: string; searchable: boolean }> = {
  "walmart":             { url: "https://www.walmart.com/search?q=", searchable: true },
  "sam's club":          { url: "https://www.samsclub.com/s/", searchable: true },
  "costco":              { url: "https://www.costco.com/CatalogSearch?keyword=", searchable: true },
  "webstaurantstore":    { url: "https://www.webstaurantstore.com/search/", searchable: true },
  "barista underground":  { url: "https://baristaunderground.com/?s=", searchable: true },
  "restaurant depot":    { url: "https://www.restaurantdepot.com", searchable: false },
  "sysco":               { url: "https://www.sysco.com", searchable: false },
  "us foods":            { url: "https://www.usfoods.com", searchable: false },
  "gordon food service": { url: "https://www.gfs.com/en-us/search#query=", searchable: true },
  "chef's warehouse":    { url: "https://www.chefswarehouse.com", searchable: false },
  "amazon":              { url: "https://www.amazon.com/s?k=", searchable: true },
  "target":              { url: "https://www.target.com/s?searchTerm=", searchable: true },
  "kroger":              { url: "https://www.kroger.com/search?query=", searchable: true },
  "aldi":                { url: "https://www.aldi.us/search/?q=", searchable: true },
  "food lion":           { url: "https://www.foodlion.com/search/?search=", searchable: true },
};

/* ── Price Cache Table ────────────────────────────────── */

/**
 * Ensure the price_cache table exists.
 * Stores looked-up prices with a 7-day TTL.
 */
async function ensurePriceCacheTable(sql: any) {
  await sql`
    CREATE TABLE IF NOT EXISTS ingredient_price_cache (
      id SERIAL PRIMARY KEY,
      ingredient_name TEXT NOT NULL,
      supplier_name TEXT NOT NULL,
      product_name TEXT,
      price NUMERIC(10,2),
      unit TEXT,
      source_url TEXT,
      fetched_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(ingredient_name, supplier_name)
    )
  `;
}

/* ── Core: Look Up a Price ────────────────────────────── */

export interface PriceLookupResult {
  found: boolean;
  price?: number;
  unit?: string;
  productName?: string;
  supplier?: string;
  source?: "direct" | "web_search" | "cache";
}

/**
 * Look up the price of an ingredient at a specific supplier.
 * Tries: cache → direct store search → web search fallback.
 */
export async function lookupPrice(
  ingredientName: string,
  supplierName: string
): Promise<PriceLookupResult> {
  const sql = neon(process.env.NEON_DATABASE_URL!);

  // 1. Check cache first (prices less than 7 days old)
  try {
    const cached = await sql`
      SELECT price, unit, product_name FROM ingredient_price_cache
      WHERE LOWER(ingredient_name) = ${ingredientName.toLowerCase()}
        AND LOWER(supplier_name) = ${supplierName.toLowerCase()}
        AND fetched_at > NOW() - INTERVAL '7 days'
    `;
    if (cached.length > 0 && cached[0].price) {
      return {
        found: true,
        price: Number(cached[0].price),
        unit: cached[0].unit || undefined,
        productName: cached[0].product_name || undefined,
        supplier: supplierName,
        source: "cache",
      };
    }
  } catch { /* cache table might not exist yet */ }

  // 2. Try direct store search
  const directResult = await searchStoreDirect(ingredientName, supplierName);
  if (directResult.found) {
    await cachePrice(sql, ingredientName, supplierName, directResult);
    return { ...directResult, source: "direct" };
  }

  // 3. Fall back to web search
  const webResult = await searchWeb(ingredientName, supplierName);
  if (webResult.found) {
    await cachePrice(sql, ingredientName, supplierName, webResult);
    return { ...webResult, source: "web_search" };
  }

  return { found: false, supplier: supplierName };
}

/**
 * Look up prices for one ingredient across ALL given suppliers.
 * Returns the best matches found.
 */
export async function lookupPriceAllSuppliers(
  ingredientName: string,
  suppliers: string[]
): Promise<PriceLookupResult[]> {
  const results: PriceLookupResult[] = [];

  // Process 2 suppliers at a time to avoid rate limits
  for (let i = 0; i < suppliers.length; i += 2) {
    const batch = suppliers.slice(i, i + 2);
    const batchResults = await Promise.all(
      batch.map((s) => lookupPrice(ingredientName, s))
    );
    results.push(...batchResults);

    // Small delay between batches
    if (i + 2 < suppliers.length) {
      await new Promise((r) => setTimeout(r, 1500));
    }
  }

  return results;
}

/**
 * Bulk lookup: many ingredients across many suppliers.
 * This is what runs during onboarding and weekly updates.
 */
export async function bulkPriceLookup(
  ingredients: string[],
  suppliers: string[]
): Promise<Record<string, PriceLookupResult[]>> {
  const results: Record<string, PriceLookupResult[]> = {};

  for (const ingredient of ingredients) {
    results[ingredient] = await lookupPriceAllSuppliers(ingredient, suppliers);
    // Delay between ingredients to be respectful
    await new Promise((r) => setTimeout(r, 1000));
  }

  return results;
}

/* ── Strategy 1: Direct Store Search ──────────────────── */

async function searchStoreDirect(
  ingredientName: string,
  supplierName: string
): Promise<PriceLookupResult> {
  const key = supplierName.toLowerCase();
  const store = STORE_SEARCH_URLS[key];

  if (!store || !store.searchable) {
    return { found: false, supplier: supplierName };
  }

  const searchUrl = store.url + encodeURIComponent(ingredientName);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);

    const response = await fetch(searchUrl, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    clearTimeout(timeout);

    if (!response.ok) return { found: false, supplier: supplierName };

    const html = await response.text();

    // If page is too small, it's probably a redirect or block page
    if (html.length < 1000) return { found: false, supplier: supplierName };

    // Have AI read the page and find the price — LOCKED to this specific supplier
    const analysis = await analyzeWebPage(
      html,
      `I'm looking for "${ingredientName}" on this ${supplierName} product search results page.

This page is from ${supplierName}'s own website, so all prices here are from ${supplierName}.

Find the MOST RELEVANT product match and its price. Look for:
- Product names that match or closely relate to "${ingredientName}"
- Dollar prices (like $4.99, $12.49)
- Package sizes (like 1 gallon, 32 oz, 5 lb)
- Price-per-unit if available

Return ONLY a JSON object, nothing else:
{"found": true, "price": 4.99, "unit": "1 gallon", "productName": "Great Value Whole Milk"}

If you cannot find a relevant product or price, return:
{"found": false}

IMPORTANT: Only return a price if you're confident it's correct. Don't guess.`
    );

    return parseAIResponse(analysis, supplierName);
  } catch {
    return { found: false, supplier: supplierName };
  }
}

/* ── Strategy 2: Web Search Fallback ──────────────────── */

async function searchWeb(
  ingredientName: string,
  supplierName: string
): Promise<PriceLookupResult> {
  // Use Brave Search API if available, otherwise use a direct Google-like approach
  const braveKey = process.env.BRAVE_SEARCH_API_KEY;

  if (braveKey) {
    return searchBrave(ingredientName, supplierName, braveKey);
  }

  // Fallback: try fetching from a general search
  return searchDirect(ingredientName, supplierName);
}

/**
 * Search using Brave Search API (free tier: 2000 queries/month).
 */
async function searchBrave(
  ingredientName: string,
  supplierName: string,
  apiKey: string
): Promise<PriceLookupResult> {
  try {
    // Search specifically on the supplier's site when possible
    const supplierDomain = getSupplierDomain(supplierName);
    const siteFilter = supplierDomain ? `site:${supplierDomain} ` : `"${supplierName}" `;
    const query = `${siteFilter}${ingredientName} price`;
    const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=5`;

    const response = await fetch(url, {
      headers: {
        "Accept": "application/json",
        "Accept-Encoding": "gzip",
        "X-Subscription-Token": apiKey,
      },
    });

    if (!response.ok) return { found: false, supplier: supplierName };

    const data = await response.json();
    const results = data.web?.results || [];

    if (results.length === 0) return { found: false, supplier: supplierName };

    // Filter results to only include ones from the supplier's actual domain
    const filteredResults = supplierDomain
      ? results.filter((r: any) => r.url?.toLowerCase().includes(supplierDomain))
      : results;

    // If no results from the actual supplier domain, this search failed
    if (filteredResults.length === 0) return { found: false, supplier: supplierName };

    // Build a text summary of search results for AI to read
    const searchSummary = filteredResults.map((r: any) =>
      `Title: ${r.title}\nURL: ${r.url}\nSnippet: ${r.description}`
    ).join("\n\n");

    const analysis = await analyzeWebPage(
      searchSummary,
      `From these search results, find the current price of "${ingredientName}" SOLD BY ${supplierName}.

CRITICAL RULES:
- ONLY return a price if it is from ${supplierName}'s own website or listing
- Do NOT return prices from other stores or suppliers — even if they sell the same item
- The price MUST be from ${supplierName} specifically
- If you see prices from other retailers, IGNORE them completely

Look for dollar amounts ($X.XX) in the snippets and titles.
Return ONLY a JSON object:
{"found": true, "price": 4.99, "unit": "1 gallon", "productName": "Whole Milk 1 Gallon"}

If no clear ${supplierName} price is found, return: {"found": false}
Only return a price you're confident is from ${supplierName}.`
    );

    return parseAIResponse(analysis, supplierName);
  } catch {
    return { found: false, supplier: supplierName };
  }
}

/**
 * Fallback search using DuckDuckGo lite (no API key needed).
 */
async function searchDirect(
  ingredientName: string,
  supplierName: string
): Promise<PriceLookupResult> {
  try {
    // Search specifically on the supplier's site when possible
    const supplierDomain = getSupplierDomain(supplierName);
    const siteFilter = supplierDomain ? `site:${supplierDomain} ` : `"${supplierName}" `;
    const query = `${siteFilter}${ingredientName} price`;
    const url = `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      },
    });
    clearTimeout(timeout);

    if (!response.ok) return { found: false, supplier: supplierName };

    const html = await response.text();

    const analysis = await analyzeWebPage(
      html,
      `From these search results, find the current price of "${ingredientName}" SOLD BY ${supplierName}.

CRITICAL RULES:
- ONLY return a price if it is from ${supplierName}'s own website or listing
- Do NOT return prices from other stores or suppliers — even if they sell the same item
- The price MUST be from ${supplierName} specifically
- If you see prices from other retailers, IGNORE them completely

Look for dollar amounts ($X.XX) and product descriptions.
Return ONLY a JSON object:
{"found": true, "price": 4.99, "unit": "1 gallon", "productName": "Whole Milk"}

If no clear ${supplierName} price is found, return: {"found": false}
Only return a price you're confident is from ${supplierName}.`
    );

    return parseAIResponse(analysis, supplierName);
  } catch {
    return { found: false, supplier: supplierName };
  }
}

/* ── Check if a supplier has public prices ────────────── */

export async function checkSupplierWebsite(
  supplierName: string,
  websiteUrl?: string | null
): Promise<{ autoFetchable: boolean; reason: string }> {
  const sql = neon(process.env.NEON_DATABASE_URL!);
  const key = supplierName.toLowerCase();

  // Check cached result
  const existing = await sql`
    SELECT auto_fetchable, last_checked, check_result
    FROM supplier_directory
    WHERE LOWER(name) = ${key}
  `;

  if (existing.length > 0 && existing[0].last_checked) {
    const lastChecked = new Date(existing[0].last_checked);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    if (lastChecked > thirtyDaysAgo) {
      return {
        autoFetchable: existing[0].auto_fetchable === true,
        reason: existing[0].check_result || "cached",
      };
    }
  }

  // Test by searching for a common item (milk)
  const testResult = await lookupPrice("whole milk", supplierName);
  const autoFetchable = testResult.found;
  const reason = autoFetchable
    ? `Prices found (tested with "whole milk": $${testResult.price})`
    : "Could not find public prices";

  // Update directory
  try {
    await sql`
      UPDATE supplier_directory
      SET auto_fetchable = ${autoFetchable},
          last_checked = NOW(),
          check_result = ${reason}
      WHERE LOWER(name) = ${key}
    `;
  } catch { /* ignore */ }

  return { autoFetchable, reason };
}

/**
 * Check multiple suppliers in batch.
 */
export async function checkMultipleSuppliers(
  suppliers: { name: string; websiteUrl?: string }[]
): Promise<Record<string, { autoFetchable: boolean; reason: string }>> {
  const results: Record<string, { autoFetchable: boolean; reason: string }> = {};

  for (const s of suppliers) {
    results[s.name] = await checkSupplierWebsite(s.name, s.websiteUrl);
    await new Promise((r) => setTimeout(r, 2000));
  }

  return results;
}

/* ── Helpers ──────────────────────────────────────────── */

/**
 * Map supplier names to their known website domains.
 * Used to filter web search results to ONLY the supplier's own site.
 */
function getSupplierDomain(supplierName: string): string | null {
  const domainMap: Record<string, string> = {
    "walmart": "walmart.com",
    "sam's club": "samsclub.com",
    "costco": "costco.com",
    "webstaurantstore": "webstaurantstore.com",
    "barista underground": "baristaunderground.com",
    "restaurant depot": "restaurantdepot.com",
    "sysco": "sysco.com",
    "us foods": "usfoods.com",
    "gordon food service": "gfs.com",
    "chef's warehouse": "chefswarehouse.com",
    "amazon": "amazon.com",
    "target": "target.com",
    "kroger": "kroger.com",
    "aldi": "aldi.us",
    "food lion": "foodlion.com",
  };
  return domainMap[supplierName.toLowerCase()] || null;
}

function parseAIResponse(analysis: string, supplierName: string): PriceLookupResult {
  try {
    const jsonMatch = analysis.match(/\{[\s\S]*?"found"[\s\S]*?\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.found === true && parsed.price) {
        return {
          found: true,
          price: Number(parsed.price),
          unit: parsed.unit || undefined,
          productName: parsed.productName || undefined,
          supplier: supplierName,
        };
      }
    }
  } catch { /* ignore parse errors */ }
  return { found: false, supplier: supplierName };
}

async function cachePrice(
  sql: any,
  ingredientName: string,
  supplierName: string,
  result: PriceLookupResult
) {
  try {
    await ensurePriceCacheTable(sql);
    await sql`
      INSERT INTO ingredient_price_cache (ingredient_name, supplier_name, product_name, price, unit)
      VALUES (${ingredientName}, ${supplierName}, ${result.productName || null}, ${result.price || null}, ${result.unit || null})
      ON CONFLICT (ingredient_name, supplier_name) DO UPDATE SET
        product_name = EXCLUDED.product_name,
        price = EXCLUDED.price,
        unit = EXCLUDED.unit,
        fetched_at = NOW()
    `;
  } catch { /* caching is non-critical */ }
}
