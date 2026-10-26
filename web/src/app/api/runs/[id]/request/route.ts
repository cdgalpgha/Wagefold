import { NextResponse } from "next/server";
import { fail, json, readJson, requireMember } from "@/lib/server/http";
import { getRun, logActivity, openRun, OpenRunError, requestApproval } from "@/lib/server/repo";
import { verifiedWallets } from "@/lib/server/wallets";

/** The preparer sends their reviewed draft for approval (or to the treasury, if no approvals are required). */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = await requireMember("prepare");
  if (session instanceof NextResponse) return session;
  const found = await getRun(session.orgId, id).catch(() => null);
  if (!found) return fail("Payroll run not found.", 404);
  const body = (await readJson(req)) as { verifiedWallets?: unknown } | null;
  const verified = verifiedWallets(body?.verifiedWallets, new Set(found.items.map((i) => i.wallet.toLowerCase())));
  const run = await requestApproval(session.orgId, id, session.address, verified).catch((err) => {
    if (err instanceof OpenRunError) return null;
    throw err;
  });
  if (!run) {
    const open = await openRun(session.orgId);
    if (open && open.id !== id) return fail(new OpenRunError().message, 409);
    return fail("Only the person who prepared this draft can send it for approval, and only once.", 409);
  }
  await logActivity(session.orgId, session.address, "run_requested", {
    runId: run.id,
    recipients: run.recipientCount,
    totals: run.totals,
    verifiedWallets: verified,
    status: run.status,
  });
  return json({ run });
}
