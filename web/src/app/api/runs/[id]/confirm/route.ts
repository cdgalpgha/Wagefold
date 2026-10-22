import { NextResponse } from "next/server";
import { parseEventLogs, type Hex } from "viem";
import { payrollAbi } from "@/lib/abi";
import { getChainConfig } from "@/lib/chains";
import { buildPayments, samePayments } from "@/lib/payments";
import { serverClient } from "@/lib/server/chain";
import { fail, json, requireSession } from "@/lib/server/http";
import { getRun, markRunResult } from "@/lib/server/repo";

export const dynamic = "force-dynamic";

/**
 * Reads the transaction from the chain and only marks the run paid if the payroll contract paid
 * exactly the snapshotted people and amounts, from this organization's treasury wallet.
 */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
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

  const settle = async (result: { status: "confirmed" } | { status: "failed"; reason: string }) =>
    json({ run: (await markRunResult(session.orgId, run.id, result)) ?? run });

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
  return settle({ status: "confirmed" });
}
