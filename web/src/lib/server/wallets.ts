import "server-only";
import { getAddress, isAddress } from "viem";
import { MAX_PAYMENTS } from "../abi";

/** New or changed wallets the preparer ticked as checked with their owner. Only wallets in this run count. */
export function verifiedWallets(value: unknown, inRun: Set<string>): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, MAX_PAYMENTS)
    .filter((w): w is string => typeof w === "string" && isAddress(w, { strict: false }) && inRun.has(w.toLowerCase()))
    .map((w) => getAddress(w));
}
