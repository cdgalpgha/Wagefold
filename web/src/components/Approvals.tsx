"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { api } from "@/lib/api";
import { LIVE, LIVE_SLOW } from "@/lib/live";
import { awaitingSafe } from "@/lib/safe";
import { ROLE_LABEL } from "@/lib/roles";
import { totalsLabel } from "@/lib/money";
import type { Approval, Me, Member, Run } from "@/lib/types";
import { Badge, Button, Card, CheckIcon, shortAddress, Spinner } from "./ui";
import { ChequeBand } from "./Security";

export function useTeam() {
  return useQuery({ queryKey: ["team"], queryFn: () => api<{ members: Member[]; approvalsRequired: number }>("/api/team"), ...LIVE_SLOW });
}

/** "Dana Okafor" if they're on the team with a name, otherwise the short address. */
export function useNameOf() {
  const team = useTeam();
  return (address: string | null | undefined) => {
    if (!address) return "Someone";
    const m = team.data?.members.find((x) => x.address.toLowerCase() === address.toLowerCase());
    return m?.name || shortAddress(address);
  };
}

const same = (a?: string | null, b?: string | null) => !!a && !!b && a.toLowerCase() === b.toLowerCase();

/** What this person can do with an open run right now. */
export function runActions(me: Me, run: Run, approvals: Approval[] = []) {
  const isOwner = same(me.address, me.org.ownerAddress);
  const isCreator = same(me.address, run.createdBy);
  const approved = approvals.some((a) => same(a.approver, me.address));
  const approver = me.role === "owner" || me.role === "admin";
  return {
    canApprove: approver && !isCreator && !approved && (run.status === "pending" || run.status === "approved") && run.approvalCount < me.org.approvalsRequired,
    // Counted, not trusted from the status: an approval stops counting if its approver leaves the team.
    // Two-person payroll: the treasury never sends a run it prepared itself.
    canSend:
      isOwner && !(me.org.twoPerson && isCreator) && (run.status === "approved" || run.status === "pending") && run.approvalCount >= me.org.approvalsRequired,
    canCancel: (isCreator || isOwner) && (run.status === "pending" || run.status === "approved"),
    canRecheck: run.status === "submitted" && (!!run.txHash || !!run.safeTxHash),
    // If the wallet dropped the transaction, the treasury sends the same run again. The contract pays
    // each run once per treasury, so a resend can never pay anyone twice.
    canResend: isOwner && !(me.org.twoPerson && isCreator) && run.status === "submitted" && run.approvalCount >= me.org.approvalsRequired,
    approvedByMe: approved,
    isCreator,
    isOwner,
  };
}

/** Approval progress as dots: filled for each approval, empty for each still needed. */
export function ApprovalDots({ have, need }: { have: number; need: number }) {
  return (
    <span className="inline-flex items-center gap-1" role="img" aria-label={`${have} of ${need} approvals`}>
      {Array.from({ length: Math.max(need, have) }, (_, i) => (
        <span key={i} className={`flex h-5 w-5 items-center justify-center rounded-full ${i < have ? "bg-good-dot text-white" : "border-2 border-line-strong"}`}>
          {i < have && <CheckIcon className="h-3 w-3" />}
        </span>
      ))}
    </span>
  );
}

