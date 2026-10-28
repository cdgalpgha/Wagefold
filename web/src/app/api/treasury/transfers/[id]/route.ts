import { NextResponse } from "next/server";
import { isHex, type Hex } from "viem";
import { serverClient } from "@/lib/server/chain";
import { fail, json, readJson, requireMember } from "@/lib/server/http";
import { acceptTreasuryTransfer, getOrganization, logActivity, treasuryTransferFor } from "@/lib/server/repo";
import { createSessionCookie, endSession } from "@/lib/server/session";

const UUID_RE = /^[0-9a-f-]{36}$/i;
type Ctx = { params: Promise<{ id: string }> };

const REFUSED = {
  gone: ["This treasury change was cancelled, has expired, or isn't for this wallet.", 404],
  stale: ["The company's treasury changed since this was proposed. Ask for a new one.", 409],
  open_run: ["A payroll is waiting or being sent. The company has to finish or cancel it first.", 409],
  owns_company: ["This wallet already runs another company in Wagefold, so it can't take on this one.", 409],
} as const;

/** The exact text to sign. Only the proposed wallet can see it. */
export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const session = await requireMember();
  if (session instanceof NextResponse) return session;
  const transfer = UUID_RE.test(id) ? await treasuryTransferFor(id, session.address) : null;
  if (!transfer) return fail(REFUSED.gone[0], 404);
  return json({ message: transfer.message });
}

/**
 * The proposed wallet accepts by signing the stored message. The signature, not the session, is
 * what proves this wallet agreed: a session can be copied, a signature for this proposal can't be
 * made without the key, and the proposal closes once used.
 */
export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const session = await requireMember();
  if (session instanceof NextResponse) return session;
  const transfer = UUID_RE.test(id) ? await treasuryTransferFor(id, session.address) : null;
  if (!transfer) return fail(REFUSED.gone[0], 404);
  const body = (await readJson(req)) as { signature?: unknown } | null;
  const signature = typeof body?.signature === "string" && isHex(body.signature) && body.signature.length <= 20_000 ? (body.signature as Hex) : null;
  if (!signature) return fail("Missing signature.");
  const client = serverClient(session.chainId);
  if (!client) return fail("Switch your wallet to a supported network, then try again.");
  // verifyMessage also handles smart-contract wallets such as Safe (ERC-1271).
  const valid = await client.verifyMessage({ address: session.address as Hex, message: transfer.message, signature }).catch(() => false);
  if (!valid) return fail("That signature isn't this wallet accepting this treasury change.", 401);
  const result = await acceptTreasuryTransfer(id, session.address, signature);
  if (result.outcome !== "ok") {
    const [message, status] = REFUSED[result.outcome];
    return fail(message, status);
  }
  await logActivity(transfer.orgId, session.address, "treasury_changed", { from: transfer.from, to: transfer.to });
  // Open the company as its new treasury.
  await endSession();
  await createSessionCookie({ address: session.address, orgId: transfer.orgId, chainId: session.chainId });
  return json({ org: await getOrganization(transfer.orgId) });
}
