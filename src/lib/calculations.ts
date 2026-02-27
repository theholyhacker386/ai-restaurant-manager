/**
 * Core financial calculations for The Porch Health Park
 *
 * These are the formulas that power the dashboard - they turn raw numbers
 * into the insights Jennifer needs to make decisions.
 */

export interface MenuItemCost {
  menuItemId: string;
  name: string;
  sellingPrice: number;
  totalIngredientCost: number;
  foodCostPercentage: number;
  profitPerItem: number;
  status: "good" | "warning" | "danger";
  recommendation: string;
}

export interface DailyProfitLoss {
  date: string;
  revenue: number;
  cogs: number;          // cost of goods sold (ingredients)
  labor: number;
  overhead: number;
  netProfit: number;
  profitMargin: number;
  primeCost: number;
  primeCostPercentage: number;
}

/**
 * Calculate the cost breakdown for a menu item
 * This tells you: "Does this item make money or lose money?"
 */
export function calculateMenuItemCost(
  name: string,
  menuItemId: string,
  sellingPrice: number,
  ingredients: { costPerUnit: number; quantity: number }[]
): MenuItemCost {
  const totalIngredientCost = ingredients.reduce(
    (sum, ing) => sum + ing.costPerUnit * ing.quantity,
    0
  );

  const foodCostPercentage =
    sellingPrice > 0 ? (totalIngredientCost / sellingPrice) * 100 : 0;
  const profitPerItem = sellingPrice - totalIngredientCost;

  let status: "good" | "warning" | "danger";
  let recommendation: string;

  if (foodCostPercentage <= 30) {
    status = "good";
    recommendation = "This item is priced well. You're making good profit on it.";
  } else if (foodCostPercentage <= 35) {
    status = "warning";
    recommendation = `This item is borderline. Ingredients cost ${foodCostPercentage.toFixed(1)}% of the price. Try to get it under 30%.`;
  } else {
    status = "danger";
    const suggestedPrice = totalIngredientCost / 0.3; // Target 30% food cost
    recommendation = `This item is losing you money! Ingredients cost ${foodCostPercentage.toFixed(1)}% of the price. Consider raising the price to $${suggestedPrice.toFixed(2)} or finding cheaper ingredients.`;
  }

  return {
    menuItemId,
    name,
    sellingPrice,
    totalIngredientCost: Math.round(totalIngredientCost * 100) / 100,
    foodCostPercentage: Math.round(foodCostPercentage * 10) / 10,
    profitPerItem: Math.round(profitPerItem * 100) / 100,
    status,
    recommendation,
  };
}

/**
 * Calculate suggested menu price based on desired food cost percentage
 * The "multiplier method" - what profitable cafes use
 */
export function suggestPrice(
  ingredientCost: number,
  targetFoodCostPercent: number = 30
): number {
  if (targetFoodCostPercent <= 0) return 0;
  return Math.round((ingredientCost / (targetFoodCostPercent / 100)) * 100) / 100;
}

/**
 * Calculate daily profit/loss
 */
export function calculateDailyPL(
  date: string,
  revenue: number,
  cogs: number,
  labor: number,
  overhead: number
): DailyProfitLoss {
  const netProfit = revenue - cogs - labor - overhead;
  const profitMargin = revenue > 0 ? (netProfit / revenue) * 100 : 0;
  const primeCost = cogs + labor;
  const primeCostPercentage = revenue > 0 ? (primeCost / revenue) * 100 : 0;

  return {
    date,
    revenue: Math.round(revenue * 100) / 100,
    cogs: Math.round(cogs * 100) / 100,
    labor: Math.round(labor * 100) / 100,
    overhead: Math.round(overhead * 100) / 100,
    netProfit: Math.round(netProfit * 100) / 100,
    profitMargin: Math.round(profitMargin * 10) / 10,
    primeCost: Math.round(primeCost * 100) / 100,
    primeCostPercentage: Math.round(primeCostPercentage * 10) / 10,
  };
}

/**
 * Industry benchmark comparison
 * Compares your numbers against the 30/30/30/10 rule
 */
export function benchmarkAnalysis(
  annualRevenue: number,
  annualCogs: number,
  annualLabor: number,
  annualOverhead: number
) {
  const annualProfit = annualRevenue - annualCogs - annualLabor - annualOverhead;

  const cogsPercent = (annualCogs / annualRevenue) * 100;
  const laborPercent = (annualLabor / annualRevenue) * 100;
  const overheadPercent = (annualOverhead / annualRevenue) * 100;
  const profitPercent = (annualProfit / annualRevenue) * 100;
  const primeCostPercent = ((annualCogs + annualLabor) / annualRevenue) * 100;

  return {
    revenue: { amount: annualRevenue, percent: 100 },
    cogs: {
      amount: annualCogs,
      percent: Math.round(cogsPercent * 10) / 10,
      target: 30,
      status: cogsPercent <= 32 ? "good" : cogsPercent <= 35 ? "warning" : "danger",
    },
    labor: {
      amount: annualLabor,
      percent: Math.round(laborPercent * 10) / 10,
      target: 30,
      status: laborPercent <= 30 ? "good" : laborPercent <= 35 ? "warning" : "danger",
    },
    overhead: {
      amount: annualOverhead,
      percent: Math.round(overheadPercent * 10) / 10,
      target: 30,
      status: overheadPercent <= 30 ? "good" : overheadPercent <= 35 ? "warning" : "danger",
    },
    profit: {
      amount: Math.round(annualProfit * 100) / 100,
      percent: Math.round(profitPercent * 10) / 10,
      target: 10,
      status: profitPercent >= 15 ? "good" : profitPercent >= 10 ? "warning" : "danger",
    },
    primeCost: {
      amount: Math.round((annualCogs + annualLabor) * 100) / 100,
      percent: Math.round(primeCostPercent * 10) / 10,
      target: 60,
      status: primeCostPercent <= 60 ? "good" : primeCostPercent <= 65 ? "warning" : "danger",
    },
  };
}
