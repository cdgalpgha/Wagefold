import { NextResponse } from "next/server";
import { z } from "zod";
import { fail, json, readJson, requireSession } from "@/lib/server/http";
import { getOrganization, renameOrganization } from "@/lib/server/repo";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const org = await getOrganization(session.orgId);
  if (!org) return fail("Organization not found.", 404);
  return json({ address: session.address, chainId: session.chainId, org });
}

const renameInput = z.object({ name: z.string().trim().min(1).max(80) });

export async function PATCH(req: Request) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const parsed = renameInput.safeParse(await readJson(req));
  if (!parsed.success) return fail("Company name must be 1 to 80 characters.");
  await renameOrganization(session.orgId, parsed.data.name);
  return json({ ok: true });
}
