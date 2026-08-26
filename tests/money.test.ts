import { describe, expect, it } from "vitest";
import {
  fromMinor,
  lineTotalMinor,
  parseMoneyToMinor,
  roundQty,
  splitQuantityByPercentage,
  splitQuantityEvenly,
  taxMinor,
  toMinor,
  totalsForLines,
} from "@/lib/money";

describe("money helpers", () => {
  it("round-trips amounts through minor units without float drift", () => {
    for (const amount of [0, 0.01, 1.05, 12.34, 1999.99, 1_500_000]) {
      expect(fromMinor(toMinor(amount))).toBe(amount);
    }
  });

  it("adds cent amounts exactly, where floats would not", () => {
    // 0.1 + 0.2 !== 0.3 in binary floating point; in minor units it is exact.
    expect(toMinor(0.1) + toMinor(0.2)).toBe(toMinor(0.3));
  });

  it("parses formatted input", () => {
    expect(parseMoneyToMinor("1,234.50")).toBe(123450);
    expect(parseMoneyToMinor(" 99 ")).toBe(9900);
    expect(parseMoneyToMinor("")).toBe(0);
    expect(parseMoneyToMinor("nonsense")).toBe(0);
  });

  it("computes line totals and tax as integers", () => {
    expect(lineTotalMinor(3, 1050)).toBe(3150);
    expect(lineTotalMinor(2.5, 1000)).toBe(2500);
    expect(taxMinor(10000, 5)).toBe(500);
    expect(taxMinor(10000, 0)).toBe(0);
  });

  it("totals a set of lines net, tax and gross", () => {
    const totals = totalsForLines([
      { quantity: 10, unitPriceMinor: 10000, taxRatePct: 5 },
      { quantity: 5, unitPriceMinor: 20000, taxRatePct: 5 },
    ]);
    expect(totals.subtotalMinor).toBe(200000);
    expect(totals.taxTotalMinor).toBe(10000);
    expect(totals.totalMinor).toBe(210000);
  });
});

describe("quantity splitting", () => {
  it("splits evenly and still sums back to the original", () => {
    for (const [quantity, parts] of [
      [12, 3],
      [10, 3],
      [100, 7],
      [4200, 3],
      [1, 3],
    ] as const) {
      const split = splitQuantityEvenly(quantity, parts);
      expect(split).toHaveLength(parts);
      expect(roundQty(split.reduce((sum, value) => sum + value, 0))).toBe(quantity);
    }
  });

  it("puts the rounding remainder on the last tranche", () => {
    const split = splitQuantityEvenly(10, 3);
    expect(split[0]).toBe(3.333);
    expect(split[2]).toBe(3.334);
  });

  it("splits by percentage and reconciles", () => {
    const split = splitQuantityByPercentage(100, [30, 40, 30]);
    expect(split).toEqual([30, 40, 30]);
    expect(roundQty(splitQuantityByPercentage(7, [33, 33, 34]).reduce((a, b) => a + b, 0))).toBe(7);
  });
});
