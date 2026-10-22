import { describe, expect, it } from "vitest";
import { reviewRun } from "@/lib/changes";
import type { RunItem } from "@/lib/payments";

const A = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const B = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC";
const C = "0x90F79bf6EB2c4f870365E785982E1f101E93b906";
const item = (employeeId: string, name: string, wallet: string, amount: string, token: "USDC" | "USDT" = "USDC"): RunItem => ({
  employeeId, name, role: "", wallet, amount, token,
});

describe("reviewRun", () => {
  it("treats the first run as new and flags every wallet as never paid", () => {
    const r = reviewRun(null, [item("1", "Priya", A, "9400")], []);
    expect(r).toEqual({ firstRun: true, changes: [], newWallets: [A] });
  });

  it("reports no changes for an identical run", () => {
    const prev = [item("1", "Priya", A, "9400"), item("2", "Maya", B, "12500")];
    const r = reviewRun(prev, prev.map((i) => ({ ...i })), [A, B]);
    expect(r.changes).toEqual([]);
    expect(r.newWallets).toEqual([]);
  });

  it("detects additions, removals, raises and wallet changes, wallet changes first", () => {
    const prev = [item("1", "Priya", A, "9400"), item("2", "Maya", B, "12500"), item("3", "Tunde", C, "9000")];
    const next = [item("1", "Priya", A, "9400.00"), item("2", "Maya", C.toLowerCase(), "12500"), item("4", "Lucía", "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65", "6900", "USDT"), item("3", "Tunde", C, "10200")];
    const r = reviewRun(prev, next, [A, B, C]);
    expect(r.firstRun).toBe(false);
    expect(r.changes.map((c) => `${c.kind}:${c.name}`)).toEqual(["wallet:Maya", "added:Lucía", "pay:Tunde"]);
    expect(r.newWallets).toEqual(["0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65"]);
  });

  it("detects removals and token switches", () => {
    const prev = [item("1", "Priya", A, "9400"), item("2", "Maya", B, "500")];
    const next = [item("1", "Priya", A, "9400", "USDT")];
    const r = reviewRun(prev, next, [A, B]);
    expect(r.changes).toEqual([
      { kind: "pay", name: "Priya", before: "9400", after: "9400", token: "USDT", beforeToken: "USDC" },
      { kind: "removed", name: "Maya", amount: "500", token: "USDC" },
    ]);
  });

  it("matches by wallet when old snapshots have no employee id", () => {
    const prev = [{ ...item("x", "Priya", A, "9400"), employeeId: null }];
    const next = [{ ...item("x", "Priya", A, "9500"), employeeId: null }];
    expect(reviewRun(prev, next, [A]).changes.map((c) => c.kind)).toEqual(["pay"]);
  });
});
