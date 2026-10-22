import type { TokenSymbol } from "./chains";
import { toUnits } from "./money";
import type { RunItem } from "./payments";

export type Change =
  | { kind: "added"; name: string; amount: string; token: TokenSymbol }
  | { kind: "removed"; name: string; amount: string; token: TokenSymbol }
  | { kind: "pay"; name: string; before: string; after: string; token: TokenSymbol; beforeToken: TokenSymbol }
  | { kind: "wallet"; name: string; before: string; after: string };

export type RunReview = {
  /** True when this organization has never completed a payroll run. */
  firstRun: boolean;
  /** What differs from the last paid run, people matched by their id in People. */
  changes: Change[];
  /** Wallets in this run that have never received a payment from this organization. */
  newWallets: string[];
};

const ORDER: Record<Change["kind"], number> = { wallet: 0, added: 1, pay: 2, removed: 3 };

/**
 * Compares a new run with the last paid one. Wallet changes come first because a changed or
 * never-paid address is the costliest mistake payroll can make: payments can't be reversed.
 */
export function reviewRun(previous: RunItem[] | null, next: RunItem[], paidWallets: string[]): RunReview {
  const paid = new Set(paidWallets.map((w) => w.toLowerCase()));
  const newWallets = next.filter((i) => !paid.has(i.wallet.toLowerCase())).map((i) => i.wallet);
  if (!previous) return { firstRun: true, changes: [], newWallets };

  const key = (i: RunItem) => i.employeeId ?? `wallet:${i.wallet.toLowerCase()}`;
  const before = new Map(previous.map((i) => [key(i), i]));
  const changes: Change[] = [];

  for (const item of next) {
    const prev = before.get(key(item));
    before.delete(key(item));
    if (!prev) {
      changes.push({ kind: "added", name: item.name, amount: item.amount, token: item.token });
      continue;
    }
    if (prev.wallet.toLowerCase() !== item.wallet.toLowerCase()) {
      changes.push({ kind: "wallet", name: item.name, before: prev.wallet, after: item.wallet });
    }
    if (prev.token !== item.token || toUnits(prev.amount) !== toUnits(item.amount)) {
      changes.push({ kind: "pay", name: item.name, before: prev.amount, after: item.amount, token: item.token, beforeToken: prev.token });
    }
  }
  for (const gone of before.values()) {
    changes.push({ kind: "removed", name: gone.name, amount: gone.amount, token: gone.token });
  }
  changes.sort((a, b) => ORDER[a.kind] - ORDER[b.kind] || a.name.localeCompare(b.name));
  return { firstRun: false, changes, newWallets };
}
