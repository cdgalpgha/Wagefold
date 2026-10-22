import { describe, expect, it } from "vitest";
import { csvCell, journalCsv, payeeYear, paymentsCsv, payslip, payslipHtml, toCsv, usdValue, type PaidRun } from "@/lib/records";
import type { Run } from "@/lib/types";

const run = (id: string, paidAt: string, usdRates: Run["usdRates"] = null): Run => ({
  id,
  chainId: 8453,
  onchainRef: "0x01",
  status: "confirmed",
  failureReason: null,
  txHash: `0x${id.padStart(64, "a")}`,
  recipientCount: 2,
  totals: {},
  createdAt: paidAt,
  confirmedAt: paidAt,
  paidAt,
  blockNumber: "123",
  networkFee: "0.000031",
  usdRates,
  createdBy: null,
  requestedAt: null,
  submittedBy: null,
  approvalCount: 0,
  rejection: null,
});
const A = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const B = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC";
const runs: PaidRun[] = [
  {
    run: run("1", "2026-01-31T12:00:00.000Z"),
    items: [
      { employeeId: "e1", name: "Priya", role: "Finance", wallet: A, amount: "9400", token: "USDC" },
      { employeeId: "e2", name: "Lucía", role: "Design", wallet: B, amount: "6900.5", token: "USDT" },
    ],
  },
  {
    run: run("2", "2026-02-28T12:00:00.000Z", { USDC: { rate: "0.9998", source: "Chainlink USDC/USD" } }),
    items: [{ employeeId: "e1", name: "Priya", role: "Finance", wallet: A, amount: "9400", token: "USDC" }],
  },
  { run: run("3", "2025-12-31T12:00:00.000Z"), items: [{ employeeId: "e1", name: "Priya", role: "Finance", wallet: A, amount: "100", token: "USDC" }] },
];

describe("csv", () => {
  it("quotes separators and neutralises spreadsheet formulas", () => {
    expect(csvCell('a,"b"')).toBe('"a,""b"""');
    expect(csvCell("=HYPERLINK(\"http://x\")")).toBe("\"'=HYPERLINK(\"\"http://x\"\")\"");
    expect(csvCell("+1")).toBe("'+1");
    expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(csvCell("-5")).toBe("'-5");
    expect(toCsv([["a", 1, null]])).toBe("a,1,\r\n");
  });
});

describe("usdValue", () => {
  it("multiplies exactly and rounds to cents", () => {
    expect(usdValue("9400", "1")).toBe("9400.00");
    expect(usdValue("9400", "0.9998")).toBe("9398.12");
    expect(usdValue("0.005", "1")).toBe("0.01");
    expect(usdValue("123456789.123456", "1.00000001")).toBe("123456790.36");
  });
});

describe("exports", () => {
  it("writes one row per payment with tx, block, fee and rate source", () => {
    const lines = paymentsCsv(runs, A).trim().split("\r\n");
    expect(lines).toHaveLength(5);
    expect(lines[1]).toContain("2025-12-31");
    expect(lines.some((l) => l.includes("Chainlink USDC/USD") && l.includes("9398.12"))).toBe(true);
    expect(lines.every((l, i) => i === 0 || l.includes(",123,0.000031,"))).toBe(true);
  });

  it("balances every journal entry", () => {
    const rows = journalCsv(runs).trim().split("\r\n").slice(1).map((l) => l.split(","));
    const byNo = new Map<string, number>();
    for (const r of rows) byNo.set(r[0], (byNo.get(r[0]) ?? 0) + Number(r[3] || 0) - Number(r[4] || 0));
    expect([...byNo.values()].every((v) => Math.abs(v) < 0.001)).toBe(true);
    expect(byNo.size).toBe(3);
  });

  it("totals each person per calendar year", () => {
    const y = payeeYear(runs, 2026);
    expect(y.find((p) => p.name === "Priya")).toMatchObject({ payments: 2, tokens: { USDC: "18800" }, usd: "18798.12" });
    expect(y.find((p) => p.name === "Lucía")).toMatchObject({ payments: 1, tokens: { USDT: "6900.5" }, usd: "6900.50" });
  });
});

describe("payslip", () => {
  it("adds year-to-date totals up to and including the payment, not later ones or last year", () => {
    const jan = payslip(runs, "Northwind", A, "1", 0)!;
    expect(jan.ytd).toEqual({ year: 2026, payments: 1, tokens: { USDC: "9400" }, usd: "9400.00" });
    const feb = payslip(runs, "Northwind", A, "2", 0)!;
    expect(feb.ytd.payments).toBe(2);
    expect(feb.usd).toBe("9398.12");
    expect(payslip(runs, "Northwind", A, "2", 5)).toBeNull();
  });

  it("escapes user-supplied text in the document", () => {
    const evil: PaidRun[] = [{ run: run("9", "2026-03-01T00:00:00.000Z"), items: [{ employeeId: "x", name: "<img src=x onerror=alert(1)>", role: '"><script>', wallet: A, amount: "1", token: "USDC" }] }];
    const html = payslipHtml(payslip(evil, "<b>Co</b>", A, "9", 0)!);
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<b>Co");
    expect(html).toContain("&lt;img src=x");
  });
});
