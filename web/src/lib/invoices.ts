/**
 * Invoices are issued automatically, one per payment in a paid run, and numbered in order per
 * company. Each one stores a full snapshot of who, what and how much at the moment it was issued,
 * so editing a person or the company later never changes an invoice that already exists.
 */
import type { TokenSymbol } from "./chains";
import { explorerTx, getChainConfig } from "./chains";
import type { RunItem } from "./payments";
import { paidAt, rateFor, usdValue, type Rate } from "./records";
import type { Org, Run } from "./types";

export type Party = { name: string; role?: string; address: string; taxId: string; email?: string; wallet: string };

export type InvoiceData = {
  label: string;
  issuedAt: string;
  /** "2026-10": the month the work is billed for, the month the run was paid. */
  period: string;
  supplier: Party;
  customer: Party;
  description: string;
  amount: string;
  token: TokenSymbol;
  rate: Rate;
  usd: string;
  chain: string;
  txHash: string | null;
  explorer: string | null;
  runId: string;
  note: string;
};

export type Invoice = { id: string; number: number; runId: string; position: number; issuedAt: string; data: InvoiceData };

export type Billing = { email: string; address: string; taxId: string };

export const DEFAULT_PREFIX = "INV-";
export const PREFIX_RE = /^[A-Za-z0-9/_-]{0,12}$/;

export function invoiceLabel(prefix: string, number: number): string {
  return `${prefix}${String(number).padStart(4, "0")}`;
}

export function periodLabel(period: string): string {
  const [y, m] = period.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

export type InvoiceRun = Pick<Run, "id" | "chainId" | "paidAt" | "confirmedAt" | "createdAt" | "usdRates"> & { txHash: string | null };

/** The invoice for one payment, as issued now. `billing` is the person's current invoice details. */
export function buildInvoice(org: Org, run: InvoiceRun, item: RunItem, billing: Billing | undefined, number: number): InvoiceData {
  const when = paidAt(run);
  const period = when.slice(0, 7);
  const rate = rateFor(run, item.token);
  const customerName = org.legalName?.trim() || org.name;
  return {
    label: invoiceLabel(org.invoicePrefix ?? DEFAULT_PREFIX, number),
    issuedAt: when,
    period,
    supplier: {
      name: item.name,
      role: item.role,
      address: billing?.address ?? "",
      taxId: billing?.taxId ?? "",
      email: billing?.email ?? "",
      wallet: item.wallet,
    },
    customer: { name: customerName, address: org.address ?? "", taxId: org.taxId ?? "", wallet: org.ownerAddress },
    description: `${item.role?.trim() ? `${item.role.trim()} services` : "Services"}, ${periodLabel(period)}`,
    amount: item.amount,
    token: item.token,
    rate,
    usd: usdValue(item.amount, rate.rate),
    chain: getChainConfig(run.chainId)?.chain.name ?? `Chain ${run.chainId}`,
    txHash: run.txHash,
    explorer: run.txHash ? explorerTx(run.chainId, run.txHash) ?? null : null,
    runId: run.id,
    note: org.invoiceNote?.trim() ?? "",
  };
}

export function invoiceFilename(inv: Pick<InvoiceData, "label" | "supplier">): string {
  const who = inv.supplier.name.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "").slice(0, 40) || "supplier";
  const label = inv.label.replace(/[^A-Za-z0-9_-]+/g, "-");
  return `invoice-${label}-${who}.pdf`;
}
