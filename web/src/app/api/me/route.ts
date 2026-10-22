import { NextResponse } from "next/server";
import { fail, json, readJson } from "@/lib/server/http";
import { requireMember } from "@/lib/server/http";
import { getOrganization, logActivity, membershipsFor, updateOrganization } from "@/lib/server/repo";
import { firstError, orgPatchInput } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await requireMember();
  if (session instanceof NextResponse) return session;
  const org = await getOrganization(session.orgId);
  if (!org) return fail("Organization not found.", 404);
  const memberships = (await membershipsFor(session.address)).map(({ orgId, name, role }) => ({ orgId, name, role }));
  return json({ address: session.address, chainId: session.chainId, org, role: session.role, memberships });
}



export async function PATCH(req: Request) {
  const session = await requireMember("settings");
  if (session instanceof NextResponse) return session;
  const parsed = orgPatchInput.safeParse(await readJson(req));
  if (!parsed.success) return fail(firstError(parsed.error));
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
