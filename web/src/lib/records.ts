/**
 * Records finance teams and recipients ask for: a per-payment ledger export, a journal entry per
 * run, yearly totals per payee, and a payslip per payment. Built from paid runs only, so every
 * line ties to an on-chain transaction the server verified.
 */
import { formatUnits } from "viem";
import { explorerTx, getChainConfig, TOKEN_DECIMALS, TOKEN_SYMBOLS, type TokenSymbol } from "./chains";
import { canonical, toUnits } from "./money";
import type { RunItem } from "./payments";
import type { Run } from "./types";

export type PaidRun = { run: Run; items: RunItem[] };
export type Rate = { rate: string; source: string };

/** Used when no price feed is configured. Exports say so, rather than passing $1 off as a market price. */
export const PAR: Rate = { rate: "1", source: "par (1 token = 1 USD, not a market price)" };

export function rateFor(run: Run, token: TokenSymbol): Rate {
  return run.usdRates?.[token] ?? PAR;
}

/** Exact decimal multiply, rounded half-up to cents: "9400" x "0.99987" -> "9398.78" */
export function usdValue(amount: string, rate: string): string {
  const RATE_DECIMALS = 8;
  const a = toUnits(canonical(amount)); // 6 decimals
  const [w, f = ""] = rate.split(".");
  const r = BigInt(w + f.padEnd(RATE_DECIMALS, "0").slice(0, RATE_DECIMALS));
  const scale = 10n ** BigInt(TOKEN_DECIMALS + RATE_DECIMALS - 2); // down to cents
  const cents = (a * r + scale / 2n) / scale;
  const whole = cents / 100n;
  const frac = (cents % 100n).toString().padStart(2, "0");
  return `${whole}.${frac}`;
}

export function addUsd(a: string, b: string): string {
  const c = (x: string) => BigInt(x.replace(".", ""));
  const total = c(a) + c(b);
  return `${total / 100n}.${(total % 100n).toString().padStart(2, "0")}`;
}

export const paidAt = (run: Run) => run.paidAt ?? run.confirmedAt ?? run.createdAt;

// CSV ----------------------------------------------------------------------------------------------

/**
 * One CSV cell. Names and roles are typed by users, so a value such as `=HYPERLINK(...)` must not
 * run as a formula when an accountant opens the file in Excel or Sheets (CSV injection).
 */
