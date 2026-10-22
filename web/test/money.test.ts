import { describe, expect, it } from "vitest";
import { canonical, formatAmount, normalizeAmount, sumByToken, totalsLabel } from "@/lib/money";

describe("normalizeAmount", () => {
  it("accepts plain and comma-grouped amounts", () => {
    expect(normalizeAmount("9400")).toBe("9400");
    expect(normalizeAmount(" 12,500.50 ")).toBe("12500.5");
    expect(normalizeAmount(5300)).toBe("5300");
    expect(normalizeAmount("0.000001")).toBe("0.000001");
  });

  it("rejects zero, negatives, junk and more than 6 decimals", () => {
    for (const bad of ["0", "0.0", "-5", "abc", "", "1.2345678", "1e6", "12.", ".5"]) {
      expect(normalizeAmount(bad), bad).toBeNull();
    }
  });
});

describe("formatting", () => {
  it("formats with grouping and at least 2 decimals", () => {
    expect(formatAmount("9400")).toBe("9,400.00");
    expect(formatAmount("1234567.5")).toBe("1,234,567.50");
    expect(formatAmount("0.123456")).toBe("0.123456");
    expect(formatAmount(58_700_000_000n)).toBe("58,700.00");
  });

  it("trims database numerics", () => {
    expect(canonical("9400.000000")).toBe("9400");
    expect(canonical("0.500000")).toBe("0.5");
  });
});

describe("totals", () => {
  const items = [
    { amount: "9400", token: "USDC" as const },
    { amount: "0.1", token: "USDC" as const },
    { amount: "0.2", token: "USDC" as const },
    { amount: "6900", token: "USDT" as const },
  ];

  it("sums exactly in base units (no floating point drift)", () => {
    const t = sumByToken(items);
    expect(t.USDC).toBe(9_400_300_000n);
    expect(t.USDT).toBe(6_900_000_000n);
  });

  it("labels totals per token and skips empty ones", () => {
    expect(totalsLabel(sumByToken(items))).toBe("9,400.30 USDC + 6,900.00 USDT");
    expect(totalsLabel({ USDC: "58700" })).toBe("58,700.00 USDC");
    expect(totalsLabel(sumByToken([]))).toBe("Nothing to pay");
  });
});
