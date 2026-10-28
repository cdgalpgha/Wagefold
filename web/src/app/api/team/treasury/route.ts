import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { getAddress, isAddress, zeroAddress } from "viem";
import { fail, json, readJson, requireMember } from "@/lib/server/http";
import {
  cancelTreasuryTransfer,
  getOrganization,
  logActivity,
  openRun,
  openTreasuryTransfer,
  ownsAnotherCompany,
  proposeTreasuryTransfer,
} from "@/lib/server/repo";
import { TRANSFER_TTL_HOURS, treasuryTransferMessage } from "@/lib/treasury";

export const dynamic = "force-dynamic";

/** The open proposal to move this company to a new treasury wallet, if any. Everyone on the team sees it. */
export async function GET() {
  const session = await requireMember();
  if (session instanceof NextResponse) return session;
  return json({ transfer: await openTreasuryTransfer(session.orgId) });
}

/**
 * The treasury proposes a new treasury wallet. Nothing changes until that wallet signs in and accepts
 * with its own signature. Not while a payroll is in flight: it was approved for the current treasury.
 */
export async function POST(req: Request) {
  const session = await requireMember("team");
  if (session instanceof NextResponse) return session;
  const org = await getOrganization(session.orgId);
  if (!org || org.ownerAddress.toLowerCase() !== session.address.toLowerCase()) return fail("Only the treasury wallet can move the treasury.", 403);
  const body = (await readJson(req)) as { address?: unknown } | null;
  const raw = typeof body?.address === "string" ? body.address.trim() : "";
  if (!isAddress(raw, { strict: false }) || raw.toLowerCase() === zeroAddress) return fail("Enter the new treasury's wallet address (0x…).");
  const to = getAddress(raw);
  if (to.toLowerCase() === org.ownerAddress.toLowerCase()) return fail("That's already the treasury wallet.");
  if (await openRun(session.orgId)) return fail("A payroll is waiting or being sent. Finish or cancel it before moving the treasury.", 409);
  if (await ownsAnotherCompany(to, session.orgId)) return fail("That wallet already runs another company in Wagefold. Use a wallet that doesn't.", 409);
  const id = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + TRANSFER_TTL_HOURS * 3600_000);
  const message = treasuryTransferMessage({ id, orgId: org.id, company: org.name, from: org.ownerAddress, to, expiresAt });
  await proposeTreasuryTransfer({ id, orgId: org.id, from: org.ownerAddress, to, message, expiresAt });
  await logActivity(session.orgId, session.address, "treasury_proposed", { to, expiresAt: expiresAt.toISOString() });
  return json({ transfer: await openTreasuryTransfer(session.orgId) }, 201);
}

/** The treasury withdraws its open proposal. */
export async function DELETE() {
  const session = await requireMember("team");
  if (session instanceof NextResponse) return session;
  const cancelled = await cancelTreasuryTransfer(session.orgId);
  if (!cancelled) return fail("There's no treasury change to cancel.", 404);
  await logActivity(session.orgId, session.address, "treasury_cancelled", { to: cancelled.to });
  return json({ ok: true });
}
