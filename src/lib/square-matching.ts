// Known Square name → menu item name aliases (when names are completely different)
const SQUARE_NAME_ALIASES: Record<string, string> = {
  "brown sugar latte": "Brown Sugar Momma",
  "mocha latte": "Mocha",
  "doppio espresso": "Espresso",
  "avo-everything toast": "Avocado Toast",
  "white carmel latte": "White Sugar Daddy",
  "maple brown sugar latter": "Brown Sugar Momma",
  "2.0 nutty banana": "Nutty Banana 2.0 Smoothie",
  "curry chicken salad sandwich": "Chicken Curry Sandwich",
  "latte large ": "Latte (16oz)",
  "latte large": "Latte (16oz)",
  "pumpkin spice latte": "Spring Time Latte",
  "pumpkin spice iced cold brew": "Classic Cold Brew (16oz)",
  "pumpkin roll latte": "Spring Time Latte",
  "pumpkin roll iced cold brew": "Classic Cold Brew (16oz)",
  "pumpkin cold brew": "Classic Cold Brew (16oz)",
  "caramel apple iced cold brew": "Classic Cold Brew (16oz)",
  "smores iced cold brew": "Classic Cold Brew (16oz)",
  "nitro cold brew": "Classic Cold Brew (16oz)",
  "caramel macchiato": "Latte (16oz)",
  "carmel macchiato": "Latte (16oz)",
  "golden milk latte": "Golden Milk",
  "french press coffee": "French Press",
  "ethiopian french press (medium roast)": "French Press",
  "christmas in july peppermint mocha": "Mocha",
  "frosted gingerbread": "Mocha",
};

type MenuItem = { id: string; name: string; square_item_id: string | null };

// Match a Square item name to a menu item using multi-tier fuzzy matching
export function findMatchingMenuItem(
  squareName: string,
  squareItemId: string,
  menuItems: MenuItem[]
): MenuItem | undefined {
  // Tier 1: Exact match by Square catalog ID
  if (squareItemId) {
    const idMatch = menuItems.find((mi) => mi.square_item_id === squareItemId);
    if (idMatch) return idMatch;
  }

  // Skip items with no useful name
  const nameLower = squareName.toLowerCase().trim();
  if (!nameLower || nameLower === "unknown" || nameLower === "custom amount") {
    return undefined;
  }

  // Tier 2: Exact case-insensitive name match
  const exactMatch = menuItems.find(
    (mi) => mi.name.toLowerCase() === nameLower
  );
  if (exactMatch) return exactMatch;

  // Tier 3: Known aliases
  const alias = SQUARE_NAME_ALIASES[nameLower];
  if (alias) {
    const aliasMatch = menuItems.find(
      (mi) => mi.name.toLowerCase() === alias.toLowerCase()
    );
    if (aliasMatch) return aliasMatch;
  }

  // Tier 4: Name + size suffix (cold brews, lattes come without size from Square)
  for (const size of [
    "(16oz)",
    "(12oz)",
    "(20oz)",
    "(2oz)",
    "(19oz)",
    "(32oz)",
    "(76oz)",
  ]) {
    const withSize = menuItems.find(
      (mi) => mi.name.toLowerCase() === `${nameLower} ${size}`
    );
    if (withSize) return withSize;
  }

  // Tier 5: Remove "Sandwich" suffix and normalize hyphens
  if (nameLower.endsWith(" sandwich")) {
    const withoutSandwich = nameLower.replace(/ sandwich$/, "");
    const sandwichMatch = menuItems.find(
      (mi) => mi.name.toLowerCase() === withoutSandwich
    );
    if (sandwichMatch) return sandwichMatch;
    // Also try with hyphens replaced by spaces
    const normalized = withoutSandwich.replace(/-/g, " ");
    const normalizedMatch = menuItems.find(
      (mi) => mi.name.toLowerCase().replace(/-/g, " ") === normalized
    );
    if (normalizedMatch) return normalizedMatch;
  }

  // Tier 6: Remove "The " prefix
  if (nameLower.startsWith("the ")) {
    const withoutThe = nameLower.replace(/^the /, "");
    const theMatch = menuItems.find(
      (mi) => mi.name.toLowerCase() === withoutThe
    );
    if (theMatch) return theMatch;
  }

  // Tier 7: Kombucha flavors → generic Kombucha (16oz)
  if (nameLower.includes("kombucha")) {
    if (nameLower.includes("76oz") || nameLower.includes("64oz")) {
      return menuItems.find((mi) => mi.name === "Kombucha (76oz)");
    }
    if (nameLower.includes("32oz")) {
      return menuItems.find((mi) => mi.name === "Kombucha (32oz)");
    }
    if (nameLower.includes("12oz")) {
      return menuItems.find((mi) => mi.name === "Kombucha (12oz)");
    }
    return menuItems.find((mi) => mi.name === "Kombucha (16oz)");
  }

  // Tier 8: Shot variants → Immunity Shot (2oz)
  if (nameLower.endsWith(" shot") && !nameLower.includes("espresso")) {
    return menuItems.find((mi) => mi.name === "Immunity Shot (2oz)");
  }

  // Tier 9: Growler sizes → Kombucha by size
  if (nameLower.includes("growler")) {
    if (nameLower.includes("64") || nameLower.includes("76")) {
      return menuItems.find((mi) => mi.name === "Kombucha (76oz)");
    }
    if (nameLower.includes("32")) {
      return menuItems.find((mi) => mi.name === "Kombucha (32oz)");
    }
    if (nameLower.includes("16") || nameLower.includes("17")) {
      return menuItems.find((mi) => mi.name === "Kombucha (16oz)");
    }
  }

  // Tier 10: Partial match — menu item name starts with Square name
  const partialMatch = menuItems.find((mi) =>
    mi.name.toLowerCase().startsWith(nameLower + " ")
  );
  if (partialMatch) return partialMatch;

  return undefined;
}
