import { NextResponse } from "next/server";
import { fail, json, readJson, requireMember } from "@/lib/server/http";
import { getRun, logActivity, rejectRun } from "@/lib/server/repo";

/** An approver sends a payroll back, with a reason the preparer will see. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = await requireMember("approve");
  if (session instanceof NextResponse) return session;
  const found = await getRun(session.orgId, id).catch(() => null);
  if (!found) return fail("Payroll run not found.", 404);
  if (found.run.createdBy?.toLowerCase() === session.address.toLowerCase()) return fail("You prepared this payroll. Cancel it instead.", 403);
  const body = (await readJson(req)) as { reason?: unknown } | null;
  const reason = typeof body?.reason === "string" ? body.reason.trim().replace(/\s+/g, " ").slice(0, 300) : "";
  if (!reason) return fail("Say why, so the preparer knows what to fix.");
  const run = await rejectRun(session.orgId, id, session.address, reason);
  if (!run) return fail("This payroll isn't waiting for approval.", 409);
  await logActivity(session.orgId, session.address, "run_rejected", { runId: id, reason });
  return json({ run });
}
