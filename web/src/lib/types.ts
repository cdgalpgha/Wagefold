import type { TokenSymbol } from "./chains";
import type { RunReview } from "./changes";
import type { RunItem } from "./payments";

export type Org = { id: string; name: string; ownerAddress: string; payDay: number | null };
export type Me = { address: string; chainId: number; org: Org };
export type Employee = { id: string; name: string; role: string; wallet: string; amount: string; token: TokenSymbol };
export type RunStatus = "draft" | "submitted" | "confirmed" | "failed";
export type Run = {
  id: string;
  chainId: number;
  onchainRef: `0x${string}`;
  status: RunStatus;
  failureReason: string | null;
  txHash: `0x${string}` | null;
  recipientCount: number;
  totals: Record<string, string>;
  createdAt: string;
  confirmedAt: string | null;
  /** From the confirmed block: when it was paid, where, the network fee in ETH and the USD rate per token. */
  paidAt: string | null;
  blockNumber: string | null;
  networkFee: string | null;
  usdRates: Partial<Record<TokenSymbol, { rate: string; source: string }>> | null;
};
export type RunWithItems = { run: Run; items: RunItem[] };
export type NewRun = RunWithItems & { review: RunReview };

export type ActivityAction =
  | "signed_in"
  | "person_added"
  | "person_updated"
  | "person_removed"
  | "people_imported"
  | "run_sent"
  | "run_paid"
  | "run_failed"
  | "company_updated";
export type Activity = { id: string; at: string; actor: string; action: ActivityAction; detail: Record<string, unknown> };
export type Records = { org: Org; runs: RunWithItems[] };
