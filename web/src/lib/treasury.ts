/**
 * Moving a company to a new treasury wallet takes two wallets: the owner proposes the new address,
 * then the new wallet signs this message to accept. The message names the exact proposal, so a
 * signature can't be reused for another one, and the proposal closes once accepted.
 */
import { getAddress } from "viem";

/** How long a proposal stays open for the new wallet to accept. */
export const TRANSFER_TTL_HOURS = 72;

export type TransferSubject = {
  id: string;
  orgId: string;
  company: string;
  from: string;
  to: string;
  expiresAt: Date;
};

export function treasuryTransferMessage(s: TransferSubject): string {
  return [
    "Wagefold treasury change",
    "",
    // One line, so a company name can't add lines that look like part of the message.
    `I accept becoming the treasury wallet of ${s.company.replace(/\s+/g, " ").trim()}.`,
    `Current treasury: ${getAddress(s.from)}`,
    `New treasury: ${getAddress(s.to)}`,
    "",
    `Company: ${s.orgId}`,
    `Proposal: ${s.id}`,
    `Expires: ${s.expiresAt.toISOString()}`,
    "",
    "From now on this company's payroll is paid from, and only sent by, the new treasury.",
    "Signing doesn't move funds or cost gas.",
  ].join("\n");
}
