import { NextResponse } from "next/server";
import { fail, json, readJson, requireSession } from "@/lib/server/http";
import { getOrganization, logActivity, updateOrganization } from "@/lib/server/repo";
import { orgPatchInput } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const org = await getOrganization(session.orgId);
  if (!org) return fail("Organization not found.", 404);
  return json({ address: session.address, chainId: session.chainId, org });
}



export async function PATCH(req: Request) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const parsed = orgPatchInput.safeParse(await readJson(req));
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid settings.");
  const before = await getOrganization(session.orgId);
  const org = await updateOrganization(session.orgId, parsed.data);
  if (!before || !org) return fail("Organization not found.", 404);
  const changes: Record<string, [string, string]> = {};
  for (const k of ["name", "payDay", "legalName", "address", "taxId", "invoicePrefix", "invoiceNote"] as const) {
    if (before[k] !== org[k]) changes[k] = [String(before[k] ?? ""), String(org[k] ?? "")];
  }
  if (Object.keys(changes).length) await logActivity(session.orgId, session.address, "company_updated", { changes });
  return json({ org });
}
