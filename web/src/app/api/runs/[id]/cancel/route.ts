import { NextResponse } from "next/server";
import { fail, json, requireMember } from "@/lib/server/http";
import { cancelRun, getRun, logActivity } from "@/lib/server/repo";

/** The preparer or the owner withdraws a payroll that hasn't been sent. */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = await requireMember("prepare");
  if (session instanceof NextResponse) return session;
  const found = await getRun(session.orgId, id).catch(() => null);
  if (!found) return fail("Payroll run not found.", 404);
  const mine = found.run.createdBy?.toLowerCase() === session.address.toLowerCase();
  if (!mine && session.role !== "owner") return fail("Only the person who prepared it, or the owner, can cancel it.", 403);
  const run = await cancelRun(session.orgId, id);
  if (!run) return fail("This payroll can't be cancelled any more.", 409);
  await logActivity(session.orgId, session.address, "run_cancelled", { runId: id });
  return json({ run });
}
