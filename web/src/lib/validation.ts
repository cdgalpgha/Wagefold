import { getAddress, isAddress, zeroAddress } from "viem";
import { z } from "zod";
import { TOKEN_SYMBOLS } from "./chains";
import { PREFIX_RE } from "./invoices";
import { normalizeAmount } from "./money";
import { ASSIGNABLE_ROLES, MAX_APPROVALS } from "./roles";
import { isPayDay } from "./schedule";

/** No line breaks or other control characters: names appear inside messages people sign. */
const oneLine = (v: string) => !/[\u0000-\u001f\u007f\u2028\u2029]/.test(v);
/** Multi-line text (addresses): line breaks are fine, other control characters (such as NUL) are not. */
const textOnly = (v: string) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v);

// Invoices are one page; an address is printed in full, so it has to stay short.
const fewLines = (v: string) => v.split("\n").length <= 6;

export const employeeInput = z.object({
  name: z.string().trim().min(1, "Add a name.").max(80, "Keep the name under 80 characters.").refine((v) => oneLine(v), "The name must be one line."),
  role: z.string().trim().max(80, "Keep the role under 80 characters.").refine((v) => oneLine(v), "The role must be one line.").default(""),
  wallet: z
    .string()
    .trim()
    .refine((v) => /^0x[0-9a-fA-F]{40}$/.test(v), "The wallet must be 0x followed by 40 characters (0-9, a-f).")
    // Mixed-case addresses carry an EIP-55 checksum; a mismatch almost always means a typo.
    .refine((v) => isAddress(v, { strict: true }), "That address has a typo (its checksum doesn't match). Copy it again.")
    .refine((v) => v.toLowerCase() !== zeroAddress, "That is the zero address. Funds sent there are lost.")
    .transform((v) => getAddress(v)),
  amount: z
    .union([z.string(), z.number()])
    .transform((v, ctx) => {
      const n = normalizeAmount(v);
      if (!n) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Pay must be a positive amount with up to 6 decimals." });
        return z.NEVER;
      }
      return n;
    }),
  token: z.enum(TOKEN_SYMBOLS, { error: "Token must be USDC or USDT." }),
  email: z
    .string()
    .trim()
    .max(200, "Keep the email under 200 characters.")
    .refine(oneLine, "That email address doesn't look right.")
    .refine((v) => v === "" || /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(v), "That email address doesn't look right.")
    .default(""),
  address: z
    .string()
    .trim()
    .max(300, "Keep the address under 300 characters.")
    .refine(fewLines, "Keep the address to 6 lines.")
    .refine(textOnly, "The address has characters that can't be stored.")
    .default(""),
  taxId: z.string().trim().max(50, "Keep the tax ID under 50 characters.").refine(oneLine, "The tax ID must be one line.").default(""),
});

export type EmployeeInput = z.infer<typeof employeeInput>;

/** Company settings. Strict: unknown fields (such as ownerAddress) are rejected, not ignored. */
export const orgPatchInput = z
  .object({
    name: z.string().trim().min(1, "Company name can't be empty.").max(80, "Company name must be 80 characters or fewer.").refine(oneLine, "Company name must be one line.").optional(),
    payDay: z.union([z.null(), z.number().refine(isPayDay, "Payday must be a day from 1 to 28, or the last day of the month.")]).optional(),
    legalName: z.string().trim().max(120, "Keep the legal name under 120 characters.").refine(oneLine, "Legal name must be one line.").optional(),
    address: z
      .string()
      .trim()
      .max(300, "Keep the address under 300 characters.")
      .refine(fewLines, "Keep the address to 6 lines.")
      .refine(textOnly, "The address has characters that can't be stored.")
      .optional(),
    taxId: z.string().trim().max(50, "Keep the tax ID under 50 characters.").refine(oneLine, "The tax ID must be one line.").optional(),
    invoicePrefix: z.string().trim().regex(PREFIX_RE, "Invoice prefix: up to 12 letters, numbers, - / or _.").optional(),
    invoiceNote: z.string().trim().max(500, "Keep the invoice note under 500 characters.").refine(oneLine, "The invoice note must be one line.").optional(),
  })
  .strict();
export type OrgPatchInput = z.infer<typeof orgPatchInput>;

export function firstError(err: z.ZodError): string {
  const issue = err.issues[0];
  // readJson returns null for bodies that aren't JSON (or carry NUL characters).
  if (issue?.code === "invalid_type" && issue.path.length === 0) return "That request couldn't be read.";
  return issue?.message ?? "Invalid input.";
}

/**
 * Parses CSV text with the header row: name,role,wallet,amount,token (plus optional email,address,tax_id)
 * Quoted fields are supported so names and amounts may contain commas.
 */
export function parseEmployeesCsv(text: string): { rows: Record<string, string>[]; error?: string } {
  const lines = text.replace(/\r/g, "").split("\n").filter((l) => l.trim());
  if (lines.length === 0) return { rows: [], error: "The file is empty." };
  const header = splitCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  const required = ["name", "wallet", "amount"];
  const missing = required.filter((r) => !header.includes(r));
  if (missing.length) return { rows: [], error: `Missing column${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}.` };
  const rows = lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    const row: Record<string, string> = {};
    header.forEach((h, i) => (row[h] = (cells[i] ?? "").trim()));
    if (!row.token) row.token = "USDC";
    if (row.tax_id !== undefined) {
      row.taxId = row.tax_id;
      delete row.tax_id;
    }
    row.token = row.token.toUpperCase();
    return row;
  });
  return { rows };
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

/** A teammate: their wallet, a display name, and a role other than owner. */
export const memberInput = z
  .object({
    address: z
      .string()
      .trim()
      .refine((v) => isAddress(v, { strict: true }), "Enter a valid wallet address (check the capital letters if you copied it).")
      .refine((v) => v.toLowerCase() !== zeroAddress, "That is the zero address.")
      .transform((v) => getAddress(v)),
    name: z.string().trim().min(1, "Add a name.").max(80, "Keep the name under 80 characters.").refine((v) => oneLine(v), "The name must be one line."),
    role: z.enum(ASSIGNABLE_ROLES, { error: "Role must be admin, preparer or viewer." }),
  })
  .strict();

export const memberPatchInput = z
  .object({
    name: memberInput.shape.name.optional(),
    role: memberInput.shape.role.optional(),
  })
  .strict();

export const policyInput = z
  .object({
    approvalsRequired: z.number().int().min(0).max(MAX_APPROVALS, `Up to ${MAX_APPROVALS} approvals.`).optional(),
    twoPerson: z.boolean().optional(),
  })
  .strict()
  .refine((p) => p.approvalsRequired !== undefined || p.twoPerson !== undefined, "Nothing to change.");
