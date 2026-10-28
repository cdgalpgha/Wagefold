import { NextResponse } from "next/server";
import { can } from "@/lib/roles";
import { fail, json, readJson, requireMember } from "@/lib/server/http";
import { getOrganization, listMembers, logActivity, setPolicy } from "@/lib/server/repo";
import { policyInput } from "@/lib/validation";

/**
 * Owner only: the payroll rule. Two-person payroll (the accounts team prepares and signs, the
 * treasury approves by sending) and how many extra admin sign-offs a payroll needs in between.
 */
export async function PATCH(req: Request) {
  const session = await requireMember("team");
  if (session instanceof NextResponse) return session;
  const parsed = policyInput.safeParse(await readJson(req));
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid payroll rule.");
  const { approvalsRequired: n, twoPerson } = parsed.data;
  if (n !== undefined && n > 0) {
    // Whoever prepares a run can't sign it off, so the rule needs at least n approvers besides them.
    const approvers = (await listMembers(session.orgId)).filter((m) => can(m.role, "approve")).length;
    if (n > approvers - 1) {
      return fail(`You need at least ${n + 1} people who can approve (owner and admins) for ${n} sign-off${n === 1 ? "" : "s"}, so the person who prepares a run isn't counted. Add admins first.`);
    }
  }
  const before = await getOrganization(session.orgId);
  const org = await setPolicy(session.orgId, { approvalsRequired: n, twoPerson });
  if (!org || !before) return fail("Organization not found.", 404);
  const changes: Record<string, [string, string]> = {};
  if (before.approvalsRequired !== org.approvalsRequired) changes.approvalsRequired = [String(before.approvalsRequired), String(org.approvalsRequired)];
  if (before.twoPerson !== org.twoPerson) changes.twoPerson = [before.twoPerson ? "on" : "off", org.twoPerson ? "on" : "off"];
  if (Object.keys(changes).length) await logActivity(session.orgId, session.address, "policy_updated", { changes });
  return json({ org });
}
