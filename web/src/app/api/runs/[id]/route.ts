import { NextResponse } from "next/server";
import { fail, json, requireSession } from "@/lib/server/http";
import { getRun } from "@/lib/server/repo";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const found = await getRun(session.orgId, params.id).catch(() => null);
  return found ? json(found) : fail("Payroll run not found.", 404);
}
