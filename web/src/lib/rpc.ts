import { fallback, http, type Transport } from "viem";

// NEXT_PUBLIC_* values must be referenced literally so Next.js can inline them in the browser bundle.
const BROWSER_RPC: Record<number, string | undefined> = {
  8453: process.env.NEXT_PUBLIC_RPC_URL_8453,
  84532: process.env.NEXT_PUBLIC_RPC_URL_84532,
};

/**
 * How the browser reads the chain: your RPC provider first when one is set (the public endpoints are
 * rate-limited), then the chain's public endpoint if the provider fails. These URLs are visible to
 * every visitor, so use a provider key restricted to your domain, separate from the server's RPC_URL_*.
 */
export function transportFor(chainId: number): Transport {
  const url = BROWSER_RPC[chainId]?.trim();
  return url ? fallback([http(url), http()]) : http();
}
