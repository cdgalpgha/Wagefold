import "server-only";
import { approvalMessage } from "../approvals";
import { reviewRun } from "../changes";
import { getChainConfig } from "../chains";
import type { RunDetail } from "../types";
import { getOrganization, getRun, lastPaidRunItems, listApprovals, paidWallets, runVerifiedWallets } from "./repo";

/** Everything an approver or the sender sees: the snapshot, what changed, approvals so far. */
export async function runDetail(orgId: string, runId: string): Promise<RunDetail | null> {
  const found = await getRun(orgId, runId).catch(() => null);
  const org = await getOrganization(orgId);
  if (!found || !org) return null;
  const isOpen = ["draft", "pending", "approved"].includes(found.run.status);
  // For a run still in flight, compare with the last paid run; for history, there's nothing to review.
  const [previous, paid] = isOpen ? await Promise.all([lastPaidRunItems(orgId), paidWallets(orgId)]) : [null, []];
  return {
    ...found,
    approvals: await listApprovals(orgId, runId),
    approvalsRequired: org.approvalsRequired,
    review: isOpen ? reviewRun(previous, found.items, paid) : { firstRun: false, changes: [], newWallets: [], lookalikes: [] },
    verifiedWallets: await runVerifiedWallets(runId),
  };
}

/** The exact text an approver signs for this run, rebuilt from the server's own snapshot. */
export async function expectedApprovalMessage(orgId: string, runId: string, approver: string): Promise<string | null> {
  const found = await getRun(orgId, runId).catch(() => null);
  const org = await getOrganization(orgId);
  const cfg = found && getChainConfig(found.run.chainId);
  if (!found || !org || !cfg) return null;
  return approvalMessage({
    runId,
    onchainRef: found.run.onchainRef,
    items: found.items,
    cfg,
    company: org.name,
    treasury: org.ownerAddress,
    approver,
  });
}
