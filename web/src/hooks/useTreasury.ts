"use client";

import { erc20Abi } from "viem";
import { useAccount, useReadContracts } from "wagmi";
import { availableTokens, getChainConfig, type TokenSymbol } from "@/lib/chains";

/** Live USDC/USDT balances of the connected treasury wallet. */
export function useTreasury() {
  const { address, chainId } = useAccount();
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
  return { balances, symbols, refetch: query.refetch, isLoading: query.isLoading };
}
