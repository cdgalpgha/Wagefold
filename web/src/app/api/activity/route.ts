import { NextResponse } from "next/server";
import { json, requireSession } from "@/lib/server/http";
import { listActivity } from "@/lib/server/repo";

export const dynamic = "force-dynamic";

/** The company's activity log, newest first. There is deliberately no way to edit or delete entries. */
export async function GET() {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  return json({ activity: await listActivity(session.orgId) });
}
