"use client";

import { useCallback, useState } from "react";
import { encodeFunctionData, erc20Abi, type Address, type Hex, type WalletClient } from "viem";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import { payrollAbi } from "@/lib/abi";
import { api, ApiError } from "@/lib/api";
import { getChainConfig, type ChainConfig } from "@/lib/chains";
import { friendlyError } from "@/lib/errors";
import { buildPayments, requiredAllowances, type RunItem } from "@/lib/payments";
import type { RunReview } from "@/lib/changes";
import type { NewRun, Run, RunDetail } from "@/lib/types";

/** What the review screen is for: preparing a new run, approving one, sending an approved one, or just looking. */
export type ReviewMode = "prepare" | "approve" | "send" | "view";

export type Phase =
  | { kind: "idle" }
  | { kind: "preparing" }
  | { kind: "review"; run: Run; items: RunItem[]; review: RunReview; mode: ReviewMode; detail?: RunDetail }
  | { kind: "loading" }
  | { kind: "approving"; run: Run; items: RunItem[]; symbol: string; step: number; steps: number }
  | { kind: "confirm"; run: Run; items: RunItem[]; batched: boolean }
  | { kind: "sending"; run: Run; items: RunItem[]; txHash?: Hex }
  | { kind: "verifying"; run: Run; items: RunItem[]; txHash?: Hex }
  | { kind: "done"; run: Run; items: RunItem[] }
  | { kind: "failed"; run: Run; items: RunItem[] }
  | { kind: "error"; message: string; run?: Run; items?: RunItem[] };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function symbolOf(cfg: ChainConfig, token: Address): string {
  return Object.values(cfg.tokens).find((t) => t?.address === token)?.symbol ?? "token";
}

