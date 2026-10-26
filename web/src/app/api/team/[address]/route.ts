import { NextResponse } from "next/server";
import { isAddress } from "viem";
import { fail, json, readJson, requireMember } from "@/lib/server/http";
import { listMembers, logActivity, removeMember, updateMember } from "@/lib/server/repo";
import { revokeSessions } from "@/lib/server/session";
import { firstError, memberPatchInput } from "@/lib/validation";

type Ctx = { params: Promise<{ address: string }> };

/** Owner only: change a teammate's name or role. The owner's own row can't be changed. */
export async function PATCH(req: Request, ctx: Ctx) {
  const { address } = await ctx.params;
  const session = await requireMember("team");
  if (session instanceof NextResponse) return session;
  if (!isAddress(address, { strict: false })) return fail("Teammate not found.", 404);
  const parsed = memberPatchInput.safeParse(await readJson(req));
  if (!parsed.success) return fail(firstError(parsed.error));
  const before = (await listMembers(session.orgId)).find((m) => m.address.toLowerCase() === address.toLowerCase());
  const member = await updateMember(session.orgId, address, parsed.data);
  if (!before || !member) return fail("Teammate not found, or it's the owner.", 404);
  await logActivity(session.orgId, session.address, "member_updated", {
    address: member.address,
    name: member.name,
    changes: {
      ...(before.role !== member.role ? { role: [before.role, member.role] } : {}),
      ...(before.name !== member.name ? { name: [before.name, member.name] } : {}),
    },
  });
  return json({ member });
}

/** Owner only: remove a teammate. Their sessions end immediately. */
export async function DELETE(_req: Request, ctx: Ctx) {
  const { address } = await ctx.params;
  const session = await requireMember("team");
  if (session instanceof NextResponse) return session;
  if (!isAddress(address, { strict: false })) return fail("Teammate not found.", 404);
  const removed = await removeMember(session.orgId, address);
  if (!removed) return fail("Teammate not found, or it's the owner.", 404);
  await revokeSessions(session.orgId, removed.address);
  await logActivity(session.orgId, session.address, "member_removed", { address: removed.address, name: removed.name, role: removed.role });
  return json({ ok: true });
}
