/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Recurring Reminders — database helpers
 *
 * ensureRemindersTable(sql)  — idempotent table creation
 * calculateNextDue(...)      — returns the next UTC timestamp for a reminder
 */

export async function ensureRemindersTable(sql: any) {
  await sql`
    CREATE TABLE IF NOT EXISTS recurring_reminders (
      id TEXT PRIMARY KEY,
      restaurant_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      frequency TEXT NOT NULL,
      day_of_week INTEGER,
      day_of_month INTEGER,
      month_of_year INTEGER,
      time_of_day TEXT NOT NULL,
      enabled BOOLEAN DEFAULT true,
      last_sent_at TIMESTAMPTZ,
      next_due_at TIMESTAMPTZ,
      created_by TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
}

/**
 * Calculate the next time a reminder should fire, in UTC.
 *
 * @param frequency   'daily' | 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly'
 * @param dayOfWeek   0-6 (Sun–Sat) for weekly / biweekly
 * @param dayOfMonth  1-31 for monthly
 * @param monthOfYear 1-12 for quarterly / yearly
 * @param timeOfDay   'HH:MM' in 24-hour format (treated as UTC)
 * @param lastSentAt  optional — the last time the reminder was sent
 */
export function calculateNextDue(
  frequency: string,
  dayOfWeek: number | null | undefined,
  dayOfMonth: number | null | undefined,
  monthOfYear: number | null | undefined,
  timeOfDay: string,
  lastSentAt?: Date | string | null
): Date {
  const now = new Date();
  const [hours, minutes] = timeOfDay.split(":").map(Number);

  switch (frequency) {
    case "daily":
      return nextDaily(now, hours, minutes);
    case "weekly":
      return nextWeekly(now, hours, minutes, dayOfWeek ?? 1);
    case "biweekly":
      return nextBiweekly(now, hours, minutes, dayOfWeek ?? 1, lastSentAt);
    case "monthly":
      return nextMonthly(now, hours, minutes, dayOfMonth ?? 1);
    case "quarterly":
      return nextQuarterly(now, hours, minutes, dayOfMonth ?? 1, monthOfYear ?? 1);
    case "yearly":
      return nextYearly(now, hours, minutes, dayOfMonth ?? 1, monthOfYear ?? 1);
    default:
      return nextDaily(now, hours, minutes);
  }
}

/* ──────────────────────── helpers ──────────────────────── */

function nextDaily(now: Date, h: number, m: number): Date {
  const candidate = new Date(now);
  candidate.setUTCHours(h, m, 0, 0);
  if (candidate <= now) {
    candidate.setUTCDate(candidate.getUTCDate() + 1);
  }
  return candidate;
}

function nextWeekly(now: Date, h: number, m: number, dow: number): Date {
  const candidate = new Date(now);
  candidate.setUTCHours(h, m, 0, 0);
  const currentDow = candidate.getUTCDay();
  let daysAhead = dow - currentDow;
  if (daysAhead < 0) daysAhead += 7;
  if (daysAhead === 0 && candidate <= now) daysAhead = 7;
  candidate.setUTCDate(candidate.getUTCDate() + daysAhead);
  return candidate;
}

function nextBiweekly(
  now: Date,
  h: number,
  m: number,
  dow: number,
  lastSentAt?: Date | string | null
): Date {
  // First find the next weekly occurrence
  const nextWeek = nextWeekly(now, h, m, dow);

  if (lastSentAt) {
    const last = new Date(lastSentAt);
    const diffMs = nextWeek.getTime() - last.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);

    // If it's been less than 10 days since last send, skip to the week after
    if (diffDays < 10) {
      nextWeek.setUTCDate(nextWeek.getUTCDate() + 7);
    }
  }

  return nextWeek;
}

function nextMonthly(now: Date, h: number, m: number, dom: number): Date {
  const candidate = new Date(now);
  candidate.setUTCHours(h, m, 0, 0);

  // Try this month first
  candidate.setUTCDate(Math.min(dom, daysInMonth(candidate.getUTCFullYear(), candidate.getUTCMonth())));
  if (candidate > now) return candidate;

  // Otherwise next month
  candidate.setUTCMonth(candidate.getUTCMonth() + 1);
  candidate.setUTCDate(Math.min(dom, daysInMonth(candidate.getUTCFullYear(), candidate.getUTCMonth())));
  return candidate;
}

function nextQuarterly(
  now: Date,
  h: number,
  m: number,
  dom: number,
  startMonth: number
): Date {
  // startMonth is 1-12 — the base month pattern
  // Quarterly months based on start: e.g. 1 -> Jan/Apr/Jul/Oct
  const quarterMonths: number[] = [];
  for (let i = 0; i < 4; i++) {
    quarterMonths.push(((startMonth - 1 + i * 3) % 12) + 1);
  }

  const year = now.getUTCFullYear();

  // Check each quarter month in the current year and next year
  for (const yr of [year, year + 1]) {
    for (const mo of quarterMonths) {
      const candidate = new Date(Date.UTC(yr, mo - 1, 1, h, m, 0));
      candidate.setUTCDate(Math.min(dom, daysInMonth(yr, mo - 1)));
      if (candidate > now) return candidate;
    }
  }

  // Fallback: 3 months from now
  const fallback = new Date(now);
  fallback.setUTCMonth(fallback.getUTCMonth() + 3);
  fallback.setUTCHours(h, m, 0, 0);
  return fallback;
}

function nextYearly(
  now: Date,
  h: number,
  m: number,
  dom: number,
  month: number
): Date {
  const year = now.getUTCFullYear();

  // Try this year
  const candidate = new Date(Date.UTC(year, month - 1, 1, h, m, 0));
  candidate.setUTCDate(Math.min(dom, daysInMonth(year, month - 1)));
  if (candidate > now) return candidate;

  // Next year
  const nextYear = year + 1;
  const next = new Date(Date.UTC(nextYear, month - 1, 1, h, m, 0));
  next.setUTCDate(Math.min(dom, daysInMonth(nextYear, month - 1)));
  return next;
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}
