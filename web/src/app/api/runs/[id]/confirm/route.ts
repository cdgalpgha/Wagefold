import { NextResponse } from "next/server";
import { parseEventLogs, type Hex } from "viem";
import { payrollAbi } from "@/lib/abi";
import { getChainConfig, TOKEN_SYMBOLS } from "@/lib/chains";
import { buildPayments, samePayments } from "@/lib/payments";
import { serverClient } from "@/lib/server/chain";
import { fail, json, requireSession } from "@/lib/server/http";
import { ratesAt } from "@/lib/server/prices";
import { ensureInvoices, getRun, logActivity, markRunResult, type RunRecord } from "@/lib/server/repo";

export const dynamic = "force-dynamic";

/**
 * Reads the transaction from the chain and only marks the run paid if the payroll contract paid
 * exactly the snapshotted people and amounts, from this organization's treasury wallet.
 */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const params = await ctx.params;
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const found = await getRun(session.orgId, params.id).catch(() => null);
  if (!found) return fail("Payroll run not found.", 404);
  const { run, items } = found;
  if (run.status === "confirmed" || run.status === "failed") return json({ run });
  if (run.status !== "submitted" || !run.txHash) return fail("This run hasn't been sent yet.", 409);

  const cfg = getChainConfig(run.chainId);
  const client = serverClient(run.chainId);
  if (!cfg || !client) return fail("This network is no longer configured.", 500);

  const receipt = await client.getTransactionReceipt({ hash: run.txHash as Hex }).catch(() => null);
  if (!receipt) return json({ run, pending: true }, 202);

  const settle = async (result: { status: "confirmed"; record: RunRecord } | { status: "failed"; reason: string }) => {
    const updated = await markRunResult(session.orgId, run.id, result);
    if (updated) {
      await logActivity(session.orgId, session.address, updated.status === "confirmed" ? "run_paid" : "run_failed", {
        runId: run.id,
        txHash: run.txHash,
        ...(result.status === "failed" ? { reason: result.reason } : {}),
      });
      // Invoices are issued the moment a run is verified. If this fails, the Invoices page issues them later.
      if (updated.status === "confirmed") await ensureInvoices(session.orgId).catch((err) => console.error("invoice issue failed", err));
    }
    return json({ run: updated ?? run });
  };

  if (receipt.status !== "success") return settle({ status: "failed", reason: "The transaction reverted. No one was paid." });

  const logs = parseEventLogs({
    abi: payrollAbi,
    logs: receipt.logs.filter((l) => l.address.toLowerCase() === cfg.payroll.toLowerCase()),
  });
  const ref = run.onchainRef.toLowerCase();
  const paid = logs.find((l) => l.eventName === "PayrollPaid" && l.args.runId.toLowerCase() === ref);
  if (!paid || paid.eventName !== "PayrollPaid") {
    return settle({ status: "failed", reason: "That transaction didn't pay this run." });
  }
  if (paid.args.payer.toLowerCase() !== session.address.toLowerCase()) {
    return settle({ status: "failed", reason: "The run was paid from a different wallet." });
  }
  const actual = logs.flatMap((l) =>
    l.eventName === "PaymentSent" && l.args.runId.toLowerCase() === ref
      ? [{ token: l.args.token, to: l.args.to, amount: l.args.amount }]
      : [],
  );
  if (!samePayments(buildPayments(items, cfg), actual)) {
    return settle({ status: "failed", reason: "The on-chain payments don't match this run." });
  }
  // Keep what an accountant needs: when it settled, the block, the network fee and the USD rate used.
  const block = await client.getBlock({ blockNumber: receipt.blockNumber });
  const l1Fee = (receipt as { l1Fee?: bigint | null }).l1Fee ?? 0n; // Base charges an L1 data fee on top of L2 gas
  const tokens = TOKEN_SYMBOLS.filter((t) => items.some((i) => i.token === t));
  return settle({
    status: "confirmed",
    record: {
      paidAt: new Date(Number(block.timestamp) * 1000),
      blockNumber: receipt.blockNumber,
      networkFeeWei: receipt.gasUsed * receipt.effectiveGasPrice + l1Fee,
      usdRates: await ratesAt(client, run.chainId, tokens, receipt.blockNumber),
    },
  });
}
