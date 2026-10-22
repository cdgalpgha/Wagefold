import { NextResponse } from "next/server";
import { z } from "zod";
import { isPayDay } from "@/lib/schedule";
import { fail, json, readJson, requireSession } from "@/lib/server/http";
import { getOrganization, logActivity, updateOrganization } from "@/lib/server/repo";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const org = await getOrganization(session.orgId);
  if (!org) return fail("Organization not found.", 404);
  return json({ address: session.address, chainId: session.chainId, org });
}

const patchInput = z
  .object({
    name: z.string().trim().min(1, "Company name can't be empty.").max(80, "Company name must be 80 characters or fewer.").optional(),
    payDay: z.union([z.null(), z.number().refine(isPayDay, "Payday must be a day from 1 to 28, or the last day of the month.")]).optional(),
  })
  .strict();

export async function PATCH(req: Request) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const parsed = patchInput.safeParse(await readJson(req));
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid settings.");
  const before = await getOrganization(session.orgId);
  const org = await updateOrganization(session.orgId, parsed.data);
  if (!before || !org) return fail("Organization not found.", 404);
  const changes: Record<string, [string, string]> = {};
  if (before.name !== org.name) changes.name = [before.name, org.name];
  if (before.payDay !== org.payDay) changes.payDay = [String(before.payDay ?? ""), String(org.payDay ?? "")];
  if (Object.keys(changes).length) await logActivity(session.orgId, session.address, "company_updated", { changes });
  return json({ org });
}
