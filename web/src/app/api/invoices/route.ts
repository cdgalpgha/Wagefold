import { NextResponse } from "next/server";
import { json, requireSession } from "@/lib/server/http";
import { ensureInvoices, listInvoices } from "@/lib/server/repo";

export const dynamic = "force-dynamic";

/** Every invoice for this company, newest first. Any paid payment still missing one is issued first. */
export async function GET() {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  await ensureInvoices(session.orgId);
  return json({ invoices: await listInvoices(session.orgId) });
}
