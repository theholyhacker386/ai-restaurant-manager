import { SquareClient, SquareEnvironment } from "square";

/**
 * Business hours for The Porch (from Square location settings).
 * Times are in local Eastern time. Closed on Monday.
 */
export const BUSINESS_HOURS: Record<number, { open: string; close: string } | null> = {
  0: { open: "12:00", close: "17:00" },  // Sunday  12pm-5pm
  1: null,                                // Monday  (closed)
  2: { open: "08:00", close: "18:00" },  // Tuesday  8am-6pm
  3: { open: "08:00", close: "18:00" },  // Wednesday
  4: { open: "08:00", close: "18:00" },  // Thursday
  5: { open: "08:00", close: "18:00" },  // Friday
  6: { open: "08:00", close: "18:00" },  // Saturday
};

/**
 * Job titles from Square that mean "on the floor serving customers."
 * Anything NOT in this list = behind-the-scenes work (baking, training, cleaning, etc.)
 */
const FLOOR_JOB_TITLES = new Set([
  "server",
  "barista",
  "cashier",
  "bartender",
  "manager",
]);

/**
 * Classify a shift as "sales" (floor staff) or "ops" (behind-the-scenes).
 *
 * Uses the job title from Square — this is the most reliable signal because
 * employees clock in under their specific role (Server, Baking, Training, etc.)
 *
 * Fallback: if no job title available, use business hours as a rough guess.
 */
function classifyShift(startAt: string, endAt: string, jobTitle?: string): "sales" | "ops" {
  // If we have a job title from Square, use it
  if (jobTitle) {
    return FLOOR_JOB_TITLES.has(jobTitle.toLowerCase()) ? "sales" : "ops";
  }

  // Fallback: no job title — use business hours as a rough guess
  if (!startAt || !endAt) return "sales";

  const startET = new Date(new Date(startAt).toLocaleString("en-US", { timeZone: "America/New_York" }));
  const endET = new Date(new Date(endAt).toLocaleString("en-US", { timeZone: "America/New_York" }));
  const dayOfWeek = startET.getDay();
  const hours = BUSINESS_HOURS[dayOfWeek];

  if (!hours) return "ops";

  const [openH, openM] = hours.open.split(":").map(Number);
  const [closeH, closeM] = hours.close.split(":").map(Number);
  const openTime = new Date(startET); openTime.setHours(openH, openM, 0, 0);
  const closeTime = new Date(startET); closeTime.setHours(closeH, closeM, 0, 0);

  return (startET < closeTime && endET > openTime) ? "sales" : "ops";
}

// Lazy initialization - only create client when needed (not at build time)
let squareClient: SquareClient | null = null;

export function getSquareClient(): SquareClient {
  if (!squareClient) {
    const token = process.env.SQUARE_ACCESS_TOKEN;
    if (!token) {
      throw new Error("SQUARE_ACCESS_TOKEN is not configured");
    }
    const squareEnv = (process.env.SQUARE_ENVIRONMENT || "").trim();
    squareClient = new SquareClient({
      token: token.trim(),
      environment:
        squareEnv === "production"
          ? SquareEnvironment.Production
          : SquareEnvironment.Sandbox,
    });
  }
  return squareClient;
}

/**
 * Fetch all completed orders for a date range from Square
 */
export async function fetchOrders(startDate: string, endDate: string) {
  const client = getSquareClient();
  const locationId = (process.env.SQUARE_LOCATION_ID || "").trim();
  if (!locationId) {
    throw new Error("SQUARE_LOCATION_ID is not configured");
  }
  const allOrders: any[] = [];
  let cursor: string | undefined;

  do {
    const response = await client.orders.search({
      locationIds: [locationId],
      query: {
        filter: {
          dateTimeFilter: {
            createdAt: {
              startAt: `${startDate}T00:00:00Z`,
              endAt: `${endDate}T23:59:59Z`,
            },
          },
          stateFilter: {
            states: ["COMPLETED"],
          },
        },
        sort: {
          sortField: "CREATED_AT",
          sortOrder: "DESC",
        },
      },
      cursor,
    });

    if (response.orders) {
      allOrders.push(...response.orders);
    }
    cursor = response.cursor;
  } while (cursor);

  return allOrders;
}

/**
 * Fetch labor data (timecards/shifts) for a date range from Square.
 * Returns shift records with hours worked and pay info.
 */
