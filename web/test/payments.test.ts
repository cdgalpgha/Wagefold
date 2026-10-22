import { describe, expect, it } from "vitest";
import { getAddress } from "viem";
import { hardhat } from "viem/chains";
import type { ChainConfig } from "@/lib/chains";
import { buildPayments, onchainRef, requiredAllowances, samePayments } from "@/lib/payments";

const USDC = getAddress("0x5fbdb2315678afecb367f032d93f642f64180aa3");
const USDT = getAddress("0xe7f1725e7734ce288f8367e1bb143e90bb3f0512");
const cfg: ChainConfig = {
  chain: hardhat,
  payroll: getAddress("0x9fe46736679d2d9a65f0992f2272de9f3c7fa6e0"),
  tokens: { USDC: { symbol: "USDC", address: USDC, decimals: 6 }, USDT: { symbol: "USDT", address: USDT, decimals: 6 } },
};
const items = [
  { name: "A", role: "", wallet: "0x70997970c51812dc3a010c7d01b50e0d17dc79c8", amount: "9400", token: "USDC" as const },
  { name: "B", role: "", wallet: "0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc", amount: "0.5", token: "USDC" as const },
  { name: "C", role: "", wallet: "0x90f79bf6eb2c4f870365e785982e1f101e93b906", amount: "6900", token: "USDT" as const },
];

describe("buildPayments", () => {
  it("maps people to token transfers in base units", () => {
    const p = buildPayments(items, cfg);
    expect(p).toEqual([
      { token: USDC, to: getAddress(items[0].wallet), amount: 9_400_000_000n },
      { token: USDC, to: getAddress(items[1].wallet), amount: 500_000n },
      { token: USDT, to: getAddress(items[2].wallet), amount: 6_900_000_000n },
    ]);
    const need = requiredAllowances(p);
    expect(need.get(USDC)).toBe(9_400_500_000n);
    expect(need.get(USDT)).toBe(6_900_000_000n);
  });

  it("refuses a token that isn't configured on the chain", () => {
    const onlyUsdc = { ...cfg, tokens: { USDC: cfg.tokens.USDC } };
    expect(() => buildPayments(items, onlyUsdc)).toThrow(/USDT is not available/);
  });
});

describe("on-chain matching", () => {
  it("creates stable, distinct run refs", () => {
    expect(onchainRef("a")).toBe(onchainRef("a"));
    expect(onchainRef("a")).not.toBe(onchainRef("b"));
    expect(onchainRef("a")).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("matches regardless of order and casing, and catches any difference", () => {
    const p = buildPayments(items, cfg);
    const shuffled = [p[2], p[0], { ...p[1], to: p[1].to.toLowerCase() as `0x${string}` }];
    expect(samePayments(p, shuffled)).toBe(true);
    expect(samePayments(p, p.slice(0, 2))).toBe(false);
    expect(samePayments(p, [p[0], p[1], { ...p[2], amount: p[2].amount + 1n }])).toBe(false);
    expect(samePayments(p, [p[0], p[1], { ...p[2], to: p[0].to }])).toBe(false);
  });
});
