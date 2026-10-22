/**
 * Address poisoning: attackers create wallets whose first and last characters match a real
 * payee's, then wait for someone to copy the wrong one from wallet history. Most people only
 * check the ends of an address, so a different address with the same ends is the red flag.
 */

const PREFIX = 3;
const SUFFIX = 3;
const COMBINED = 7; // a chance match on 7 hex characters is about 1 in 268 million per pair

function body(address: string) {
  return address.toLowerCase().replace(/^0x/, "");
}

function sharedPrefix(a: string, b: string) {
  let n = 0;
  while (n < a.length && a[n] === b[n]) n++;
  return n;
}

function sharedSuffix(a: string, b: string) {
  let n = 0;
  while (n < a.length && a[a.length - 1 - n] === b[b.length - 1 - n]) n++;
  return n;
}

/** True when two different addresses share enough leading and trailing characters to be mistaken for each other. */
export function looksAlike(a: string, b: string): boolean {
  const x = body(a);
  const y = body(b);
  if (x === y || x.length !== 40 || y.length !== 40) return false;
  const p = sharedPrefix(x, y);
  const s = sharedSuffix(x, y);
  return p >= PREFIX && s >= SUFFIX && p + s >= COMBINED;
}

export type Known = { wallet: string; name: string };
export type Lookalike = { wallet: string; name: string; resembles: string; resemblesName: string };

/** Each wallet in `wallets` that looks like, but isn't, a wallet in `known`. */
export function findLookalikes(wallets: Known[], known: Known[]): Lookalike[] {
  const out: Lookalike[] = [];
  for (const w of wallets) {
    const match = known.find((k) => looksAlike(w.wallet, k.wallet));
    if (match) out.push({ wallet: w.wallet, name: w.name, resembles: match.wallet, resemblesName: match.name });
  }
  return out;
}

/** "0x3C44 CdDd B6a9 …" so a person can compare an address in chunks instead of only its ends. */
export function chunkAddress(address: string): string[] {
  const hex = address.replace(/^0x/, "");
  const chunks = ["0x" + hex.slice(0, 4)];
  for (let i = 4; i < hex.length; i += 4) chunks.push(hex.slice(i, i + 4));
  return chunks;
}
