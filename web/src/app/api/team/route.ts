import { NextResponse } from "next/server";
import { fail, json, readJson, requireMember } from "@/lib/server/http";
import { addMember, getOrganization, listMembers, logActivity, MemberExistsError } from "@/lib/server/repo";
import { firstError, memberInput } from "@/lib/validation";

export const dynamic = "force-dynamic";
const MAX_MEMBERS = 50;

/** The team and the approval rule. Everyone on the team can see who approves. */
export async function GET() {
  const session = await requireMember();
  if (session instanceof NextResponse) return session;
  const org = await getOrganization(session.orgId);
  return json({ members: await listMembers(session.orgId), approvalsRequired: org?.approvalsRequired ?? 0 });
}

/** Owner only: add a wallet to the team as admin, preparer or viewer. */
export async function POST(req: Request) {
  const session = await requireMember("team");
  if (session instanceof NextResponse) return session;
  const parsed = memberInput.safeParse(await readJson(req));
  if (!parsed.success) return fail(firstError(parsed.error));
  if ((await listMembers(session.orgId)).length >= MAX_MEMBERS) return fail(`A team can have up to ${MAX_MEMBERS} members.`);
  try {
    const member = await addMember(session.orgId, parsed.data, session.address);
    await logActivity(session.orgId, session.address, "member_added", { address: member.address, name: member.name, role: member.role });
    return json({ member }, 201);
  } catch (err) {
    if (err instanceof MemberExistsError) return fail(err.message, 409);
    throw err;
  }
}
