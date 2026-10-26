import { NextResponse } from "next/server";
import { isHex, type Hex } from "viem";
import { serverClient } from "@/lib/server/chain";
import { fail, json, readJson, requireMember } from "@/lib/server/http";
import { addApproval, getRun, lastPaidAt, logActivity, walletsChangedBy } from "@/lib/server/repo";
import { expectedApprovalMessage } from "@/lib/server/runs";

const UUID_RE = /^[0-9a-f-]{36}$/i;
type Ctx = { params: Promise<{ id: string }> };

/** Can this person approve this run? Returns the reason if not. */
async function check(orgId: string, id: string, approver: string) {
  if (!UUID_RE.test(id)) return { error: fail("Payroll run not found.", 404) };
  const found = await getRun(orgId, id).catch(() => null);
  if (!found) return { error: fail("Payroll run not found.", 404) };
  if (!["pending", "approved"].includes(found.run.status)) return { error: fail("This payroll isn't waiting for approval.", 409) };
  // Maker-checker: the person who prepared a run never approves it.
  if (found.run.createdBy?.toLowerCase() === approver.toLowerCase()) return { error: fail("You prepared this payroll, so someone else has to approve it.", 403) };
  // Four eyes on payees: whoever added or changed a wallet since the last payroll can't approve paying it.
  const changed = await walletsChangedBy(orgId, approver, await lastPaidAt(orgId));
  const touched = found.items.filter((i) => changed.has(i.wallet.toLowerCase()));
  if (touched.length) {
    const names = touched.slice(0, 3).map((i) => i.name).join(", ");
    return { error: fail(`You added or changed the wallet for ${names} since the last payroll, so someone else has to approve this one.`, 403) };
  }
  return { found };
}

/** The text to sign. Clients show it and sign it as-is; the server rebuilds it to verify. */
export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const session = await requireMember("approve");
  if (session instanceof NextResponse) return session;
  const c = await check(session.orgId, id, session.address);
  if (c.error) return c.error;
  const message = await expectedApprovalMessage(session.orgId, id, session.address);
  return message ? json({ message }) : fail("This network is no longer configured.", 500);
}

/** Records an approval after verifying the approver's wallet signed this run's exact message. */
export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const session = await requireMember("approve");
  if (session instanceof NextResponse) return session;
  const c = await check(session.orgId, id, session.address);
  if (c.error) return c.error;
  const body = (await readJson(req)) as { signature?: unknown } | null;
  const signature = typeof body?.signature === "string" && isHex(body.signature) && body.signature.length <= 20_000 ? (body.signature as Hex) : null;
  if (!signature) return fail("Missing approval signature.");
  const message = await expectedApprovalMessage(session.orgId, id, session.address);
  const client = serverClient(c.found!.run.chainId);
  if (!message || !client) return fail("This network is no longer configured.", 500);
  // verifyMessage also handles smart-contract wallets such as Safe (ERC-1271).
  const valid = await client.verifyMessage({ address: session.address as Hex, message, signature }).catch(() => false);
  if (!valid) return fail("That signature isn't a valid approval of this payroll from your wallet.", 401);
  const run = await addApproval(session.orgId, id, session.address, message, signature);
  if (!run) return fail("This payroll isn't waiting for approval.", 409);
  await logActivity(session.orgId, session.address, "run_approved", {
    runId: id,
    approvals: run.approvalCount,
    status: run.status,
  });
  return json({ run });
}
