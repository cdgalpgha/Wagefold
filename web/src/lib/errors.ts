/** Turns wallet and RPC errors into one plain sentence for the UI. */
export function friendlyError(err: unknown): string {
  const e = err as { name?: string; shortMessage?: string; message?: string; code?: number };
  const text = `${e?.name ?? ""} ${e?.shortMessage ?? ""} ${e?.message ?? ""}`;
  if (e?.code === 4001 || /UserRejected|User rejected|denied|rejected the request/i.test(text)) {
    return "You cancelled in your wallet. Nothing was sent.";
  }
  if (/insufficient funds/i.test(text)) return "Your wallet doesn't have enough ETH on this network to pay the network fee.";
  if (/ERC20InsufficientBalance|exceeds balance/i.test(text)) return "The treasury doesn't hold enough of a token for this run.";
  return e?.shortMessage ?? e?.message ?? "Something went wrong. Please try again.";
}