/** Who prepared the run and who approved it, with each approval's wallet signature. */
export function ApprovalPanel({ run, approvals, required }: { run: Run; approvals: Approval[]; required: number }) {
  const nameOf = useNameOf();
  const team = useTeam();
  const role = (a: string) => team.data?.members.find((m) => same(m.address, a))?.role;
  return (
    <Card className="flex flex-col gap-3 p-5">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="flex-1 text-base font-semibold">Signatures</h2>
        {required > 0 && (
          <span className="flex items-center gap-2 text-sm text-ink-2">
            <ApprovalDots have={approvals.length} need={required} /> {approvals.length} of {required} sign-offs
          </span>
        )}
      </div>
      <ul className="flex flex-col gap-2 text-sm">
        <li className="flex flex-wrap items-center gap-2">
          <Badge tone={run.preparedSignature ? "good" : "neutral"}>{run.preparedSignature ? "Prepared, signed" : "Prepared"}</Badge>
          <span className="font-medium">{nameOf(run.createdBy)}</span>
          {run.requestedAt && <span className="text-ink-2">{new Date(run.requestedAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>}
          {run.preparedSignature && (
            <span className="font-mono text-[12px] text-ink-3" title={run.preparedSignature}>signed {run.preparedSignature.slice(0, 10)}…</span>
          )}
        </li>
        {approvals.map((a) => (
          <li key={a.approver} className="flex flex-wrap items-center gap-2">
            <Badge tone="good">Signed off</Badge>
            <span className="font-medium">{a.name || shortAddress(a.approver)}</span>
            {role(a.approver) && <span className="text-ink-2">{ROLE_LABEL[role(a.approver)!]}</span>}
            <span className="text-ink-2">{new Date(a.at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
            <span className="font-mono text-[12px] text-ink-3" title={a.signature}>signed {a.signature.slice(0, 10)}…</span>
          </li>
        ))}
        {run.rejection && (
          <li className="flex flex-wrap items-center gap-2">
            <Badge tone="bad">Rejected</Badge>
            <span className="font-medium">{nameOf(run.rejection.by)}</span>
            <span className="text-ink-2">“{run.rejection.reason}”</span>
          </li>
        )}
      </ul>
    </Card>
  );
}

const TITLE: Partial<Record<Run["status"], string>> = {
  pending: "Waiting for sign-off",
  approved: "Signed, ready for the treasury",
  submitted: "Sent, checking the transaction",
};
const SAFE_TITLE = "Waiting for your Safe signers";

/** The payroll currently in flight, on the Pay home screen, with the actions this person can take. */
export function OpenRunCard({
  me,
  run,
  busy,
  onOpen,
  onCancel,
  onRecheck,
}: {
  me: Me;
  run: Run;
  busy: boolean;
  onOpen: (mode: "approve" | "send" | "view") => void;
  onCancel: () => void;
  onRecheck: () => void;
}) {
  const nameOf = useNameOf();
  const detail = useQuery({ queryKey: ["run", run.id], queryFn: () => api<{ approvals: Approval[] }>(`/api/runs/${run.id}`), ...LIVE });
  const approvals = detail.data?.approvals ?? [];
  const a = runActions(me, run, approvals);
  const need = me.org.approvalsRequired;
  const left = Math.max(0, need - run.approvalCount);
  const safe = awaitingSafe(run);
  // Nobody has to keep a tab open for a Safe: anyone signed in checks now and then, and the server
  // records the payment as soon as the Safe has executed it.
  const queryClient = useQueryClient();
  const safeCheck = useQuery({
    queryKey: ["safe-check", run.id],
    queryFn: () => api<{ run: Run }>(`/api/runs/${run.id}/confirm`, { body: {} }),
    enabled: safe,
    ...LIVE_SLOW,
  });
  const checked = safeCheck.data?.run;
  useEffect(() => {
    if (checked && !awaitingSafe(checked)) queryClient.invalidateQueries({ queryKey: ["runs"] });
  }, [checked, queryClient]);
  const note =
    safe
      ? a.canResend
        ? "The payment is proposed in your Safe. Once enough signers approve and execute it there, Wagefold finds it on-chain and checks every payment. If your signers rejected it, send it again: a payroll can only be paid once, so nobody is paid twice."
        : "The treasury proposed this payment in its Safe. Wagefold marks it paid once the Safe's signers execute it and it checks out on-chain."
      : run.status === "submitted"
      ? a.canResend
        ? "You sent this payroll. Wagefold marks it paid once the transaction checks out on-chain. If your wallet dropped it, send it again: a payroll can only be paid once, so nobody is paid twice."
        : "The treasury sent this payroll. Wagefold marks it paid once the transaction checks out on-chain."
      : left === 0
        ? a.canSend
          ? `${nameOf(run.createdBy)} prepared and signed this payroll. Review it, then approve it by sending from the treasury.`
          : a.isCreator
            ? "You signed and submitted this payroll. The treasury approves it by sending."
            : "Signed and ready. Waiting for the treasury to approve it by sending."
        : a.isCreator
          ? `You signed and submitted this. It needs ${left} more sign-off${left === 1 ? "" : "s"} from an admin or the owner.`
          : a.approvedByMe
            ? `You signed off. ${left} more sign-off${left === 1 ? "" : "s"} needed.`
            : `Needs ${left} more sign-off${left === 1 ? "" : "s"} before the treasury.`;

  return (
    <Card className={`overflow-hidden ${a.canApprove || a.canSend ? "border-brand/50 ring-1 ring-brand/30" : ""}`}>
      <ChequeBand left={me.org.name} right={`Run ${run.id.slice(0, 8)}`} />
      <div className="flex flex-col gap-5 p-6 sm:p-8">
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex flex-1 basis-64 flex-col gap-1">
          <span className="text-sm font-medium text-ink-2">Payroll prepared by {nameOf(run.createdBy)}</span>
          <h1 className="text-[28px] leading-tight sm:text-[34px]">
            {safe ? SAFE_TITLE : run.status === "submitted" ? TITLE.submitted : left === 0 ? TITLE.approved : TITLE.pending}
          </h1>
          <p className="tabular text-base text-ink-2">
            {run.recipientCount} {run.recipientCount === 1 ? "person" : "people"} · {totalsLabel(run.totals)}
          </p>
        </div>
        {need > 0 && run.status !== "submitted" && (
          <span className="flex items-center gap-2 text-sm font-medium text-ink-2">
            <ApprovalDots have={run.approvalCount} need={need} /> {run.approvalCount} of {need}
          </span>
        )}
      </div>
      <p className="text-sm leading-relaxed text-ink-2">{note}</p>
      <div className="flex flex-wrap items-center gap-3">
        {a.canApprove && (
          <Button size="lg" onClick={() => onOpen("approve")} disabled={busy}>Review and sign off</Button>
        )}
        {a.canSend && (
          <Button size="lg" onClick={() => onOpen("send")} disabled={busy}>Review, approve and send</Button>
        )}
        {a.canRecheck && (
          <Button size="lg" onClick={onRecheck} disabled={busy}>{busy ? <Spinner /> : null}{safe ? "Check the Safe" : "Check the transaction"}</Button>
        )}
        {a.canResend && (
          <Button variant="secondary" onClick={() => onOpen("send")} disabled={busy}>Send again</Button>
        )}
        {!a.canApprove && !a.canSend && !a.canRecheck && (
          <Button variant="secondary" onClick={() => onOpen("view")}>View details</Button>
        )}
        {(a.canApprove || a.canSend) && <Button variant="secondary" onClick={() => onOpen("view")}>View details</Button>}
        {a.canCancel && (
          <button type="button" onClick={onCancel} disabled={busy} className="min-h-11 px-2 text-sm font-medium text-bad hover:underline">
            Cancel this payroll
          </button>
        )}
      </div>
      </div>
    </Card>
  );
}
