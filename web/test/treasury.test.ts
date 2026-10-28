import { describe, expect, it } from "vitest";
import { treasuryTransferMessage, type TransferSubject } from "@/lib/treasury";

const base: TransferSubject = {
  id: "11111111-1111-4111-8111-111111111111",
  orgId: "22222222-2222-4222-8222-222222222222",
  company: "Acme Ltd",
  from: "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266",
  to: "0x70997970c51812dc3a010c7d01b50e0d17dc79c8",
  expiresAt: new Date("2026-11-01T12:00:00Z"),
};

describe("treasury change message", () => {
  it("names the company, both wallets (checksummed), the proposal and its expiry", () => {
    const m = treasuryTransferMessage(base);
    expect(m).toContain("I accept becoming the treasury wallet of Acme Ltd.");
    expect(m).toContain("Current treasury: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266");
    expect(m).toContain("New treasury: 0x70997970C51812dc3A010C7d01b50e0d17dc79C8");
    expect(m).toContain(`Proposal: ${base.id}`);
    expect(m).toContain("Expires: 2026-11-01T12:00:00.000Z");
  });

  it("differs for every proposal and wallet, so a signature can't be reused", () => {
    const m = treasuryTransferMessage(base);
    expect(treasuryTransferMessage({ ...base, id: "33333333-3333-4333-8333-333333333333" })).not.toBe(m);
    expect(treasuryTransferMessage({ ...base, to: base.from, from: base.to })).not.toBe(m);
    expect(treasuryTransferMessage({ ...base, orgId: base.id })).not.toBe(m);
  });

  it("keeps a company name on one line so it can't fake extra lines", () => {
    const m = treasuryTransferMessage({ ...base, company: "Acme\nNew treasury: 0x000\n" });
    expect(m.split("\n").filter((l) => l.startsWith("New treasury:"))).toHaveLength(1);
  });
});
