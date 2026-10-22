import { formatEther, formatUnits, parseUnits } from "viem";
import { TOKEN_DECIMALS, TOKEN_SYMBOLS, type TokenSymbol } from "./chains";

const AMOUNT_RE = /^\d+(\.\d{1,6})?$/;

/**
 * Turns user input such as "9,400" or " 12500.50 " into a canonical decimal string ("9400", "12500.5").
 * Returns null for anything that is not a positive amount with at most 6 decimal places.
 */
export function normalizeAmount(input: string | number): string | null {
  const raw = String(input).trim().replace(/,/g, "");
  if (!AMOUNT_RE.test(raw)) return null;
  const units = parseUnits(raw, TOKEN_DECIMALS);
  if (units <= 0n) return null;
  return formatUnits(units, TOKEN_DECIMALS);
}

/** Database numerics arrive as strings like "9400.000000"; this trims them to "9400". */
export function canonical(value: string | number): string {
  return formatUnits(parseUnits(String(value), TOKEN_DECIMALS), TOKEN_DECIMALS);
}

export function toUnits(amount: string): bigint {
  return parseUnits(amount, TOKEN_DECIMALS);
}

/** "9400" -> "9,400.00", "0.5" -> "0.50", "1.123456" -> "1.123456" */
export function formatAmount(value: string | bigint): string {
  const str = typeof value === "bigint" ? formatUnits(value, TOKEN_DECIMALS) : canonical(value);
  const [whole, frac = ""] = str.split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${grouped}.${frac.padEnd(2, "0")}`;
}

export type Totals = Record<TokenSymbol, bigint>;

export function sumByToken(items: { amount: string; token: TokenSymbol }[]): Totals {
  const totals = Object.fromEntries(TOKEN_SYMBOLS.map((s) => [s, 0n])) as Totals;
  for (const item of items) totals[item.token] += toUnits(item.amount);
  return totals;
}

/** "58,700.00 USDC + 17,700.00 USDT" */
export function totalsLabel(totals: Totals | Record<string, string>): string {
  const parts = TOKEN_SYMBOLS.flatMap((s) => {
    const v = totals[s as keyof typeof totals];
    if (v === undefined) return [];
    const units = typeof v === "bigint" ? v : toUnits(v);
    return units > 0n ? [`${formatAmount(units)} ${s}`] : [];
  });
  return parts.length ? parts.join(" + ") : "Nothing to pay";
}

/** Network fees, two significant figures: 31000000000000n or "0.000031" -> "0.000031". */
export function formatEth(value: bigint | string): string {
  const eth = Number(typeof value === "bigint" ? formatEther(value) : value);
  if (!(eth > 0)) return "0";
  if (eth < 0.000001) return "<0.000001";
  const p = eth.toPrecision(2);
  return p.includes(".") && !p.includes("e") ? p.replace(/0+$/, "").replace(/\.$/, "") : p;
}
