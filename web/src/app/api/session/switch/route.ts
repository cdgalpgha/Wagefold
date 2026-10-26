import { NextResponse } from "next/server";
import { fail, json, readJson, requireMember } from "@/lib/server/http";
import { roleOf } from "@/lib/server/repo";
import { createSessionCookie, endSession } from "@/lib/server/session";

const UUID_RE = /^[0-9a-f-]{36}$/i;

/** Moves the signed-in wallet to another company it belongs to. Membership is checked, not assumed. */
export async function POST(req: Request) {
  const session = await requireMember();
  if (session instanceof NextResponse) return session;
  const body = (await readJson(req)) as { orgId?: unknown } | null;
  const orgId = typeof body?.orgId === "string" && UUID_RE.test(body.orgId) ? body.orgId : null;
  if (!orgId || !(await roleOf(orgId, session.address))) return fail("You're not on that company's team.", 403);
  await endSession();
  await createSessionCookie({ address: session.address, orgId, chainId: session.chainId });
  return json({ ok: true });
}
