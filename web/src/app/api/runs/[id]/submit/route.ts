import { NextResponse } from "next/server";
import { fail, json, readJson, requireSession } from "@/lib/server/http";
import { markRunSubmitted } from "@/lib/server/repo";

const TX_RE = /^0x[0-9a-fA-F]{64}$/;

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const body = (await readJson(req)) as { txHash?: unknown } | null;
  const txHash = typeof body?.txHash === "string" && TX_RE.test(body.txHash) ? body.txHash : null;
  if (!txHash) return fail("Missing transaction hash.");
  const run = await markRunSubmitted(session.orgId, params.id, txHash).catch(() => null);
  return run ? json({ run }) : fail("This run was already submitted or doesn't exist.", 409);
}
