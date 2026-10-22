import type { TokenSymbol } from "./chains";
import type { RunReview } from "./changes";
import type { RunItem } from "./payments";

export type Me = { address: string; chainId: number; org: { id: string; name: string; ownerAddress: string } };
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
};
export type RunWithItems = { run: Run; items: RunItem[] };
export type NewRun = RunWithItems & { review: RunReview };
