import type { TokenSymbol } from "./chains";
import type { Role } from "./roles";
import type { RunReview } from "./changes";
import type { RunItem } from "./payments";

export type Org = {
  id: string;
  name: string;
  ownerAddress: string;
  payDay: number | null;
  /** Invoice details: who invoices are billed to, and how they're numbered. */
  legalName: string | null;
  address: string | null;
  taxId: string | null;
  invoicePrefix: string;
  invoiceNote: string | null;
  /** Extra admin sign-offs a payroll needs before the treasury can send it. 0 = none. */
  approvalsRequired: number;
  /**
   * Two-person payroll: the accounts team prepares and signs each run, and the treasury approves it
   * by sending. Whoever prepares can never send. On by default; the owner can turn it off.
   */
  twoPerson: boolean;
};
export type Membership = { orgId: string; name: string; role: Role };
export type Me = { address: string; chainId: number; org: Org; role: Role; memberships: Membership[] };
export type Member = { address: string; name: string; role: Role; addedBy: string | null; createdAt: string };
export type Employee = {
  id: string;
  name: string;
  role: string;
  wallet: string;
  amount: string;
  token: TokenSymbol;
  /** Optional, printed on their invoices. */
  email: string;
  address: string;
  taxId: string;
};
export type RunStatus = "draft" | "pending" | "approved" | "rejected" | "cancelled" | "submitted" | "confirmed" | "failed";
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
  /** Who prepared it, when it went for approval, and who sent it. */
  createdBy: string | null;
  requestedAt: string | null;
  submittedBy: string | null;
  approvalCount: number;
  rejection: { by: string; reason: string; at: string } | null;
  /** The preparer's wallet signature over this exact run, made when they submitted it. */
  preparedSignature: string | null;
};
export type Approval = { approver: string; name: string; at: string; signature: string };
export type RunWithItems = { run: Run; items: RunItem[] };
/** A run with what an approver or the sender needs to decide. */
export type RunDetail = RunWithItems & {
  approvals: Approval[];
  approvalsRequired: number;
  review: RunReview;
  /** New or changed wallets the preparer said they confirmed with each person. */
  verifiedWallets: string[];
};
export type NewRun = RunWithItems & { review: RunReview };

export type ActivityAction =
  | "signed_in"
  | "person_added"
  | "person_updated"
  | "person_removed"
  | "people_imported"
  | "run_sent"
  | "run_tx_found"
  | "run_paid"
  | "run_failed"
  | "company_updated"
  | "run_requested"
  | "run_approved"
  | "run_rejected"
  | "run_cancelled"
  | "member_added"
  | "member_updated"
  | "member_removed"
  | "policy_updated";
export type Activity = { id: string; at: string; actor: string; action: ActivityAction; detail: Record<string, unknown> };
export type Records = { org: Org; runs: RunWithItems[] };
