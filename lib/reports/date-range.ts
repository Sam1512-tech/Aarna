/**
 * Resolves a report's date range (a preset like "this month", or a custom
 * from/to pick) into concrete UTC instants — [from, to), `to` exclusive —
 * ready to pass straight into a Drizzle `gte`/`lt` filter.
 *
 * All calendar-boundary math (month/quarter/financial-year starts) is done
 * in IST, not server-local time — Vercel functions run in UTC regardless of
 * region, so naively using UTC month boundaries would shift the range by
 * 5:30h and could drop or include the wrong day's orders at the edges.
 * India has one fixed offset (+05:30, no DST), so a plain offset calculation
 * is exact — no timezone-database lookup needed.
 */
import { ActionError } from "@/lib/action-error";

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

export type ReportPreset =
  | "this_month"
  | "last_month"
  | "this_quarter"
  | "this_financial_year"
  | "custom";

export interface ReportDateRange {
  from: Date;
  to: Date;
  label: string;
}

function istDateParts(date: Date): { year: number; month: number; day: number } {
  // en-CA formats as YYYY-MM-DD, convenient to split.
  const formatted = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
  const [year, month, day] = formatted.split("-").map(Number);
  return { year, month, day };
}

function istMidnightUtc(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0) - IST_OFFSET_MS);
}

function addMonths(year: number, month: number, delta: number) {
  const total = year * 12 + (month - 1) + delta;
  return { year: Math.floor(total / 12), month: (total % 12) + 1 };
}

// Indian financial quarters: Apr–Jun, Jul–Sep, Oct–Dec, Jan–Mar (Jan–Mar
// belongs to the previous financial year's Q4).
function quarterStart(year: number, month: number) {
  if (month >= 4 && month <= 6) return { year, month: 4 };
  if (month >= 7 && month <= 9) return { year, month: 7 };
  if (month >= 10 && month <= 12) return { year, month: 10 };
  return { year: year - 1, month: 10 };
}

function monthLabel(year: number, month: number): string {
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function parseIsoDate(input: string, fieldName: string): { year: number; month: number; day: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input.trim());
  if (!match) {
    throw new ActionError(`${fieldName} must be a valid date (YYYY-MM-DD).`);
  }
  const [, y, m, d] = match;
  return { year: Number(y), month: Number(m), day: Number(d) };
}

export function resolveReportDateRange(
  preset: ReportPreset,
  customFrom?: string,
  customTo?: string,
  now: Date = new Date(),
): ReportDateRange {
  const { year, month } = istDateParts(now);

  switch (preset) {
    case "custom": {
      if (!customFrom || !customTo) {
        throw new ActionError("Pick both a start and end date for a custom range.");
      }
      const f = parseIsoDate(customFrom, "Start date");
      const t = parseIsoDate(customTo, "End date");
      const from = istMidnightUtc(f.year, f.month, f.day);
      // "to" is the last day the admin wants included, so the exclusive
      // upper bound is midnight the day after.
      const toStart = istMidnightUtc(t.year, t.month, t.day);
      const to = new Date(toStart.getTime() + 24 * 60 * 60 * 1000);
      if (to <= from) {
        throw new ActionError("End date must be on or after the start date.");
      }
      return { from, to, label: `${customFrom} to ${customTo}` };
    }

    case "this_month": {
      const from = istMidnightUtc(year, month, 1);
      const next = addMonths(year, month, 1);
      const to = istMidnightUtc(next.year, next.month, 1);
      return { from, to, label: monthLabel(year, month) };
    }

    case "last_month": {
      const prev = addMonths(year, month, -1);
      const from = istMidnightUtc(prev.year, prev.month, 1);
      const to = istMidnightUtc(year, month, 1);
      return { from, to, label: monthLabel(prev.year, prev.month) };
    }

    case "this_quarter": {
      const qs = quarterStart(year, month);
      const from = istMidnightUtc(qs.year, qs.month, 1);
      const next = addMonths(qs.year, qs.month, 3);
      const to = istMidnightUtc(next.year, next.month, 1);
      const lastMonth = addMonths(qs.year, qs.month, 2);
      return {
        from,
        to,
        label: `${monthLabel(qs.year, qs.month)} – ${monthLabel(lastMonth.year, lastMonth.month)}`,
      };
    }

    case "this_financial_year": {
      const fyStartYear = month >= 4 ? year : year - 1;
      const from = istMidnightUtc(fyStartYear, 4, 1);
      const to = istMidnightUtc(fyStartYear + 1, 4, 1);
      return {
        from,
        to,
        label: `FY ${fyStartYear}-${String(fyStartYear + 1).slice(2)}`,
      };
    }

    default:
      throw new ActionError(`Unknown date range preset: ${preset}`);
  }
}
