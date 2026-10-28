import type { TokenSymbol } from "./chains";
import { formatAmount, toUnits } from "./money";
import type { Activity } from "./types";

type PersonFields = { name: string; role: string; wallet: string; amount: string; token: TokenSymbol; email?: string; address?: string; taxId?: string };
export type FieldChange = [before: string, after: string];

const FIELDS = ["name", "role", "wallet", "amount", "token", "email", "address", "taxId"] as const;

/** What changed on a person, field by field, so the log reads "wallet 0x3C44… → 0x9F12…" rather than "edited". */
export function personChanges(before: PersonFields, after: PersonFields): Partial<Record<(typeof FIELDS)[number], FieldChange>> {
  const out: Partial<Record<(typeof FIELDS)[number], FieldChange>> = {};
  for (const f of FIELDS) {
    const same =
      f === "wallet"
        ? before.wallet.toLowerCase() === after.wallet.toLowerCase()
        : f === "amount"
          ? toUnits(before.amount) === toUnits(after.amount)
          : (before[f] ?? "") === (after[f] ?? "");
    if (!same) out[f] = [before[f] ?? "", after[f] ?? ""];
  }
  return out;
}

const short = (a: unknown) => (typeof a === "string" && a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : String(a ?? ""));
const str = (v: unknown) => (typeof v === "string" ? v : "");

/** One line for the activity feed. Values come from the database, so everything is treated as plain text. */
export function describeActivity(a: Activity): { title: string; detail?: string; tone: "neutral" | "warn" | "good" | "bad" } {
  // Older entries or unknown actions still render as plain text.
  const d = a.detail;
  switch (a.action) {
    case "signed_in":
      return { title: "Signed in", tone: "neutral" };
    case "person_added":
      return { title: `Added ${str(d.name)}`, detail: `${formatSafe(d.amount)} ${str(d.token)} to ${short(d.wallet)}`, tone: "neutral" };
    case "people_imported":
      return { title: `Imported ${Number(d.count) || 0} people from CSV`, tone: "neutral" };
    case "person_removed":
      return { title: `Removed ${str(d.name)}`, detail: `Was ${formatSafe(d.amount)} ${str(d.token)} to ${short(d.wallet)}`, tone: "neutral" };
    case "person_updated": {
      const changes = (d.changes ?? {}) as Record<string, FieldChange>;
      const parts = Object.entries(changes).map(([field, [b, n]]) =>
        field === "wallet"
          ? `wallet ${short(b)} → ${short(n)}`
          : field === "amount"
            ? `pay ${formatSafe(b)} → ${formatSafe(n)}`
            : `${field === "taxId" ? "tax ID" : field} “${b}” → “${n}”`,
      );
      return { title: `${changes.wallet ? "Changed the wallet of" : "Edited"} ${str(d.name)}`, detail: parts.join(" · "), tone: changes.wallet ? "warn" : "neutral" };
    }
    case "run_tx_found":
      return { title: "Found the payroll transaction on-chain", detail: `Transaction ${short(d.txHash)}`, tone: "neutral" };
    case "run_sent": {
      const verified = Array.isArray(d.verifiedWallets) ? d.verifiedWallets.length : 0;
      return {
        title: `Approved and sent payroll to ${Number(d.recipients) || 0} people`,
        detail: `Transaction ${short(d.txHash)}${verified ? ` · ${verified} new or changed ${verified === 1 ? "wallet" : "wallets"} confirmed by the sender` : ""}`,
        tone: "neutral",
      };
    }
    case "run_paid":
      return { title: "Payroll verified on-chain", detail: `Transaction ${short(d.txHash)}`, tone: "good" };
    case "run_failed":
      return { title: "Payroll not recorded as paid", detail: str(d.reason), tone: "bad" };
    case "run_requested":
      return {
        title: `${d.signed ? "Signed and submitted" : "Submitted"} payroll for ${Number(d.recipients) || 0} people ${d.status === "approved" ? "to the treasury" : "for sign-off"}`,
        detail: Array.isArray(d.verifiedWallets) && d.verifiedWallets.length ? `${d.verifiedWallets.length} new or changed wallets confirmed by the preparer` : undefined,
        tone: "neutral",
      };
    case "run_approved":
      return { title: "Signed off payroll with a wallet signature", detail: `${Number(d.approvals) || 0} sign-off${Number(d.approvals) === 1 ? "" : "s"} so far${d.status === "approved" ? " · ready for the treasury" : ""}`, tone: "good" };
    case "run_rejected":
      return { title: "Rejected payroll", detail: str(d.reason), tone: "bad" };
    case "run_cancelled":
      return { title: "Cancelled a payroll before it was sent", tone: "neutral" };
    case "member_added":
      return { title: `Added ${str(d.name) || short(d.address)} to the team as ${str(d.role)}`, detail: short(d.address), tone: "warn" };
    case "member_updated": {
      const changes = (d.changes ?? {}) as Record<string, FieldChange>;
      const parts = Object.entries(changes).map(([f, [b, n]]) => `${f} ${b} → ${n}`);
      return { title: `Changed ${str(d.name) || short(d.address)}'s team access`, detail: parts.join(" · "), tone: "warn" };
    }
    case "member_removed":
      return { title: `Removed ${str(d.name) || short(d.address)} from the team`, detail: `Was ${str(d.role)} · ${short(d.address)}`, tone: "warn" };
    case "policy_updated": {
      const changes = (d.changes ?? {}) as Record<string, FieldChange>;
      const parts = [
        changes.twoPerson ? `Two-person payroll ${changes.twoPerson[0]} → ${changes.twoPerson[1]}` : null,
        changes.approvalsRequired ? `Extra sign-offs ${changes.approvalsRequired[0] || "0"} → ${changes.approvalsRequired[1] || "0"}` : null,
      ].filter(Boolean);
      return { title: "Changed the payroll rule", detail: parts.join(" · "), tone: "warn" };
    }
    case "company_updated": {
      const changes = (d.changes ?? {}) as Record<string, FieldChange>;
      const NAMES: Record<string, string> = { payDay: "payday", legalName: "legal name", taxId: "tax ID", invoicePrefix: "invoice prefix", invoiceNote: "invoice note" };
      const parts = Object.entries(changes).map(([f, [b, n]]) => `${NAMES[f] ?? f} ${b || "not set"} → ${n || "not set"}`);
      return { title: "Updated company settings", detail: parts.join(" · "), tone: "neutral" };
    }
    default:
      return { title: String(a.action).replace(/_/g, " "), tone: "neutral" };
  }
}

function formatSafe(v: unknown): string {
  try {
    return formatAmount(String(v));
  } catch {
    return String(v ?? "");
  }
}