/** Drives one payroll run: pull from People, check funds, approve, pay, then verify on the server. */
export function usePayroll() {
  const { address, chainId } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });

  const reset = useCallback(() => setPhase({ kind: "idle" }), []);

  const prepare = useCallback(async () => {
    if (!chainId) return;
    setPhase({ kind: "preparing" });
    try {
      const { run, items, review } = await api<NewRun>("/api/runs", { body: { chainId } });
      setPhase({ kind: "review", run, items, review, mode: "prepare" });
    } catch (err) {
      // Someone else's payroll is already in flight: go back and show it.
      if (err instanceof ApiError && err.status === 409) return setPhase({ kind: "idle" });
      setPhase({ kind: "error", message: friendlyError(err) });
    }
  }, [chainId]);

  /** Opens an existing run (waiting for approval, approved, or sent) in the given mode. */
  const open = useCallback(async (runId: string, mode: ReviewMode) => {
    setPhase({ kind: "loading" });
    try {
      const detail = await api<RunDetail>(`/api/runs/${runId}`);
      setPhase({ kind: "review", run: detail.run, items: detail.items, review: detail.review, mode, detail });
    } catch (err) {
      setPhase({ kind: "error", message: friendlyError(err) });
    }
  }, []);

  /** The preparer sends the reviewed draft for approval (or to the treasury when none is needed). */
  const request = useCallback(async (run: Run, verifiedWallets: string[]) => {
    await api(`/api/runs/${run.id}/request`, { body: { verifiedWallets } });
    setPhase({ kind: "idle" });
  }, []);

  /** An approver signs the server's approval message for this exact run with their own wallet. */
  const approve = useCallback(
    async (run: Run) => {
      if (!walletClient || !address) throw new Error("Reconnect your wallet and try again.");
      const { message } = await api<{ message: string }>(`/api/runs/${run.id}/approve`);
      const signature = await walletClient.signMessage({ account: address, message });
      await api(`/api/runs/${run.id}/approve`, { body: { signature } });
      setPhase({ kind: "idle" });
    },
    [address, walletClient],
  );

  const reject = useCallback(async (run: Run, reason: string) => {
    await api(`/api/runs/${run.id}/reject`, { body: { reason } });
    setPhase({ kind: "idle" });
  }, []);

  const cancel = useCallback(async (run: Run) => {
    await api(`/api/runs/${run.id}/cancel`, { body: {} });
    setPhase({ kind: "idle" });
  }, []);

  /** Re-checks a run that was sent but not yet verified (for example after closing the tab mid-way). */
  const recheck = useCallback(async (run: Run, items: RunItem[]) => {
    setPhase({ kind: "verifying", run, items, txHash: run.txHash! });
    try {
      const res = await api<{ run: Run; pending?: boolean }>(`/api/runs/${run.id}/confirm`, { body: {} });
      if (res.run.status === "confirmed") return setPhase({ kind: "done", run: res.run, items });
      if (res.run.status === "failed") return setPhase({ kind: "failed", run: res.run, items });
      setPhase({ kind: "error", message: "The transaction isn't confirmed yet. Try again in a minute." });
    } catch (err) {
      setPhase({ kind: "error", message: friendlyError(err) });
    }
  }, []);

  const send = useCallback(
    async (run: Run, items: RunItem[], verifiedWallets: string[] = []) => {
      const cfg = getChainConfig(run.chainId);
      if (!cfg || !address || !publicClient || !walletClient) {
        setPhase({ kind: "error", message: "Reconnect your wallet and try again.", run, items });
        return;
      }
      if (chainId !== run.chainId) {
        setPhase({ kind: "error", message: `Switch your wallet to ${cfg.chain.name} first.`, run, items });
        return;
      }
      const payments = buildPayments(items, cfg);
      const need = requiredAllowances(payments);
      try {
        // Already paid by this treasury (the first attempt landed after all): verify instead of paying again.
        const paidIn = await publicClient
          .readContract({ address: cfg.payroll, abi: payrollAbi, functionName: "paidBlock", args: [address, run.onchainRef] })
          .catch(() => 0n);
        if (paidIn > 0n) {
          setPhase({ kind: "verifying", run, items, txHash: run.txHash ?? undefined });
          const res = await api<{ run: Run; pending?: boolean }>(`/api/runs/${run.id}/confirm`, { body: {} });
          if (res.run.status === "confirmed") return setPhase({ kind: "done", run: res.run, items });
          if (res.run.status === "failed") return setPhase({ kind: "failed", run: res.run, items });
          return setPhase({ kind: "error", message: "This payroll was already paid. We're still confirming it; check History in a minute.", run, items });
        }
        // 1. Make sure the treasury can cover every token, and work out which approvals are missing.
        const approvals: { token: Address; amount: bigint; current: bigint }[] = [];
        for (const [token, amount] of need) {
          const [balance, allowance] = await Promise.all([
            publicClient.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [address] }),
            publicClient.readContract({ address: token, abi: erc20Abi, functionName: "allowance", args: [address, cfg.payroll] }),
          ]);
          if (balance < amount) throw new Error(`The treasury doesn't hold enough ${symbolOf(cfg, token)} for this run.`);
          if (allowance < amount) approvals.push({ token, amount, current: allowance });
        }

        const payData = encodeFunctionData({ abi: payrollAbi, functionName: "pay", args: [run.onchainRef, payments] });
        let txHash: Hex | undefined;

        // 2a. Wallets that support atomic batches (EIP-5792) approve and pay with one confirmation.
        if (approvals.length && (await supportsAtomicBatch(walletClient, address, run.chainId))) {
          setPhase({ kind: "confirm", run, items, batched: true });
          const calls = [
            ...approvals.map((a) => ({
              to: a.token,
              data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [cfg.payroll, a.amount] }),
            })),
            { to: cfg.payroll, data: payData },
          ];
          const { id } = await walletClient.sendCalls({ account: address, chain: cfg.chain, calls, forceAtomic: true });
          setPhase({ kind: "sending", run, items });
          const status = await walletClient.waitForCallsStatus({ id, timeout: 120_000 });
          txHash = status.receipts?.at(-1)?.transactionHash;
          if (status.status !== "success" || !txHash) throw new Error("The wallet didn't complete the payment.");
        } else {
          // 2b. Otherwise approve each token for exactly what this run needs, then pay.
          for (const [i, a] of approvals.entries()) {
            setPhase({ kind: "approving", run, items, symbol: symbolOf(cfg, a.token), step: i + 1, steps: approvals.length });
            if (a.current > 0n) {
              // Some tokens (USDT) refuse to change a non-zero allowance directly.
              const reset = await walletClient.writeContract({
                address: a.token, abi: erc20Abi, functionName: "approve", args: [cfg.payroll, 0n], account: address, chain: cfg.chain,
              });
              await publicClient.waitForTransactionReceipt({ hash: reset });
            }
            const hash = await walletClient.writeContract({
              address: a.token, abi: erc20Abi, functionName: "approve", args: [cfg.payroll, a.amount], account: address, chain: cfg.chain,
            });
            await publicClient.waitForTransactionReceipt({ hash });
          }
          setPhase({ kind: "confirm", run, items, batched: false });
          const { request } = await publicClient.simulateContract({
            address: cfg.payroll, abi: payrollAbi, functionName: "pay", args: [run.onchainRef, payments], account: address,
          });
          txHash = await walletClient.writeContract(request);
        }

        // 3. Record the hash, wait for the block, then let the server check the chain itself.
        await api(`/api/runs/${run.id}/submit`, { body: { txHash, verifiedWallets } });
        setPhase({ kind: "sending", run, items, txHash });
        await publicClient.waitForTransactionReceipt({ hash: txHash });
        setPhase({ kind: "verifying", run, items, txHash });
        for (let attempt = 0; attempt < 20; attempt++) {
          const res = await api<{ run: Run; pending?: boolean }>(`/api/runs/${run.id}/confirm`, { body: {} });
          if (res.run.status === "confirmed") return setPhase({ kind: "done", run: res.run, items });
          if (res.run.status === "failed") return setPhase({ kind: "failed", run: res.run, items });
          await sleep(1500);
        }
        setPhase({ kind: "error", message: "Sent, but we couldn't confirm it yet. Check History in a minute.", run, items });
      } catch (err) {
        setPhase({ kind: "error", message: friendlyError(err), run, items });
      }
    },
    [address, chainId, publicClient, walletClient],
  );

  return { phase, prepare, open, request, approve, reject, cancel, recheck, send, reset };
}

async function supportsAtomicBatch(
  walletClient: WalletClient,
  account: Address,
  chainId: number,
): Promise<boolean> {
  try {
    const caps = (await walletClient.getCapabilities({ account, chainId })) as Record<string, unknown> & {
      atomic?: { status?: string };
      atomicBatch?: { supported?: boolean };
    };
    const status = caps?.atomic?.status;
    return status === "supported" || status === "ready" || caps?.atomicBatch?.supported === true;
  } catch {
    return false; // wallet doesn't implement EIP-5792
  }
}
