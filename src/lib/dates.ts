/**
 * Date helpers. Dates are stored as DateTime but only the calendar day matters for
 * delivery plans, invoices and forecast buckets, so everything is normalised to UTC
 * midnight — otherwise a tranche planned "today" reads as overdue in another timezone.
 */

export function startOfDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function today(): Date {
  return startOfDay(new Date());
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

export function addMonths(date: Date, months: number): Date {
  const next = new Date(date.getTime());
  const targetMonth = next.getUTCMonth() + months;
  const dayOfMonth = next.getUTCDate();
  next.setUTCDate(1);
  next.setUTCMonth(targetMonth);
  // Clamp to the end of the target month (31 Jan + 1 month → 28/29 Feb, not 2/3 Mar).
  const lastDay = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
  next.setUTCDate(Math.min(dayOfMonth, lastDay));
  return next;
}

export function addWeeks(date: Date, weeks: number): Date {
  return addDays(date, weeks * 7);
}

export function daysBetween(from: Date, to: Date): number {
  const ms = startOfDay(to).getTime() - startOfDay(from).getTime();
  return Math.round(ms / 86_400_000);
}

export function isPast(date: Date, reference: Date = today()): boolean {
  return startOfDay(date).getTime() < startOfDay(reference).getTime();
}

export function isWithinNextDays(date: Date, days: number, reference: Date = today()): boolean {
  const diff = daysBetween(reference, date);
  return diff >= 0 && diff <= days;
}

/** Month bucket key used by the forecast, e.g. "2026-05". */
export function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function monthLabel(key: string): string {
  const [year, month] = key.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Every month key from `from` to `to` inclusive, so a forecast has no gaps. */
export function monthRange(from: Date, to: Date): string[] {
  const keys: string[] = [];
  let cursor = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1));
  const last = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), 1));
  while (cursor.getTime() <= last.getTime()) {
    keys.push(monthKey(cursor));
    cursor = addMonths(cursor, 1);
  }
  return keys;
}

export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const value = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(value.getTime())) return "—";
  return value.toLocaleDateString("en-US", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Value for an <input type="date">. */
export function toDateInput(date: Date | string | null | undefined): string {
  if (!date) return "";
  const value = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(value.getTime())) return "";
  return value.toISOString().slice(0, 10);
}

/** Parse an <input type="date"> value as a UTC calendar day. */
export function fromDateInput(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** "in 4 days" / "3 days ago" — used on delivery queues where lateness is the point. */
export function relativeDays(date: Date, reference: Date = today()): string {
  const diff = daysBetween(reference, date);
  if (diff === 0) return "today";
  if (diff === 1) return "tomorrow";
  if (diff === -1) return "yesterday";
  return diff > 0 ? `in ${diff} days` : `${Math.abs(diff)} days ago`;
}