export async function fetchLaborData(startDate: string, endDate: string) {
  const client = getSquareClient();
  const locationId = (process.env.SQUARE_LOCATION_ID || "").trim();
  if (!locationId) {
    throw new Error("SQUARE_LOCATION_ID is not configured");
  }
  const allShifts: any[] = [];

  // Fetch both CLOSED and OPEN (in-progress) timecards
  // OPEN shifts = people currently on the clock — we estimate hours up to now
  try {
    for (const status of ["CLOSED", "OPEN"] as const) {
      let cursor: string | undefined;
      do {
        const response = await client.labor.searchTimecards({
          query: {
            filter: {
              workday: {
                dateRange: {
                  startDate,
                  endDate,
                },
                matchTimecardsBy: "START_AT",
                defaultTimezone: "America/New_York",
              },
              locationIds: [locationId],
              status,
            },
            sort: {
              field: "START_AT",
              order: "DESC",
            },
          },
          limit: 200,
          cursor,
        });

        if ((response as any).timecards) {
          allShifts.push(...(response as any).timecards);
        }
        cursor = (response as any).cursor;
      } while (cursor);
    }
  } catch {
    // Fall back to shifts API if timecards not available
    let cursor: string | undefined;
    do {
      const response = await client.labor.shifts.search({
        query: {
          filter: {
            workday: {
              dateRange: {
                startDate,
                endDate,
              },
              matchShiftsBy: "START_AT",
              defaultTimezone: "America/New_York",
            },
          },
          sort: {
            field: "START_AT",
            order: "DESC",
          },
        },
        limit: 200,
        cursor,
      });

      if ((response as any).shifts) {
        allShifts.push(...(response as any).shifts);
      }
      cursor = (response as any).cursor;
    } while (cursor);
  }

  // Also fetch team member names so we can show who worked
  const teamMembers = new Map<string, string>();
  try {
    const tmResponse = await client.teamMembers.search({
      query: {
        filter: {
          locationIds: [locationId],
          status: "ACTIVE",
        },
      },
    });
    for (const tm of (tmResponse as any).teamMembers || []) {
      const name = [tm.givenName || tm.given_name, tm.familyName || tm.family_name]
        .filter(Boolean)
        .join(" ");
      teamMembers.set(tm.id, name || "Team Member");
    }
  } catch {
    // If team members API fails, we just won't have names
  }

  // Process shifts into a usable format
  return allShifts.map((shift: any) => {
    const startAt = shift.startAt || shift.start_at || "";
    const endAt = shift.endAt || shift.end_at || "";
    const teamMemberId = shift.teamMemberId || shift.team_member_id || "";
    const wage = shift.wage || {};
    const jobTitle = wage.title || wage.job_title || "";
    const hourlyRate = wage.hourlyRate || wage.hourly_rate || {};
    const rateInCents = Number(hourlyRate.amount || 0);
    const rateInDollars = rateInCents / 100;

    const isOpen = (shift.status || "").toUpperCase() === "OPEN";

    // Calculate hours worked — for open (in-progress) shifts, use current time
    let hoursWorked = 0;
    if (startAt && (endAt || isOpen)) {
      const start = new Date(startAt);
      const end = isOpen ? new Date() : new Date(endAt);
      hoursWorked = (end.getTime() - start.getTime()) / (1000 * 60 * 60);

      // Subtract unpaid breaks
      const breaks = shift.breaks || [];
      for (const brk of breaks) {
        if (!brk.isPaid && !brk.is_paid) {
          const brkStart = new Date(brk.startAt || brk.start_at);
          const brkEnd = new Date(brk.endAt || brk.end_at);
          if (brkEnd > brkStart) {
            hoursWorked -= (brkEnd.getTime() - brkStart.getTime()) / (1000 * 60 * 60);
          }
        }
      }
    }

    hoursWorked = Math.max(0, Math.round(hoursWorked * 100) / 100);
    const totalPay = Math.round(hoursWorked * rateInDollars * 100) / 100;
    const date = startAt ? startAt.substring(0, 10) : "";

    const shiftType = classifyShift(startAt, endAt, jobTitle);

    return {
      square_shift_id: shift.id,
      date,
      team_member_name: teamMembers.get(teamMemberId) || "Team Member",
      team_member_id: teamMemberId,
      job_title: jobTitle,
      start_at: startAt,
      end_at: isOpen ? "" : endAt,
      hours_worked: hoursWorked,
      hourly_rate: rateInDollars,
      total_pay: totalPay,
      shift_type: shiftType,
      is_open: isOpen,
    };
  });
}

/**
 * Fetch catalog items (menu items in Square)
 */
export async function fetchCatalogItems() {
  const client = getSquareClient();
  const allItems: any[] = [];
  let cursor: string | undefined;

  do {
    const response = await client.catalog.list({
      cursor,
      types: "ITEM",
    });

    if ((response as any).objects) {
      allItems.push(...(response as any).objects);
    }
    cursor = (response as any).cursor;
  } while (cursor);

  return allItems;
}
