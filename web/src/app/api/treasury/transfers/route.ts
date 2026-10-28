import { NextResponse } from "next/server";
import { json, requireMember } from "@/lib/server/http";
import { incomingTreasuryTransfers } from "@/lib/server/repo";

export const dynamic = "force-dynamic";

/** Companies asking the signed-in wallet to become their treasury. */
export async function GET() {
  const session = await requireMember();
  if (session instanceof NextResponse) return session;
  return json({ transfers: await incomingTreasuryTransfers(session.address) });
}
