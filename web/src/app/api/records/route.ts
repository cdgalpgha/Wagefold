import { NextResponse } from "next/server";
import { fail, json, requireSession } from "@/lib/server/http";
import { getOrganization, paidRuns } from "@/lib/server/repo";

export const dynamic = "force-dynamic";

/** Paid runs with every payment, for exports and payslips. `?year=2026` limits it to one calendar year (UTC). */
export async function GET(req: Request) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const raw = new URL(req.url).searchParams.get("year");
  const year = raw === null ? undefined : Number(raw);
  if (year !== undefined && !(Number.isInteger(year) && year >= 2000 && year <= 2200)) return fail("Year must be like 2026.");
  const org = await getOrganization(session.orgId);
  if (!org) return fail("Organization not found.", 404);
  return json({ org, runs: await paidRuns(session.orgId, year) });
}
