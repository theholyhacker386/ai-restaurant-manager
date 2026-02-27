/**
 * Fuzzy matching for receipt items against ingredient names.
 * Handles grocery store abbreviations like "GV BNLS CHKN BRST" → "Chicken Breast"
 */

// Common grocery receipt abbreviations
const ABBREVIATIONS: Record<string, string[]> = {
  // Proteins
  chkn: ["chicken"],
  chk: ["chicken"],
  bnls: ["boneless"],
  brst: ["breast"],
  grnd: ["ground"],
  bf: ["beef"],
  trky: ["turkey"],
  slmn: ["salmon"],
  shrmp: ["shrimp"],
  pork: ["pork"],

  // Produce
  tom: ["tomato", "tomatoes"],
  pot: ["potato", "potatoes"],
  onio: ["onion", "onions"],
  lttc: ["lettuce"],
  ppr: ["pepper", "peppers"],
  broc: ["broccoli"],
  spnch: ["spinach"],
  avcd: ["avocado"],
  strwb: ["strawberry", "strawberries"],
  bana: ["banana", "bananas"],
  blueb: ["blueberry", "blueberries"],

  // Dairy
  mlk: ["milk"],
  chs: ["cheese"],
  chse: ["cheese"],
  crm: ["cream"],
  btr: ["butter"],
  yog: ["yogurt"],
  ygrt: ["yogurt"],
  eg: ["egg", "eggs"],
  whip: ["whipping"],

  // General
  org: ["organic"],
  whl: ["whole"],
  frsh: ["fresh"],
  frzn: ["frozen"],
  lg: ["large"],
  sm: ["small"],
  med: ["medium"],
  pk: ["pack"],
  bg: ["bag"],
  ct: ["count"],
  gv: ["great value"],
  mm: ["members mark"],
  sv: ["sam's value"],
  ks: ["kirkland signature"],
  fl: ["fluid"],
  oz: ["ounce", "ounces"],
  lb: ["pound", "pounds"],
  gal: ["gallon"],
  gf: ["gluten free"],

  // Pantry
  sgr: ["sugar"],
  flr: ["flour"],
  rce: ["rice"],
  psta: ["pasta"],
  sce: ["sauce"],
  drsng: ["dressing"],
  rnch: ["ranch"],
  mayo: ["mayonnaise"],
  ketchp: ["ketchup"],
  mstrd: ["mustard"],
  oil: ["oil"],
  olv: ["olive"],
  vineg: ["vinegar"],
  vin: ["vinegar"],
  hny: ["honey"],
  pb: ["peanut butter"],
  jly: ["jelly"],
  brd: ["bread"],
  wg: ["whole grain"],
  ww: ["whole wheat"],
  mlt: ["multi"],
  mltigr: ["multigrain"],
  rstssre: ["rotisserie"],
  rotis: ["rotisserie"],

  // Brand name shortcuts
  dave: ["daves", "dave's"],
  daves: ["daves", "dave's"],
};

export interface MatchResult {
  ingredient_id: string;
  ingredient_name: string;
  confidence: number;
}

/**
 * Expand abbreviations in receipt text to full words.
 */
function expandAbbreviations(text: string): string {
  const words = text.toLowerCase().split(/\s+/);
  const expanded = words.map((word) => {
    const abbr = ABBREVIATIONS[word];
    if (abbr) return abbr[0];
    return word;
  });
  return expanded.join(" ");
}

/**
 * Stem a word to its base form for better matching.
 * "avocados" → "avocado", "bananas" → "banana", "gloves" → "glove"
 */
function stem(word: string): string {
  if (word.length <= 3) return word;
  // Remove trailing 's' for simple plurals (but not words like "glass", "dress")
  if (word.endsWith("es") && !word.endsWith("ss") && word.length > 4) {
    return word.slice(0, -1); // "gloves" → "glove", "oranges" → "orange"
  }
  if (word.endsWith("s") && !word.endsWith("ss") && !word.endsWith("us")) {
    return word.slice(0, -1); // "avocados" → "avocado", "bananas" → "banana"
  }
  return word;
}

/**
 * Check if two words match (exact, stemmed, or substring).
 * Returns match quality: 1.0 = exact/stem, 0.85 = substring
 */
function wordMatch(a: string, b: string): number {
  if (a === b) return 1;
  if (stem(a) === stem(b)) return 1;
  if (a.length >= 3 && b.length >= 3 && (a.includes(b) || b.includes(a))) return 0.85;
  return 0;
}

/**
 * Normalize a string for comparison: lowercase, remove special chars, expand abbreviations.
 */
function normalize(text: string): string {
  // Remove common receipt prefixes (brand codes, item numbers)
  let cleaned = text
    .replace(/^\d+\s+/, "") // leading item numbers
    .replace(/\b\d+(\.\d+)?\s*(oz|lb|ct|pk|gal|fl)\b/gi, "") // size info with units
    .replace(/\b\d{1,6}\s*\/\s*case\b/gi, "") // "1,000/Case" patterns
    .replace(/[^a-zA-Z0-9\s]/g, " ") // special chars → spaces
    .replace(/\b\d{1,5}\b/g, "") // standalone product codes (numbers without units)
    .replace(/\s+/g, " ")
    .trim();

  return expandAbbreviations(cleaned);
}

/**
 * Common filler words on receipts that don't help identify the product.
 * These get stripped before matching so "Noble powder free disposable
 * clear metal thick vinyl gloves" matches "vinyl gloves" easily.
 */
