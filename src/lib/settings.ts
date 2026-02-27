import { getDb } from "./db";

export interface BusinessSettings {
  food_cost_target: number;
  food_cost_warning: number;
  rplh_target: number;
  max_staff: number;
  min_shift_hours: number;
  labor_cost_target: number;
  employer_burden_rate: number;
  business_hours: Record<string, { open: string; close: string } | null>;
}

const DEFAULTS: BusinessSettings = {
  food_cost_target: 30,
  food_cost_warning: 35,
  rplh_target: 50,
  max_staff: 3,
  min_shift_hours: 4,
  labor_cost_target: 28,
  employer_burden_rate: 12,
  business_hours: {
    "0": { open: "12:00", close: "17:00" },
    "1": null,
    "2": { open: "08:00", close: "18:00" },
    "3": { open: "08:00", close: "18:00" },
    "4": { open: "08:00", close: "18:00" },
    "5": { open: "08:00", close: "18:00" },
    "6": { open: "08:00", close: "18:00" },
  },
};

export async function getSettings(restaurantId?: string): Promise<BusinessSettings> {
  try {
    const sql = getDb();
    const rows = restaurantId
      ? await sql`SELECT * FROM business_settings WHERE restaurant_id = ${restaurantId}`
      : await sql`SELECT * FROM business_settings WHERE id = 'default'`;
    if (rows.length === 0) return DEFAULTS;

    const row = rows[0];
    return {
      food_cost_target: Number(row.food_cost_target) || DEFAULTS.food_cost_target,
      food_cost_warning: Number(row.food_cost_warning) || DEFAULTS.food_cost_warning,
      rplh_target: Number(row.rplh_target) || DEFAULTS.rplh_target,
      max_staff: Number(row.max_staff) || DEFAULTS.max_staff,
      min_shift_hours: Number(row.min_shift_hours) || DEFAULTS.min_shift_hours,
      labor_cost_target: Number(row.labor_cost_target) || DEFAULTS.labor_cost_target,
      employer_burden_rate: Number(row.employer_burden_rate) || DEFAULTS.employer_burden_rate,
      business_hours: (typeof row.business_hours === "string"
        ? JSON.parse(row.business_hours)
        : row.business_hours) || DEFAULTS.business_hours,
    };
  } catch {
    return DEFAULTS;
  }
}

export { DEFAULTS as DEFAULT_SETTINGS };
