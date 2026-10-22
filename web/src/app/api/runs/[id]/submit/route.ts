import { NextResponse } from "next/server";
import { getAddress, isAddress } from "viem";
import { MAX_PAYMENTS } from "@/lib/abi";
import { fail, json, readJson, requireSession } from "@/lib/server/http";
import { getRun, logActivity, markRunSubmitted } from "@/lib/server/repo";

const TX_RE = /^0x[0-9a-fA-F]{64}$/;

/** New or changed wallets the sender ticked as checked with their owner. Only wallets in this run count. */
function verifiedWallets(value: unknown, inRun: Set<string>): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, MAX_PAYMENTS)
    .filter((w): w is string => typeof w === "string" && isAddress(w, { strict: false }) && inRun.has(w.toLowerCase()))
    .map((w) => getAddress(w));
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const params = await ctx.params;
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const body = (await readJson(req)) as { txHash?: unknown; verifiedWallets?: unknown } | null;
  const txHash = typeof body?.txHash === "string" && TX_RE.test(body.txHash) ? body.txHash : null;
  if (!txHash) return fail("Missing transaction hash.");
  const run = await markRunSubmitted(session.orgId, params.id, txHash).catch(() => null);
  if (!run) return fail("This run was already submitted or doesn't exist.", 409);
  const items = (await getRun(session.orgId, run.id))?.items ?? [];
  await logActivity(session.orgId, session.address, "run_sent", {
    runId: run.id,
    txHash,
    recipients: run.recipientCount,
    totals: run.totals,
    verifiedWallets: verifiedWallets(body?.verifiedWallets, new Set(items.map((i) => i.wallet.toLowerCase()))),
  });
  return json({ run });
}