const FILLER_WORDS = new Set([
  "free", "powder", "disposable", "clear", "thick", "thin", "premium",
  "natural", "original", "classic", "style", "grade", "quality", "brand",
  "select", "choice", "fancy", "extra", "super", "ultra", "deluxe",
  "regular", "standard", "professional", "commercial", "heavy", "duty",
  "light", "lite", "diet", "low", "high", "new", "improved", "pure",
  "real", "made", "with", "and", "the", "for", "from", "all", "purpose",
  "noble", "foodservice", "food", "service", "restaurant", "bulk",
  "value", "metal", "plastic", "paper", "assorted", "variety",
  // Qualifiers that appear in ingredient names — strip to match core product
  "fresh", "frozen", "organic", "whole", "raw", "dried", "canned",
  // Store/receipt codes that aren't product names
  "lrw", "mrw", "case", "each", "unit", "units", "per", "box",
  // Size/packaging descriptors
  "large", "small", "medium", "mini", "jumbo", "wide", "pan",
  // Common receipt noise
  "flavoring", "flavored", "flav",
  // Gluten free — GF expands but doesn't help matching
  "gluten",
]);

/**
 * Calculate similarity between two strings (0-1).
 * Uses word overlap, ingredient containment, and filler-word stripping.
 *
 * Key insight: receipt descriptions are verbose ("Noble powder free
 * disposable clear metal thick vinyl gloves") but ingredient names are
 * short ("vinyl gloves"). If every word of the ingredient appears in
 * the receipt, that's a strong match regardless of extra words.
 */
function similarity(a: string, b: string): number {
  const normA = normalize(a);
  const normB = normalize(b);

  if (normA === normB) return 1;

  const wordsA = normA.split(" ").filter((w) => w.length > 1);
  const wordsB = normB.split(" ").filter((w) => w.length > 1);

  if (wordsA.length === 0 || wordsB.length === 0) return 0;

  // Figure out which is the receipt (longer) and which is the ingredient (shorter)
  const [receiptWords, ingredientWords] =
    wordsA.length >= wordsB.length ? [wordsA, wordsB] : [wordsB, wordsA];

  // Check how many ingredient words appear in the receipt
  let ingredientHits = 0;
  for (const iWord of ingredientWords) {
    let bestHit = 0;
    for (const rWord of receiptWords) {
      const m = wordMatch(iWord, rWord);
      if (m > bestHit) bestHit = m;
      if (bestHit === 1) break;
    }
    ingredientHits += bestHit;
  }

  // If ALL ingredient words are found in the receipt → strong match
  const ingredientCoverage = ingredientHits / ingredientWords.length;
  if (ingredientCoverage >= 0.95) {
    // Full containment: score 0.85-0.95 depending on how precise the match is
    // (fewer extra words = higher score)
    const extraRatio = ingredientWords.length / receiptWords.length;
    return Math.min(1, 0.85 + extraRatio * 0.15);
  }

  // Standard word overlap (both directions)
  let matchCount = 0;
  const setA = new Set(wordsA);
  const setB = new Set(wordsB);
  for (const word of setA) {
    let bestHit = 0;
    for (const bWord of setB) {
      const m = wordMatch(word, bWord);
      if (m > bestHit) bestHit = m > 0.85 ? m : m * 0.82;
      if (bestHit >= 1) break;
    }
    matchCount += bestHit;
  }

  const overlapScore =
    (2 * matchCount) / (setA.size + setB.size);

  // Strip filler words and re-check — "noble powder free vinyl gloves"
  // without fillers becomes "vinyl gloves", which matches perfectly
  const coreA = wordsA.filter((w) => !FILLER_WORDS.has(w));
  const coreB = wordsB.filter((w) => !FILLER_WORDS.has(w));
  if (coreA.length > 0 && coreB.length > 0) {
    const [coreLong, coreShort] =
      coreA.length >= coreB.length ? [coreA, coreB] : [coreB, coreA];
    let coreHits = 0;
    for (const sw of coreShort) {
      let bestHit = 0;
      for (const lw of coreLong) {
        const m = wordMatch(sw, lw);
        if (m > bestHit) bestHit = m;
        if (bestHit >= 1) break;
      }
      coreHits += bestHit;
    }
    const coreCoverage = coreHits / coreShort.length;
    if (coreCoverage >= 0.95) {
      const coreRatio = coreShort.length / coreLong.length;
      const coreScore = 0.82 + coreRatio * 0.15;
      return Math.min(1, Math.max(overlapScore, coreScore));
    }
  }

  // Substring containment bonus
  let containsBonus = 0;
  if (normA.includes(normB) || normB.includes(normA)) {
    containsBonus = 0.3;
  }

  return Math.min(1, overlapScore + containsBonus);
}

/**
 * Find the best matching ingredient for a receipt item name.
 * Returns null if no match meets the minimum confidence threshold.
 */
export function findBestMatch(
  rawName: string,
  ingredients: { id: string; name: string }[],
  minConfidence: number = 0.3
): MatchResult | null {
  let bestMatch: MatchResult | null = null;

  for (const ing of ingredients) {
    const score = similarity(rawName, ing.name);
    if (score >= minConfidence && (!bestMatch || score > bestMatch.confidence)) {
      bestMatch = {
        ingredient_id: ing.id,
        ingredient_name: ing.name,
        confidence: Math.round(score * 100) / 100,
      };
    }
  }

  return bestMatch;
}

/**
 * Match all receipt items against the ingredient list.
 */
export function matchReceiptItems(
  items: { id: string; raw_name: string }[],
  ingredients: { id: string; name: string }[]
): Map<string, MatchResult | null> {
  const results = new Map<string, MatchResult | null>();

  for (const item of items) {
    results.set(item.id, findBestMatch(item.raw_name, ingredients));
  }

  return results;
}