export function csvCell(value: string | number | null | undefined): string {
  let s = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: (string | number | null | undefined)[][]): string {
  return rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

const sortByDate = (runs: PaidRun[]) => [...runs].sort((a, b) => paidAt(a.run).localeCompare(paidAt(b.run)));

/** Every payment as one row: the ledger an accountant reconciles against the chain. */
export function paymentsCsv(runs: PaidRun[], payer: string): string {
  const rows: (string | number | null)[][] = [[
    "paid_at_utc", "run_id", "chain", "chain_id", "payer_wallet", "recipient_name", "recipient_role", "recipient_wallet",
    "token", "token_contract", "amount", "usd_rate", "usd_rate_source", "usd_value", "tx_hash", "block_number",
    "run_network_fee_eth", "explorer_url",
  ]];
  for (const { run, items } of sortByDate(runs)) {
    const cfg = getChainConfig(run.chainId);
    for (const i of items) {
      const rate = rateFor(run, i.token);
      rows.push([
        paidAt(run), run.id, cfg?.chain.name ?? "", run.chainId, payer, i.name, i.role, i.wallet,
        i.token, cfg?.tokens[i.token]?.address ?? "", canonical(i.amount), rate.rate, rate.source, usdValue(i.amount, rate.rate),
        run.txHash, run.blockNumber, run.networkFee, run.txHash ? explorerTx(run.chainId, run.txHash) ?? "" : "",
      ]);
    }
  }
  return toCsv(rows);
}

/**
 * One balanced journal entry per run in QuickBooks Online's journal import layout: a debit per
 * person (so line items stay visible in the books) and a credit per stablecoin account.
 */
export function journalCsv(runs: PaidRun[]): string {
  const rows: (string | number | null)[][] = [["Journal No.", "Journal Date", "Account Name", "Debits", "Credits", "Description", "Name"]];
  for (const [n, { run, items }] of sortByDate(runs).entries()) {
    const no = `WF-${String(n + 1).padStart(4, "0")}`;
    const date = paidAt(run).slice(0, 10);
    const memo = `Wagefold payroll ${run.id.slice(0, 8)} tx ${run.txHash ?? ""}`;
    const credits: Record<string, string> = {};
    for (const i of items) {
      const usd = usdValue(i.amount, rateFor(run, i.token).rate);
      credits[i.token] = addUsd(credits[i.token] ?? "0.00", usd);
      rows.push([no, date, "Contractor payments", usd, "", `${memo} · ${canonical(i.amount)} ${i.token}`, i.name]);
    }
    for (const t of TOKEN_SYMBOLS) {
      if (credits[t]) rows.push([no, date, `${t} (stablecoin)`, "", credits[t], memo, ""]);
    }
  }
  return toCsv(rows);
}

// Yearly totals and payslips ---------------------------------------------------------------------

const personKey = (i: RunItem) => i.employeeId ?? `wallet:${i.wallet.toLowerCase()}`;
const yearOf = (iso: string) => Number(iso.slice(0, 4));

export type PayeeYear = {
  name: string;
  role: string;
  wallet: string;
  wallets: number;
  payments: number;
  tokens: Partial<Record<TokenSymbol, string>>;
  usd: string;
};

/** What each person was paid in a calendar year (UTC), for year-end forms such as the US 1099-NEC. */
export function payeeYear(runs: PaidRun[], year: number): PayeeYear[] {
  const byPerson = new Map<string, PayeeYear & { walletSet: Set<string> }>();
  for (const { run, items } of sortByDate(runs)) {
    if (yearOf(paidAt(run)) !== year) continue;
    for (const i of items) {
      const k = personKey(i);
      const p = byPerson.get(k) ?? { name: i.name, role: i.role, wallet: i.wallet, wallets: 0, payments: 0, tokens: {}, usd: "0.00", walletSet: new Set() };
      Object.assign(p, { name: i.name, role: i.role, wallet: i.wallet }); // latest details win
      p.walletSet.add(i.wallet.toLowerCase());
      p.payments += 1;
      p.tokens[i.token] = p.tokens[i.token] ? sumDecimal(p.tokens[i.token]!, i.amount) : canonical(i.amount);
      p.usd = addUsd(p.usd, usdValue(i.amount, rateFor(run, i.token).rate));
      byPerson.set(k, p);
    }
  }
  return [...byPerson.values()]
    .map(({ walletSet, ...p }) => ({ ...p, wallets: walletSet.size }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function sumDecimal(a: string, b: string): string {
  return formatUnits(toUnits(canonical(a)) + toUnits(canonical(b)), TOKEN_DECIMALS);
}

export function payeeYearCsv(runs: PaidRun[], year: number): string {
  const rows: (string | number)[][] = [["year", "name", "role", "latest_wallet", "wallets_used", "payments", "usdc", "usdt", "usd_value"]];
  for (const p of payeeYear(runs, year)) {
    rows.push([year, p.name, p.role, p.wallet, p.wallets, p.payments, p.tokens.USDC ?? "0", p.tokens.USDT ?? "0", p.usd]);
  }
  return toCsv(rows);
}

export type Payslip = {
  employer: string;
  payer: string;
  runId: string;
  paidAt: string;
  chain: string;
  name: string;
  role: string;
  wallet: string;
  amount: string;
  token: TokenSymbol;
  rate: Rate;
  usd: string;
  txHash: string | null;
  explorer: string | null;
  ytd: { year: number; payments: number; tokens: Partial<Record<TokenSymbol, string>>; usd: string };
};

/** A payslip for one payment, with year-to-date totals up to and including it. */
export function payslip(runs: PaidRun[], employer: string, payer: string, runId: string, position: number): Payslip | null {
  const target = runs.find((r) => r.run.id === runId);
  const item = target?.items[position];
  if (!target || !item) return null;
  const when = paidAt(target.run);
  const year = yearOf(when);
  const ytd = { year, payments: 0, tokens: {} as Partial<Record<TokenSymbol, string>>, usd: "0.00" };
  for (const { run, items } of runs) {
    const at = paidAt(run);
    if (yearOf(at) !== year || at > when) continue;
    for (const i of items) {
      if (personKey(i) !== personKey(item)) continue;
      ytd.payments += 1;
      ytd.tokens[i.token] = ytd.tokens[i.token] ? sumDecimal(ytd.tokens[i.token]!, i.amount) : canonical(i.amount);
      ytd.usd = addUsd(ytd.usd, usdValue(i.amount, rateFor(run, i.token).rate));
    }
  }
  const rate = rateFor(target.run, item.token);
  return {
    employer,
    payer,
    runId,
    paidAt: when,
    chain: getChainConfig(target.run.chainId)?.chain.name ?? `Chain ${target.run.chainId}`,
    name: item.name,
    role: item.role,
    wallet: item.wallet,
    amount: canonical(item.amount),
    token: item.token,
    rate,
    usd: usdValue(item.amount, rate.rate),
    txHash: target.run.txHash,
    explorer: target.run.txHash ? explorerTx(target.run.chainId, target.run.txHash) ?? null : null,
    ytd,
  };
}

// Payslip document -------------------------------------------------------------------------------

function esc(s: string | number | null | undefined): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

const money = (v: string) => {
  const [w, f = ""] = v.split(".");
  return `${w.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${f.padEnd(2, "0")}`;
};

export function payslipDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
}

export function payslipFilename(p: Payslip): string {
  const who = p.name.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "").slice(0, 40) || "payee";
  return `payslip-${who}-${p.paidAt.slice(0, 10)}.html`;
}

/**
 * A self-contained payment statement the recipient can keep, print to PDF, or give a lender.
 * No scripts and no external resources; every value is escaped because names come from users.
 */
export function payslipHtml(p: Payslip): string {
  const ytdTokens = TOKEN_SYMBOLS.filter((t) => p.ytd.tokens[t]).map((t) => `${money(p.ytd.tokens[t]!)} ${t}`).join(" + ");
  const row = (k: string, v: string) => `<tr><th>${esc(k)}</th><td>${v}</td></tr>`;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Payment statement · ${esc(p.name)} · ${esc(p.paidAt.slice(0, 10))}</title>
<style>
body{font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:#0F1729;background:#fff;margin:0;padding:32px 16px}
main{max-width:640px;margin:0 auto}
h1{font-size:24px;margin:0 0 4px}
.muted{color:#5B6475}
.amount{font-size:32px;font-weight:600;margin:20px 0 4px;font-variant-numeric:tabular-nums}
table{width:100%;border-collapse:collapse;margin:20px 0}
th,td{text-align:left;padding:10px 0;border-bottom:1px solid #E6E9EF;vertical-align:top}
th{width:38%;font-weight:500;color:#5B6475}
td{word-break:break-all}
.mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px}
footer{margin-top:24px;font-size:12px;color:#5B6475}
@media print{body{padding:0}}
</style></head><body><main>
<p class="muted">Payment statement</p>
<h1>${esc(p.employer)}</h1>
<p class="muted">Paid to ${esc(p.name)}${p.role ? ` · ${esc(p.role)}` : ""}</p>
<p class="amount">${esc(money(p.amount))} ${esc(p.token)}</p>
<p class="muted">≈ ${esc(money(p.usd))} USD at ${esc(p.rate.rate)} USD per ${esc(p.token)} (${esc(p.rate.source)})</p>
<table>
${row("Paid on", esc(payslipDate(p.paidAt)) + " (UTC)")}
${row("Network", esc(p.chain))}
${row("Recipient wallet", `<span class="mono">${esc(p.wallet)}</span>`)}
${row("Paid from", `<span class="mono">${esc(p.payer)}</span>`)}
${row("Transaction", p.txHash ? `<span class="mono">${esc(p.txHash)}</span>${p.explorer ? `<br><a href="${esc(p.explorer)}">View on block explorer</a>` : ""}` : "—")}
${row(`Year to date (${p.ytd.year})`, `${esc(ytdTokens)}<br><span class="muted">≈ ${esc(money(p.ytd.usd))} USD over ${p.ytd.payments} ${p.ytd.payments === 1 ? "payment" : "payments"}</span>`)}
${row("Payroll run", `<span class="mono">${esc(p.runId)}</span>`)}
</table>
<footer>
<p>Generated by Wagefold from a payment verified on-chain. The transaction above is the proof of payment: anyone can check it on a block explorer.</p>
<p>Wagefold does not withhold tax. The amount shown is what was sent. Check how this income is taxed where you live.</p>
</footer>
</main></body></html>
`;
}
