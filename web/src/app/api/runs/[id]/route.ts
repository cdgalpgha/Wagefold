import { NextResponse } from "next/server";
import { fail, json, requireMember } from "@/lib/server/http";
import { runDetail } from "@/lib/server/runs";

export const dynamic = "force-dynamic";
const UUID_RE = /^[0-9a-f-]{36}$/i;

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = await requireMember();
  if (session instanceof NextResponse) return session;
  const detail = UUID_RE.test(id) ? await runDetail(session.orgId, id) : null;
  return detail ? json(detail) : fail("Payroll run not found.", 404);
}
