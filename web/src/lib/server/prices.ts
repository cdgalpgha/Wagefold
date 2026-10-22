import "server-only";
import { formatUnits, getAddress, isAddress, type Address, type PublicClient } from "viem";
import type { TokenSymbol } from "../chains";
import { PAR, type Rate } from "../records";

const aggregatorAbi = [
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  {
    type: "function",
    name: "latestRoundData",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "roundId", type: "uint80" },
      { name: "answer", type: "int256" },
      { name: "startedAt", type: "uint256" },
      { name: "updatedAt", type: "uint256" },
      { name: "answeredInRound", type: "uint80" },
    ],
  },
] as const;

/**
 * A Chainlink-style USD price feed for a token, set per chain, e.g. PRICE_FEED_USDC_8453.
 * Not built in: verify the feed address on data.chain.link before setting it.
 */
function feedFor(token: TokenSymbol, chainId: number): Address | null {
  const raw = process.env[`PRICE_FEED_${token}_${chainId}`]?.trim();
  return raw && isAddress(raw) ? getAddress(raw) : null;
}

/** The USD rate of each token at the payment's block, or par (clearly labelled) when no feed is set or it fails. */
export async function ratesAt(
  client: PublicClient,
  chainId: number,
  tokens: TokenSymbol[],
  blockNumber: bigint,
): Promise<Partial<Record<TokenSymbol, Rate>>> {
  const out: Partial<Record<TokenSymbol, Rate>> = {};
  for (const token of tokens) {
    const feed = feedFor(token, chainId);
    out[token] = PAR;
    if (!feed) continue;
    try {
      const [decimals, round] = await Promise.all([
        client.readContract({ address: feed, abi: aggregatorAbi, functionName: "decimals", blockNumber }),
        client.readContract({ address: feed, abi: aggregatorAbi, functionName: "latestRoundData", blockNumber }),
      ]);
      const answer = round[1];
      if (answer > 0n) out[token] = { rate: formatUnits(answer, decimals), source: `Chainlink ${token}/USD feed ${feed} at block ${blockNumber}` };
    } catch (err) {
      console.error(`price feed read failed for ${token} on ${chainId}`, err);
    }
  }
  return out;
}
