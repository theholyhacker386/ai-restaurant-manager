/**
 * Convert a size from one unit to another.
 * Example: 2 lb -> 32 oz, 1 gal -> 128 fl oz
 * Returns null if the conversion is impossible (incompatible unit types).
 * Returns the converted size if successful.
 */
export function convertToBaseUnit(
  size: number,
  fromUnit: string,
  toUnit: string
): number | null {
  const from = fromUnit.toLowerCase().trim();
  const to = toUnit.toLowerCase().trim();

  // Same unit — no conversion needed
  if (from === to) return size;

  // Normalize common aliases
  const normalize = (u: string) => {
    if (u === "pound" || u === "pounds" || u === "lbs") return "lb";
    if (u === "ounce" || u === "ounces") return "oz";
    if (u === "gallon" || u === "gallons") return "gal";
    if (u === "quart" || u === "quarts") return "qt";
    if (u === "count" || u === "ct" || u === "ea") return "each";
    if (u === "fluid oz" || u === "fluid ounce") return "fl oz";
    return u;
  };

  const f = normalize(from);
  const t = normalize(to);
  if (f === t) return size;

  // Weight conversions
  const WEIGHT = new Set(["lb", "oz", "kg", "g"]);
  // Volume conversions
  const VOLUME = new Set(["gal", "qt", "fl oz"]);
  // Count-based — can't convert to/from weight or volume
  const COUNT = new Set(["each", "loaf", "bag", "box", "pack", "can", "bottle"]);

  // If one is count and the other is weight/volume (or vice versa), conversion is impossible
  const fIsCount = COUNT.has(f);
  const tIsCount = COUNT.has(t);
  const fIsWeight = WEIGHT.has(f);
  const tIsWeight = WEIGHT.has(t);
  const fIsVolume = VOLUME.has(f);
  const tIsVolume = VOLUME.has(t);

  // Can't convert between different measurement types
  if (fIsCount !== tIsCount) return null; // count ↔ weight/volume = impossible
  if (fIsWeight && tIsVolume) return null; // weight ↔ volume = impossible
  if (fIsVolume && tIsWeight) return null; // volume ↔ weight = impossible

  // Weight conversions
  if (f === "lb" && t === "oz") return size * 16;
  if (f === "oz" && t === "lb") return size / 16;
  if (f === "kg" && t === "oz") return size * 35.274;
  if (f === "kg" && t === "lb") return size * 2.205;
  if (f === "g" && t === "oz") return size / 28.35;
  if (f === "g" && t === "lb") return size / 453.6;
  if (f === "lb" && t === "kg") return size / 2.205;
  if (f === "oz" && t === "kg") return size / 35.274;
  if (f === "lb" && t === "g") return size * 453.6;
  if (f === "oz" && t === "g") return size * 28.35;
  if (f === "g" && t === "kg") return size / 1000;
  if (f === "kg" && t === "g") return size * 1000;

  // Volume conversions
  if (f === "gal" && (t === "fl oz" || t === "oz")) return size * 128;
  if ((f === "fl oz" || f === "oz") && t === "gal") return size / 128;
  if (f === "gal" && t === "qt") return size * 4;
  if (f === "qt" && t === "gal") return size / 4;
  if (f === "qt" && (t === "fl oz" || t === "oz")) return size * 32;
  if ((f === "fl oz" || f === "oz") && t === "qt") return size / 32;

  // Two count-based units we don't know how to convert (e.g., "loaf" to "bag") — impossible
  if (fIsCount && tIsCount && f !== t) return null;

  // Unknown conversion
  return null;
}
