import { NextResponse } from "next/server";
import { isHex, type Hex } from "viem";
import { serverClient } from "@/lib/server/chain";
import { fail, json, readJson, requireMember } from "@/lib/server/http";
import { getOrganization, getRun, logActivity, openRun, OpenRunError, requestApproval } from "@/lib/server/repo";
import { expectedPreparedMessage } from "@/lib/server/runs";
import { verifiedWallets } from "@/lib/server/wallets";

type Ctx = { params: Promise<{ id: string }> };
const same = (a?: string | null, b?: string | null) => !!a && !!b && a.toLowerCase() === b.toLowerCase();

/** Who may submit this draft, and whether they must sign it. */
async function check(orgId: string, id: string, address: string) {
  const [found, org] = await Promise.all([getRun(orgId, id).catch(() => null), getOrganization(orgId)]);
  if (!found || !org) return { error: fail("Payroll run not found.", 404) };
  if (!same(found.run.createdBy, address)) return { error: fail("Only the person who prepared this draft can submit it.", 403) };
  const isTreasury = same(org.ownerAddress, address);
  if (isTreasury && org.twoPerson) {
    return { error: fail("Two-person payroll is on: your accounts team prepares and signs payroll, and you approve it by sending.", 403) };
  }
  // Everyone but the treasury signs what they submit; the treasury's own signature is the payment itself.
  return { found, org, mustSign: !isTreasury };
}

/** The text the preparer signs. Clients show it and sign it as-is; the server rebuilds it to verify. */
export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const session = await requireMember("prepare");
  if (session instanceof NextResponse) return session;
  const c = await check(session.orgId, id, session.address);
  if (c.error) return c.error;
  const message = await expectedPreparedMessage(session.orgId, id, session.address);
  return message ? json({ message }) : fail("This network is no longer configured.", 500);
}

/** The preparer submits their reviewed draft, signed with their wallet, to the treasury (via any extra approvers). */
export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const session = await requireMember("prepare");
  if (session instanceof NextResponse) return session;
  const c = await check(session.orgId, id, session.address);
  if (c.error) return c.error;
  const body = (await readJson(req)) as { verifiedWallets?: unknown; signature?: unknown } | null;
  const verified = verifiedWallets(body?.verifiedWallets, new Set(c.found!.items.map((i) => i.wallet.toLowerCase())));

  let signed: { message: string; signature: string } | null = null;
  if (c.mustSign) {
    const signature = typeof body?.signature === "string" && isHex(body.signature) && body.signature.length <= 20_000 ? (body.signature as Hex) : null;
    if (!signature) return fail("Sign the payroll with your wallet to submit it.");
    const message = await expectedPreparedMessage(session.orgId, id, session.address);
    const client = serverClient(c.found!.run.chainId);
    if (!message || !client) return fail("This network is no longer configured.", 500);
    // verifyMessage also handles smart-contract wallets such as Safe (ERC-1271).
    const valid = await client.verifyMessage({ address: session.address as Hex, message, signature }).catch(() => false);
    if (!valid) return fail("That signature isn't a valid signature of this payroll from your wallet.", 401);
    signed = { message, signature };
  }

  const run = await requestApproval(session.orgId, id, session.address, verified, signed).catch((err) => {
    if (err instanceof OpenRunError) return null;
    throw err;
  });
  if (!run) {
    const open = await openRun(session.orgId);
    if (open && open.id !== id) return fail(new OpenRunError().message, 409);
    return fail("This draft was already submitted, or it's no longer a draft.", 409);
  }
  await logActivity(session.orgId, session.address, "run_requested", {
    runId: run.id,
    recipients: run.recipientCount,
    totals: run.totals,
    verifiedWallets: verified,
    signed: !!signed,
    status: run.status,
  });
  return json({ run });
}
