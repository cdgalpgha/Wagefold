"use client";

import { erc20Abi } from "viem";
import { useAccount, useReadContracts } from "wagmi";
import { availableTokens, getChainConfig, type TokenSymbol } from "@/lib/chains";
import { useSession } from "./useSession";

/**
 * Live USDC/USDT balances of the company's treasury (the owner's wallet), whoever is signed in.
 * Before sign-in there's no company yet, so it falls back to the connected wallet.
 */
export function useTreasury() {
  const { address: connected, chainId } = useAccount();
  const session = useSession();
  const address = (session.data?.org.ownerAddress ?? connected) as `0x${string}` | undefined;
  const cfg = getChainConfig(chainId);
  const symbols = availableTokens(cfg);
  const query = useReadContracts({
    contracts: symbols.map((s) => ({
      address: cfg!.tokens[s]!.address,
      abi: erc20Abi,
      functionName: "balanceOf" as const,
      args: [address!] as const,
      chainId,
    })),
    query: { enabled: Boolean(address && cfg), refetchInterval: 15_000 },
  });
  const balances = Object.fromEntries(
    symbols.map((s, i) => [s, (query.data?.[i]?.result as bigint | undefined) ?? undefined]),
  ) as Partial<Record<TokenSymbol, bigint>>;
  return { address, balances, symbols, refetch: query.refetch, isLoading: query.isLoading };
}
