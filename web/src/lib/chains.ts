import { getAddress, type Address, type Chain } from "viem";
import { base, baseSepolia, hardhat } from "viem/chains";

export const TOKEN_SYMBOLS = ["USDC", "USDT"] as const;
export type TokenSymbol = (typeof TOKEN_SYMBOLS)[number];
export const TOKEN_DECIMALS = 6;

export type TokenConfig = { symbol: TokenSymbol; address: Address; decimals: number };

export type ChainConfig = {
  chain: Chain;
  payroll: Address;
  tokens: Partial<Record<TokenSymbol, TokenConfig>>;
  explorer?: string;
};

// NEXT_PUBLIC_* values must be referenced literally so Next.js can inline them in the browser bundle.
const env = {
  payroll: {
    8453: process.env.NEXT_PUBLIC_PAYROLL_ADDRESS_8453,
    84532: process.env.NEXT_PUBLIC_PAYROLL_ADDRESS_84532,
    31337: process.env.NEXT_PUBLIC_PAYROLL_ADDRESS_31337,
  },
  usdc: {
    8453: process.env.NEXT_PUBLIC_USDC_ADDRESS_8453 || "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    84532: process.env.NEXT_PUBLIC_USDC_ADDRESS_84532 || "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    31337: process.env.NEXT_PUBLIC_USDC_ADDRESS_31337,
  },
  usdt: {
    8453: process.env.NEXT_PUBLIC_USDT_ADDRESS_8453,
    84532: process.env.NEXT_PUBLIC_USDT_ADDRESS_84532,
    31337: process.env.NEXT_PUBLIC_USDT_ADDRESS_31337,
  },
} as const;

type SupportedId = 8453 | 84532 | 31337;
const CHAINS: Record<SupportedId, { chain: Chain; explorer?: string }> = {
  8453: { chain: base, explorer: "https://basescan.org" },
  84532: { chain: baseSepolia, explorer: "https://sepolia.basescan.org" },
  // The artifact demo runs a simulated chain under the local chain id; give it a clear name.
  31337: { chain: process.env.NEXT_PUBLIC_DEMO ? { ...hardhat, name: "Demo network" } : hardhat },
};

function token(symbol: TokenSymbol, address: string | undefined): TokenConfig | undefined {
  return address ? { symbol, address: getAddress(address), decimals: TOKEN_DECIMALS } : undefined;
}

function build(): ChainConfig[] {
  const out: ChainConfig[] = [];
  for (const id of [8453, 84532, 31337] as SupportedId[]) {
    const payroll = env.payroll[id];
    if (!payroll) continue; // a chain is only offered once the contract is deployed there
    const tokens: ChainConfig["tokens"] = {};
    const usdc = token("USDC", env.usdc[id]);
    const usdt = token("USDT", env.usdt[id]);
    if (usdc) tokens.USDC = usdc;
    if (usdt) tokens.USDT = usdt;
    out.push({ chain: CHAINS[id].chain, explorer: CHAINS[id].explorer, payroll: getAddress(payroll), tokens });
  }
  return out;
}

export const SUPPORTED: ChainConfig[] = build();

export function getChainConfig(chainId: number | undefined): ChainConfig | undefined {
  return SUPPORTED.find((c) => c.chain.id === chainId);
}

export function explorerTx(chainId: number, hash: string): string | undefined {
  const cfg = getChainConfig(chainId);
  return cfg?.explorer ? `${cfg.explorer}/tx/${hash}` : undefined;
}

export function availableTokens(cfg: ChainConfig | undefined): TokenSymbol[] {
  return cfg ? TOKEN_SYMBOLS.filter((s) => cfg.tokens[s]) : [];
}
