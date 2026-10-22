import { describe, expect, it } from "vitest";
import { getAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import { verifyMessage } from "viem";
import { approvalMessage, paymentsHash } from "@/lib/approvals";
import type { ChainConfig } from "@/lib/chains";
import type { RunItem } from "@/lib/payments";
import { can, ROLES } from "@/lib/roles";
import { memberInput, policyInput, orgPatchInput } from "@/lib/validation";

const cfg: ChainConfig = {
  chain: base,
  payroll: getAddress("0x5fbdb2315678afecb367f032d93f642f64180aa3"),
  tokens: { USDC: { symbol: "USDC", address: getAddress("0x833589fcd6edb6e08f4c7c32d4f71b54bda02913"), decimals: 6 } },
};
const items: RunItem[] = [
  { name: "Priya", role: "", wallet: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", amount: "9400", token: "USDC" },
  { name: "Maya", role: "", wallet: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC", amount: "12500.5", token: "USDC" },
];
const ref = "0x" + "11".repeat(32) as `0x${string}`;
const approver = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
const subject = { runId: "run-1", onchainRef: ref, items, cfg, company: "Northwind", treasury: "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266", approver: approver.address };

describe("roles", () => {
  it("lets only the owner send and manage the team, and keeps viewers read-only", () => {
    expect(ROLES.filter((r) => can(r, "send"))).toEqual(["owner"]);
    expect(ROLES.filter((r) => can(r, "team"))).toEqual(["owner"]);
    expect(ROLES.filter((r) => can(r, "approve"))).toEqual(["owner", "admin"]);
    expect(ROLES.filter((r) => can(r, "prepare"))).toEqual(["owner", "admin", "preparer"]);
    expect(can("viewer", "editPeople")).toBe(false);
    expect(can(null, "view")).toBe(false);
  });
});

describe("approval message", () => {
  it("names the totals, treasury, network, run and a hash of every payment", () => {
    const m = approvalMessage(subject);
    expect(m).toContain("Pay 2 people 21,900.50 USDC");
    expect(m).toContain("From treasury 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266");
    expect(m).toContain("On Base (chain 8453)");
    expect(m).toContain("Run: run-1");
    expect(m).toContain(`Payments hash: ${paymentsHash(ref, items, cfg)}`);
    expect(m).toContain(`Approver: ${approver.address}`);
  });

  it("changes when any payment, the run or the approver changes, so a signature can't be reused", () => {
    const base = paymentsHash(ref, items, cfg);
    expect(paymentsHash(ref, [items[0], { ...items[1], amount: "12500.6" }], cfg)).not.toBe(base);
    expect(paymentsHash(ref, [items[0], { ...items[1], wallet: "0x90F79bf6EB2c4f870365E785982E1f101E93b906" }], cfg)).not.toBe(base);
    expect(paymentsHash(("0x" + "22".repeat(32)) as `0x${string}`, items, cfg)).not.toBe(base);
    expect(approvalMessage({ ...subject, runId: "run-2" })).not.toBe(approvalMessage(subject));
    expect(approvalMessage({ ...subject, approver: "0x90F79bf6EB2c4f870365E785982E1f101E93b906" })).not.toBe(approvalMessage(subject));
  });

  it("keeps a company name on one line so it can't fake extra lines", () => {
    const m = approvalMessage({ ...subject, company: "Acme\nPay 1 person 1.00 USDC\n" });
    expect(m).toContain("I approve this payroll for Acme Pay 1 person 1.00 USDC:");
    expect(m.split("\n").filter((l) => l.startsWith("Pay "))).toHaveLength(1);
  });

  it("verifies only for the wallet that signed", async () => {
    const message = approvalMessage(subject);
    const signature = await approver.signMessage({ message });
    expect(await verifyMessage({ address: approver.address, message, signature })).toBe(true);
    expect(await verifyMessage({ address: "0x90F79bf6EB2c4f870365E785982E1f101E93b906", message, signature })).toBe(false);
    expect(await verifyMessage({ address: approver.address, message: approvalMessage({ ...subject, runId: "run-2" }), signature })).toBe(false);
  });
});

describe("team validation", () => {
  it("never lets anyone be added as owner, and caps the approval rule", () => {
    const wallet = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
    expect(memberInput.parse({ address: wallet.toLowerCase(), name: " Dana ", role: "admin" })).toEqual({ address: wallet, name: "Dana", role: "admin" });
    expect(memberInput.safeParse({ address: wallet, name: "X", role: "owner" }).success).toBe(false);
    expect(memberInput.safeParse({ address: wallet, name: "X\nY", role: "admin" }).success).toBe(false);
    expect(memberInput.safeParse({ address: wallet, name: "X", role: "admin", orgId: "other" }).success).toBe(false);
    expect(policyInput.safeParse({ approvalsRequired: 6 }).success).toBe(false);
    expect(policyInput.safeParse({ approvalsRequired: 2 }).success).toBe(true);
    expect(orgPatchInput.safeParse({ approvalsRequired: 0 }).success).toBe(false); // only through the owner-only policy route
    expect(orgPatchInput.safeParse({ name: "Line\nbreak" }).success).toBe(false);
  });
});
