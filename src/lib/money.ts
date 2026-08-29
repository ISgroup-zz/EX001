/**
 * Money and quantity helpers.
 *
 * Every monetary amount in this app is an integer number of MINOR units (cents).
 * Nothing multiplies or sums floats to produce money — agreement, PO, GRN and
 * invoice totals all go through the helpers here, so the four can never disagree.
 *
 * Quantities are decimals (you can receive 2.5 metres), rounded to QTY_DP places
 * at every boundary so repeated arithmetic doesn't accumulate binary drift.
 */

export const QTY_DP = 3;
const QTY_FACTOR = 10 ** QTY_DP;

/** Round a quantity to the supported precision. */
export function roundQty(quantity: number): number {
  if (!Number.isFinite(quantity)) return 0;
  return Math.round(quantity * QTY_FACTOR) / QTY_FACTOR;
}

/** Convert a major-unit amount (12.34) to minor units (1234). */
export function toMinor(amount: number): number {
  if (!Number.isFinite(amount)) return 0;
  return Math.round(amount * 100);
}

/** Convert minor units (1234) back to a major-unit number (12.34). */
export function fromMinor(minor: number): number {
  return Math.round(minor) / 100;
}

/** Parse user input ("1,234.50", "1234.5", "") into minor units. */
export function parseMoneyToMinor(input: string | number | null | undefined): number {
  if (input === null || input === undefined || input === "") return 0;
  if (typeof input === "number") return toMinor(input);
  const cleaned = input.replace(/[\s,]/g, "");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? toMinor(parsed) : 0;
}

/** Parse user input into a quantity. */
export function parseQty(input: string | number | null | undefined): number {
  if (input === null || input === undefined || input === "") return 0;
  if (typeof input === "number") return roundQty(input);
  const parsed = Number(String(input).replace(/[\s,]/g, ""));
  return Number.isFinite(parsed) ? roundQty(parsed) : 0;
}

/** quantity × unit price, in minor units. The single place this multiplication happens. */
export function lineTotalMinor(quantity: number, unitPriceMinor: number): number {
  return Math.round(roundQty(quantity) * Math.round(unitPriceMinor));
}

/** Tax on an amount at a percentage rate, in minor units. */
export function taxMinor(amountMinor: number, taxRatePct: number): number {
  if (!taxRatePct) return 0;
  return Math.round(amountMinor * (taxRatePct / 100));
}

export function sumMinor(values: Array<number | null | undefined>): number {
  return values.reduce<number>((total, value) => total + Math.round(value ?? 0), 0);
}

export type PricedLine = {
  quantity: number;
  unitPriceMinor: number;
  taxRatePct?: number | null;
};

export type LineTotals = {
  subtotalMinor: number;
  taxTotalMinor: number;
  totalMinor: number;
};

/** Net / tax / gross for a set of priced lines. Used by agreements, POs and invoices alike. */
export function totalsForLines(lines: PricedLine[]): LineTotals {
  let subtotalMinor = 0;
  let taxTotalMinor = 0;
  for (const line of lines) {
    const net = lineTotalMinor(line.quantity, line.unitPriceMinor);
    subtotalMinor += net;
    taxTotalMinor += taxMinor(net, line.taxRatePct ?? 0);
  }
  return { subtotalMinor, taxTotalMinor, totalMinor: subtotalMinor + taxTotalMinor };
}

/**
 * Split a quantity into n parts that sum EXACTLY back to it.
 * Remainders land on the last part, so a delivery plan always reconciles to the ordered quantity.
 */
export function splitQuantityEvenly(quantity: number, parts: number): number[] {
  if (parts < 1) return [];
  const total = roundQty(quantity);
  const each = roundQty(total / parts);
  const result = Array.from({ length: parts }, () => each);
  const allocated = roundQty(each * (parts - 1));
  result[parts - 1] = roundQty(total - allocated);
  return result;
}

/** Split by percentages (e.g. [30, 40, 30]); the last part absorbs any rounding remainder. */
export function splitQuantityByPercentage(quantity: number, percentages: number[]): number[] {
  if (percentages.length === 0) return [];
  const total = roundQty(quantity);
  const result = percentages.map((pct) => roundQty((total * pct) / 100));
  const allocated = roundQty(result.slice(0, -1).reduce((sum, value) => sum + value, 0));
  result[result.length - 1] = roundQty(total - allocated);
  return result;
}

const CURRENCY_FALLBACK = "USD";

export function formatMoney(minor: number, currency = CURRENCY_FALLBACK): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency || CURRENCY_FALLBACK,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(fromMinor(minor));
}

const symbolCache = new Map<string, string>();

function currencySymbol(currency: string): string {
  const code = currency || CURRENCY_FALLBACK;
  const cached = symbolCache.get(code);
  if (cached) return cached;

  const parts = new Intl.NumberFormat("en-US", { style: "currency", currency: code }).formatToParts(0);
  const symbol = parts.find((part) => part.type === "currency")?.value ?? code;
  symbolCache.set(code, symbol);
  return symbol;
}

const COMPACT_UNITS: Array<[number, string]> = [
  [1_000_000_000, "B"],
  [1_000_000, "M"],
  [1_000, "K"],
];

/**
 * Compact form for dashboard tiles: $1.2M, $340K.
 *
 * Deliberately not `Intl` compact notation — Node's ICU and the browser's disagree on
 * trailing zeros ("$125K" vs "$125.0K"), which shows up as a React hydration mismatch.
 * This does the rounding itself so both sides always produce the same string.
 */
export function formatMoneyCompact(minor: number, currency = CURRENCY_FALLBACK): string {
  const value = fromMinor(minor);
  const sign = value < 0 ? "-" : "";
  const magnitude = Math.abs(value);
  const symbol = currencySymbol(currency);

  for (const [threshold, suffix] of COMPACT_UNITS) {
    if (magnitude >= threshold) {
      const scaled = magnitude / threshold;
      const text = (scaled >= 100 ? scaled.toFixed(0) : scaled.toFixed(1)).replace(/\.0$/, "");
      return `${sign}${symbol}${text}${suffix}`;
    }
  }
  return `${sign}${symbol}${magnitude.toFixed(magnitude % 1 === 0 ? 0 : 2)}`;
}

export function formatQty(quantity: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: QTY_DP }).format(roundQty(quantity));
}

export function formatPercent(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return "—";
  return `${value.toFixed(digits)}%`;
}

/** Percentage of `part` against `whole`, guarding division by zero. */
export function percentOf(part: number, whole: number): number {
  if (!whole) return 0;
  return (part / whole) * 100;
}
