import "server-only";
import { createPublicClient, http, type PublicClient } from "viem";
import { getChainConfig } from "../chains";

const DEFAULT_RPC: Record<number, string> = {
  8453: "https://mainnet.base.org",
  84532: "https://sepolia.base.org",
  31337: "http://127.0.0.1:8545",
};

function rpcUrl(chainId: number): string | undefined {
  switch (chainId) {
    case 8453:
      return process.env.RPC_URL_8453 || DEFAULT_RPC[8453];
    case 84532:
      return process.env.RPC_URL_84532 || DEFAULT_RPC[84532];
    case 31337:
      return process.env.RPC_URL_31337 || DEFAULT_RPC[31337];
  }
}

const clients = new Map<number, PublicClient>();

/** Server-side client used to verify sign-ins and payroll transactions independently of the browser. */
export function serverClient(chainId: number): PublicClient | null {
  const cfg = getChainConfig(chainId);
  const url = rpcUrl(chainId);
  if (!cfg || !url) return null;
  let client = clients.get(chainId);
  if (!client) {
    client = createPublicClient({ chain: cfg.chain, transport: http(url) }) as PublicClient;
    clients.set(chainId, client);
  }
  return client;
}
