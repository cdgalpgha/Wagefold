/**
 * Payroll approvals are wallet signatures, not button clicks. Each approver signs a plain-text
 * message naming the exact run: totals, treasury, network and a hash of every payment. The server
 * rebuilds the same message from its own snapshot and checks the signature, so a stolen session
 * can't approve anything and a signature for one run can't be reused for another.
 */
import { encodeAbiParameters, getAddress, keccak256, type Hex } from "viem";
import type { ChainConfig } from "./chains";
import { sumByToken, totalsLabel } from "./money";
import { buildPayments, type RunItem } from "./payments";

/** keccak256 of exactly what the contract will be asked to pay: the run reference and every (token, to, amount). */
export function paymentsHash(onchainRef: Hex, items: RunItem[], cfg: ChainConfig): Hex {
  const payments = buildPayments(items, cfg);
  return keccak256(
    encodeAbiParameters(
      [
        { type: "bytes32" },
        { type: "tuple[]", components: [{ name: "token", type: "address" }, { name: "to", type: "address" }, { name: "amount", type: "uint256" }] },
      ],
      [onchainRef, payments],
    ),
  );
}

export type ApprovalSubject = {
  runId: string;
  onchainRef: Hex;
  items: RunItem[];
  cfg: ChainConfig;
  company: string;
  treasury: string;
  approver: string;
};

export function approvalMessage(s: ApprovalSubject): string {
  const n = s.items.length;
  return [
    "Wagefold payroll approval",
    "",
    // One line, so a company name can't add lines that look like part of the approval.
    `I approve this payroll for ${s.company.replace(/\s+/g, " ").trim()}:`,
    `Pay ${n} ${n === 1 ? "person" : "people"} ${totalsLabel(sumByToken(s.items))}`,
    `From treasury ${getAddress(s.treasury)}`,
    `On ${s.cfg.chain.name} (chain ${s.cfg.chain.id})`,
    "",
    `Run: ${s.runId}`,
    `Payments hash: ${paymentsHash(s.onchainRef, s.items, s.cfg)}`,
    `Approver: ${getAddress(s.approver)}`,
    "",
    "Signing approves this exact list of payments. It doesn't move funds or cost gas.",
  ].join("\n");
}
