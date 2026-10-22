import { getAddress, keccak256, stringToHex, type Address, type Hex } from "viem";
import type { ChainConfig, TokenSymbol } from "./chains";
import { toUnits } from "./money";

export type RunItem = {
  name: string;
  role: string;
  wallet: string;
  amount: string;
  token: TokenSymbol;
  /** Links the snapshot back to the person in People, so changes between runs can be detected. */
  employeeId?: string | null;
};
export type Payment = { token: Address; to: Address; amount: bigint };

/** The bytes32 id written on-chain so a transaction can be matched back to its payroll run. */
export function onchainRef(runId: string): Hex {
  return keccak256(stringToHex(`wagefold:run:${runId}`));
}

export function buildPayments(items: RunItem[], cfg: ChainConfig): Payment[] {
  return items.map((item) => {
    const token = cfg.tokens[item.token];
    if (!token) throw new Error(`${item.token} is not available on ${cfg.chain.name}.`);
    return { token: token.address, to: getAddress(item.wallet), amount: toUnits(item.amount) };
  });
}

/** Total each token the payroll contract needs approval for. */
export function requiredAllowances(payments: Payment[]): Map<Address, bigint> {
  const need = new Map<Address, bigint>();
  for (const p of payments) need.set(p.token, (need.get(p.token) ?? 0n) + p.amount);
  return need;
}

/** Order-independent key for comparing intended payments with what happened on-chain. */
export function paymentKey(p: { token: string; to: string; amount: bigint }): string {
  return `${p.token.toLowerCase()}|${p.to.toLowerCase()}|${p.amount}`;
}

export function samePayments(
  expected: { token: string; to: string; amount: bigint }[],
  actual: { token: string; to: string; amount: bigint }[],
): boolean {
  if (expected.length !== actual.length) return false;
  const a = expected.map(paymentKey).sort();
  const b = actual.map(paymentKey).sort();
  return a.every((k, i) => k === b[i]);
}
