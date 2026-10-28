import { NextResponse } from "next/server";
import { fail, json, readJson, requireMember } from "@/lib/server/http";
import { getOrganization, getRun, logActivity, markRunSubmitted, openRun, OpenRunError } from "@/lib/server/repo";
import { verifiedWallets } from "@/lib/server/wallets";

const TX_RE = /^0x[0-9a-fA-F]{64}$/;

/**
 * The treasury records the payroll transaction it just sent. Only the owner (the treasury wallet)
 * can, and only for a run with enough approvals under the company's current rule.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = await requireMember("send");
  if (session instanceof NextResponse) return session;
  const org = await getOrganization(session.orgId);
  if (!org || org.ownerAddress.toLowerCase() !== session.address.toLowerCase()) return fail("Only the treasury wallet can send payroll.", 403);
  const body = (await readJson(req)) as { txHash?: unknown; verifiedWallets?: unknown } | null;
  const txHash = typeof body?.txHash === "string" && TX_RE.test(body.txHash) ? body.txHash : null;
  if (!txHash) return fail("Missing transaction hash.");
  const found = await getRun(session.orgId, id).catch(() => null);
  if (!found) return fail("Payroll run not found.", 404);
  const verified = verifiedWallets(body?.verifiedWallets, new Set(found.items.map((i) => i.wallet.toLowerCase())));
  const run = await markRunSubmitted(session.orgId, id, txHash, session.address, found.run.status === "draft" ? verified : null).catch((err) => {
    if (err instanceof OpenRunError) return null;
    throw err;
  });
  if (!run) {
    const open = await openRun(session.orgId);
    if (open && open.id !== id) return fail(new OpenRunError().message, 409);
    if (org.twoPerson && found.run.createdBy?.toLowerCase() === session.address.toLowerCase()) {
      return fail("Two-person payroll is on, so the treasury can't send a payroll it prepared. Your accounts team prepares it.", 403);
    }
    if (org.twoPerson && found.run.status === "draft") return fail("Your accounts team has to sign and submit this payroll first.", 409);
    const needs = org.approvalsRequired;
    return fail(
      needs > 0 && found.run.approvalCount < needs
        ? `This payroll needs ${needs} sign-off${needs === 1 ? "" : "s"} before it can be sent (it has ${found.run.approvalCount}).`
        : "This run was already sent, cancelled, or doesn't exist.",
      409,
    );
  }
  await logActivity(session.orgId, session.address, "run_sent", {
    runId: run.id,
    txHash,
    recipients: run.recipientCount,
    totals: run.totals,
    approvals: run.approvalCount,
    verifiedWallets: found.run.status === "draft" ? verified : undefined,
  });
  return json({ run });
}
