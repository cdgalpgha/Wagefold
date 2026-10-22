import { NextResponse } from "next/server";
import { can } from "@/lib/roles";
import { fail, json, readJson, requireMember } from "@/lib/server/http";
import { getOrganization, listMembers, logActivity, setApprovalsRequired } from "@/lib/server/repo";
import { policyInput } from "@/lib/validation";

/** Owner only: how many approvals a payroll needs before the treasury can send it. */
export async function PATCH(req: Request) {
  const session = await requireMember("team");
  if (session instanceof NextResponse) return session;
  const parsed = policyInput.safeParse(await readJson(req));
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid approval rule.");
  const n = parsed.data.approvalsRequired;
  // Whoever prepares a run can't approve it, so the rule needs at least n approvers besides them.
  const approvers = (await listMembers(session.orgId)).filter((m) => can(m.role, "approve")).length;
  if (n > 0 && n > approvers - 1) {
    return fail(`You need at least ${n + 1} people who can approve (owner and admins) for ${n} approval${n === 1 ? "" : "s"}, so the person who prepares a run isn't counted. Add admins first.`);
  }
  const before = await getOrganization(session.orgId);
  const org = await setApprovalsRequired(session.orgId, n);
  if (!org || !before) return fail("Organization not found.", 404);
  if (before.approvalsRequired !== n) {
    await logActivity(session.orgId, session.address, "policy_updated", { changes: { approvalsRequired: [String(before.approvalsRequired), String(n)] } });
  }
  return json({ org });
}
