import type { Address } from "viem";
import type { Run } from "./types";

const safeAbi = [
  { type: "function", name: "getThreshold", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
] as const;

type Reader = {
  getCode(args: { address: Address }): Promise<`0x${string}` | undefined>;
  readContract(args: { address: Address; abi: typeof safeAbi; functionName: "getThreshold" }): Promise<bigint>;
};

/**
 * True when the treasury is a Safe. A Safe proposes a payment to its signers instead of sending it,
 * so the wallet hands back a proposal, not a transaction that will be mined on its own.
 */
export async function isSafeTreasury(client: Reader, address: Address, connectorId?: string): Promise<boolean> {
  if (connectorId === "safe") return true;
  try {
    const code = await client.getCode({ address });
    if (!code || code === "0x") return false;
    return (await client.readContract({ address, abi: safeAbi, functionName: "getThreshold" })) > 0n;
  } catch {
    return false; // a plain wallet, or a smart wallet that isn't a Safe
  }
}

/** Sent as a Safe proposal, and the Safe's signers haven't executed it yet. */
export const awaitingSafe = (run: Pick<Run, "status" | "txHash" | "safeTxHash">) =>
  run.status === "submitted" && !run.txHash && !!run.safeTxHash;
