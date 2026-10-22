"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useAccount, useBalance, usePublicClient } from "wagmi";
import { usePayroll, type Phase, type ReviewMode } from "@/hooks/usePayroll";
import { useTreasury } from "@/hooks/useTreasury";
import { MAX_PAYMENTS } from "@/lib/abi";
import { api } from "@/lib/api";
import { explorerTx, getChainConfig, TOKEN_SYMBOLS, type TokenSymbol } from "@/lib/chains";
import { formatAmount, formatEth, sumByToken, totalsLabel } from "@/lib/money";
import type { Change, RunReview } from "@/lib/changes";
import { chunkAddress } from "@/lib/lookalike";
import type { RunItem } from "@/lib/payments";
import { can } from "@/lib/roles";
import type { Me, Run, RunDetail } from "@/lib/types";
import { ApprovalPanel, OpenRunCard, runActions, useNameOf } from "./Approvals";
import { useSession } from "@/hooks/useSession";
import { payDayLabel, scheduleStatus } from "@/lib/schedule";
import { useEmployees } from "./PeopleTab";
import { copyText, useToast } from "./toast";
import { Badge, Button, Card, CheckIcon, CopyIcon, shortAddress, Skeleton, Spinner, XIcon } from "./ui";

export function PayTab({
  onOpenPeople,
  onOpenHistory,
  onOpenSettings,
}: {
  onOpenPeople: () => void;
  onOpenHistory: () => void;
  onOpenSettings: () => void;
}) {
  const { phase, prepare, open, request, approve, reject, cancel, recheck, send, reset } = usePayroll();
  const verifiedRef = useRef<string[]>([]);
  const queryClient = useQueryClient();
  const treasury = useTreasury();
  const session = useSession();
  const toast = useToast();
  const me = session.data;

  useEffect(() => {
    // Any finished step can change the run list, approvals and invoices.
    if (phase.kind === "idle" || phase.kind === "done" || phase.kind === "failed") {
      queryClient.invalidateQueries({ queryKey: ["runs"] });
      queryClient.invalidateQueries({ queryKey: ["run"] });
      queryClient.invalidateQueries({ queryKey: ["activity"] });
      treasury.refetch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase.kind]);

  /** Runs an approval action and reports the outcome; errors stay on the current screen. */
  const act = async (fn: () => Promise<void>, done: string) => {
    try {
      await fn();
      toast(done, { tone: "good" });
    } catch (err) {
      toast((err as Error).message.replace(/^.*User (rejected|denied).*$/s, "Cancelled in your wallet."), { tone: "bad" });
    }
  };

  if (!me) return null;

  switch (phase.kind) {
    case "idle":
    case "preparing":
      return (
        <PayHome
          me={me}
          preparing={phase.kind === "preparing"}
          onRun={prepare}
          onOpenRun={(run, mode) => open(run.id, mode)}
          onCancelRun={(run) => act(() => cancel(run), "Payroll cancelled")}
          onRecheck={(run) => recheck(run, [])}
          onOpenPeople={onOpenPeople}
          onOpenSettings={onOpenSettings}
          balances={treasury.balances}
        />
      );
    case "loading":
      return (
        <div className="flex justify-center py-24 text-brand" role="status" aria-label="Loading">
          <Spinner className="h-7 w-7" />
        </div>
      );
    case "review":
      return (
        <Review
          me={me}
          mode={phase.mode}
          detail={phase.detail}
          run={phase.run}
          items={phase.items}
          review={phase.review}
          balances={treasury.balances}
          treasury={treasury.address}
          onBack={reset}
          onSend={(v) => {
            verifiedRef.current = v;
            send(phase.run, phase.items, v);
          }}
          onRequest={(v) =>
            act(
              () => request(phase.run, v),
              me.org.approvalsRequired > 0 ? "Sent for approval. Approvers will see it on their Pay page." : "Sent to the treasury wallet for signing.",
            )
          }
          onApprove={() => act(() => approve(phase.run), "Approved with your wallet signature")}
          onReject={(reason) => act(() => reject(phase.run, reason), "Payroll sent back to the preparer")}
          onCancel={() => act(() => cancel(phase.run), "Payroll cancelled")}
        />
      );
    case "approving":
    case "confirm":
    case "sending":
    case "verifying":
      return <Progress phase={phase} />;
    case "done":
      return <Done run={phase.run} items={phase.items} onBack={reset} onOpenHistory={onOpenHistory} />;
    case "failed":
      return (
        <Problem
          title="This run wasn't recorded as paid"
          message={phase.run.failureReason ?? "The transaction didn't match the run."}
          txHash={phase.run.txHash}
          chainId={phase.run.chainId}
          onBack={reset}
        />
      );
    case "error":
      return (
        <Problem
          title="Payroll not sent"
          message={phase.message}
          onBack={reset}
          onRetry={phase.run && phase.items ? () => send(phase.run!, phase.items!, verifiedRef.current) : undefined}
        />
      );
  }
}

function PayHome({
  me: session,
  preparing,
  onRun,
  onOpenRun,
  onCancelRun,
  onRecheck,
  onOpenPeople,
  onOpenSettings,
  balances,
}: {
  me: Me;
  preparing: boolean;
  onRun: () => void;
  onOpenRun: (run: Run, mode: "approve" | "send" | "view") => void;
  onCancelRun: (run: Run) => void;
  onRecheck: (run: Run) => void;
  onOpenPeople: () => void;
  onOpenSettings: () => void;
  balances: Partial<Record<TokenSymbol, bigint>>;
}) {
  const employees = useEmployees();
  const nameOf = useNameOf();
  const runs = useQuery({ queryKey: ["runs"], queryFn: () => api<{ runs: Run[] }>("/api/runs").then((r) => r.runs) });
  const openRun = runs.data?.find((r) => r.status === "pending" || r.status === "approved" || r.status === "submitted");
  const latest = runs.data?.[0];
  const rejected = latest?.status === "rejected" ? latest : undefined;
  const canPrepare = can(session.role, "prepare");
  const needsApproval = session.org.approvalsRequired > 0 || session.address.toLowerCase() !== session.org.ownerAddress.toLowerCase();
  const list = employees.data ?? [];
  const last = runs.data?.find((r) => r.status === "confirmed");
  const totals = sumByToken(list);
  const used = TOKEN_SYMBOLS.filter((s) => totals[s] > 0n);
  const short = used.filter((s) => balances[s] !== undefined && balances[s]! < totals[s]);

  if (employees.isLoading) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-6" aria-busy="true">
        <Card className="flex flex-col gap-5 rounded-[20px] p-9">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-11 w-72" />
          <Skeleton className="h-5 w-56" />
          <Skeleton className="h-14 w-44 rounded-xl" />
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      {rejected && !openRun && (
        <div role="status" className="rounded-2xl border border-bad-line bg-bad-soft p-4 text-sm text-bad-text">
          <span className="font-semibold">{nameOf(rejected.rejection?.by)} sent the last payroll back.</span>{" "}
          {rejected.rejection?.reason ? `“${rejected.rejection.reason}”` : ""} Fix it in People, then run payroll again.
        </div>
      )}
      {openRun ? (
        <OpenRunCard
          me={session}
          run={openRun}
          busy={preparing}
          onOpen={(mode) => onOpenRun(openRun, mode)}
          onCancel={() => onCancelRun(openRun)}
          onRecheck={() => onRecheck(openRun)}
        />
      ) : (
      <Card className="flex flex-col gap-6 rounded-[20px] p-6 sm:p-9">
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-ink-2">Payroll</span>
          <h1 className="text-[34px] font-semibold leading-tight tracking-tight sm:text-[40px]">
            Pay {list.length} {list.length === 1 ? "person" : "people"}
          </h1>
          <p className="tabular text-lg text-ink-2">{totalsLabel(sumByToken(list))}</p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          {canPrepare ? (
            <Button size="lg" onClick={onRun} disabled={preparing || list.length === 0}>
              {preparing ? <Spinner /> : null}
              {preparing ? "Pulling from People…" : needsApproval ? "Prepare payroll" : "Run payroll"}
            </Button>
          ) : (
            <span className="rounded-xl bg-line-soft px-4 py-3 text-sm text-ink-2">You have view-only access.</span>
          )}
          <span className="max-w-[42ch] text-sm leading-relaxed text-ink-2">
            {list.length === 0 ? "Add your team first. " : "Names, wallets and amounts come straight from "}
            <button type="button" onClick={onOpenPeople} className="text-brand underline">People</button>.
            {canPrepare && session.org.approvalsRequired > 0 && (
              <> It goes to {session.org.approvalsRequired} approver{session.org.approvalsRequired === 1 ? "" : "s"} before the treasury can send it.</>
            )}
          </span>
        </div>
        {short.length > 0 && (
          <p role="alert" className="rounded-xl bg-warn-soft px-4 py-3 text-sm text-warn">
            Top up {short.map((t) => `${formatAmount(totals[t] - balances[t]!)} ${t}`).join(" and ")} before paying everyone.
          </p>
        )}
      </Card>
      )}
      {<Schedule payDay={session.org.payDay} lastPaidAt={last ? last.paidAt ?? last.confirmedAt : null} onOpenSettings={onOpenSettings} />}
      {used.length > 0 && (
        <section aria-labelledby="coverage-h" className="flex flex-col gap-3">
          <h2 id="coverage-h" className="text-base font-semibold">Treasury</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {used.map((t) => {
              const bal = balances[t];
              const runsCovered = bal === undefined ? undefined : Number(bal / totals[t]);
              return (
                <Card key={t} className="flex flex-col gap-1 px-5 py-4">
                  <span className="text-sm text-ink-2">{t} balance</span>
                  <span className="tabular font-mono text-xl font-medium">{bal === undefined ? "…" : formatAmount(bal)}</span>
                  <span className={`text-[13px] ${runsCovered !== undefined && runsCovered < 1 ? "font-medium text-warn" : "text-ink-2"}`}>
                    {runsCovered === undefined
                      ? "Checking balance…"
                      : runsCovered < 1
                        ? `Short by ${formatAmount(totals[t] - bal!)} for one payroll`
                        : `Covers ${runsCovered} ${runsCovered === 1 ? "payroll" : "payrolls"} at ${formatAmount(totals[t])} each`}
                  </span>
                </Card>
              );
            })}
          </div>
        </section>
      )}
      {last && (
        <section className="flex flex-col gap-3">
          <h2 className="text-base font-semibold">Last payroll</h2>
          <Card className="flex flex-wrap items-center gap-4 px-5 py-4">
            <span className="flex flex-1 flex-col gap-0.5">
              <span className="text-[15px] font-medium">{new Date(last.createdAt).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}</span>
              <span className="text-[13px] text-ink-2">{last.recipientCount} people</span>
            </span>
            <span className="tabular text-sm">{totalsLabel(last.totals)}</span>
            <span className="text-[13px] font-semibold text-good">Paid</span>
          </Card>
        </section>
      )}
    </div>
  );
}

function Schedule({ payDay, lastPaidAt, onOpenSettings }: { payDay: number | null; lastPaidAt: string | null; onOpenSettings: () => void }) {
  if (payDay === null) {
    return (
      <Card className="flex flex-wrap items-center gap-3 px-5 py-4 text-sm">
        <CalendarIcon />
        <span className="flex-1 basis-56 text-ink-2">Set a payday to see when payroll is due and get a calendar reminder.</span>
        <Button variant="secondary" onClick={onOpenSettings}>Set payday</Button>
      </Card>
    );
  }
  const st = scheduleStatus(new Date(), payDay, lastPaidAt);
  const when = st.next.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  const paidThisCycle = lastPaidAt !== null && new Date(lastPaidAt).getTime() >= st.next.getTime() - 10 * 86_400_000;
  return (
    <Card className={`flex flex-wrap items-center gap-3 px-5 py-4 ${st.missed ? "border-warn-line bg-warn-soft" : ""}`}>
      <CalendarIcon />
      <span className="flex flex-1 basis-56 flex-col gap-0.5">
        <span className="text-[15px] font-medium">
          {paidThisCycle
            ? `Paid for this cycle · next payday ${when}`
            : st.daysUntil === 0
              ? "Payday is today"
              : `Next payday ${when} · in ${st.daysUntil} ${st.daysUntil === 1 ? "day" : "days"}`}
        </span>
        <span className={`text-[13px] ${st.missed ? "font-medium text-warn" : "text-ink-2"}`}>
          {st.missed
            ? `Payday ${st.previous.toLocaleDateString(undefined, { month: "short", day: "numeric" })} passed without a paid payroll.`
            : `${payDayLabel(payDay)}. Wagefold never sends on its own: you review and sign each run.`}
        </span>
      </span>
      <button type="button" onClick={onOpenSettings} className="min-h-10 text-sm font-medium text-brand">Change</button>
    </Card>
  );
}

function CalendarIcon() {
  return (
    <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-brand-soft text-brand-dark" aria-hidden="true">
      <svg className="h-4.5 w-4.5" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>
    </span>
  );
}

function Review({
  me,
  mode,
  detail,
  run,
  items,
  review,
  balances,
  treasury,
  onBack,
  onSend,
  onRequest,
  onApprove,
  onReject,
  onCancel,
}: {
  me: Me;
  mode: ReviewMode;
  detail?: RunDetail;
  run: Run;
  items: RunItem[];
  review: RunReview;
  balances: Partial<Record<TokenSymbol, bigint>>;
  treasury: `0x${string}` | undefined;
  onBack: () => void;
  onSend: (verifiedWallets: string[]) => void;
  onRequest: (verifiedWallets: string[]) => Promise<void>;
  onApprove: () => Promise<void>;
  onReject: (reason: string) => Promise<void>;
  onCancel: () => Promise<void>;
}) {
  const { chainId } = useAccount();
  const toast = useToast();
  const nameOf = useNameOf();
  const [confirmed, setConfirmed] = useState<Set<string>>(new Set());
  const [allChecked, setAllChecked] = useState(false);
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const preparing = mode === "prepare";
  const isOwner = me.address.toLowerCase() === me.org.ownerAddress.toLowerCase();
  // The owner sends directly only when no approvals are required; everyone else asks first.
  const directSend = preparing && isOwner && me.org.approvalsRequired === 0;
  const approvals = detail?.approvals ?? [];
  const actions = runActions(me, run, approvals);
  const preparerConfirmed = new Set((detail?.verifiedWallets ?? []).map((w) => w.toLowerCase()));
  const step = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };
  const cfg = getChainConfig(run.chainId);
  const totals = sumByToken(items);
  const used = TOKEN_SYMBOLS.filter((s) => totals[s] > 0n);
  const short = used.filter((s) => balances[s] !== undefined && balances[s]! < totals[s]);
  const wrongChain = chainId !== run.chainId;
  const changedWallets = new Set(review.changes.flatMap((c) => (c.kind === "wallet" ? [c.after.toLowerCase()] : [])));
  const newWallets = new Set(review.newWallets.map((w) => w.toLowerCase()));
  const lookalikes = new Map(review.lookalikes.map((l) => [l.wallet.toLowerCase(), l]));
  const toConfirm = items.filter((i) => changedWallets.has(i.wallet.toLowerCase()) || newWallets.has(i.wallet.toLowerCase()));
  const fee = useNetworkFee(run.chainId, items, newWallets, used.length);
  const eth = useBalance({ address: treasury, chainId: run.chainId });
  const ethShort = fee !== undefined && eth.data !== undefined && eth.data.value < fee;

  const checks = [
    { ok: true, text: `All ${items.length} wallet addresses are valid EVM addresses` },
    {
      ok: short.length === 0,
      text: short.length === 0 ? `Your treasury holds enough: ${totalsLabel(totals)} needed` : `Not enough ${short.join(" and ")} in the treasury for this run`,
    },
    {
      ok: !ethShort,
      text: ethShort ? `Add ETH on ${cfg?.chain.name} to cover the network fee` : `Enough ETH for the network fee`,
    },
    { ok: items.length <= MAX_PAYMENTS, text: `${items.length} of ${MAX_PAYMENTS} payments allowed in one transaction` },
    // Only the wallet that signs a transaction needs to be on the right network.
    ...(directSend || mode === "send" ? [{ ok: !wrongChain, text: wrongChain ? `Switch your wallet to ${cfg?.chain.name}` : `Paying on ${cfg?.chain.name}` }] : []),
  ];
  // Preparers confirm each new or changed wallet; approvers and the sender see those confirmations.
  const walletsOk = !preparing || (review.firstRun ? allChecked : toConfirm.every((i) => confirmed.has(i.wallet.toLowerCase())));
  const pending = review.firstRun ? (allChecked ? 0 : items.length) : toConfirm.filter((i) => !confirmed.has(i.wallet.toLowerCase())).length;
  // Approvers judge the run itself; balances can be topped up before the treasury sends.
  const canSend = (mode === "approve" ? ack : checks.every((c) => c.ok)) && walletsOk && !busy;
  const verified = review.firstRun ? items.map((i) => i.wallet) : toConfirm.map((i) => i.wallet);
  const toggle = (wallet: string) =>
    setConfirmed((prev) => {
      const next = new Set(prev);
      const k = wallet.toLowerCase();
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <button type="button" onClick={onBack} className="inline-flex min-h-11 items-center gap-1.5 self-start text-sm text-ink-2 hover:text-ink">
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
        Back
      </button>
      <div>
        <h1 className="text-[28px] font-semibold tracking-tight sm:text-[32px]">
          {mode === "approve" ? "Approve payroll" : mode === "send" ? "Send approved payroll" : mode === "view" ? "Payroll details" : "Review payroll"}
        </h1>
        <p className="mt-1 text-base text-ink-2">
          {preparing
            ? `Pulled ${items.length} ${items.length === 1 ? "person" : "people"} from People just now.`
            : `${items.length} ${items.length === 1 ? "person" : "people"}, prepared by ${nameOf(run.createdBy)}. This list can't change: any edit in People needs a new payroll.`}
        </p>
      </div>
      {!preparing && detail && <ApprovalPanel run={run} approvals={approvals} required={detail.approvalsRequired} />}

      {review.lookalikes.length > 0 && (
        <div role="alert" className="flex flex-col gap-2 rounded-2xl border border-bad-line bg-bad-soft p-5 text-sm text-bad-text">
          <p className="text-base font-semibold">
            {review.lookalikes.length === 1 ? "One wallet looks like another wallet" : `${review.lookalikes.length} wallets look like other wallets`} you&apos;ve paid
          </p>
          {review.lookalikes.map((l) => (
            <p key={l.wallet}>
              <span className="font-semibold">{l.name}</span>: <span className="font-mono">{shortAddress(l.wallet)}</span> looks like {l.resemblesName}&apos;s{" "}
              <span className="font-mono">{shortAddress(l.resembles)}</span> but is a different address.
            </p>
          ))}
          <p>This is how address-poisoning scams work. Don&apos;t send until you&apos;ve checked the full address with the person on a call.</p>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {used.map((s) => (
          <Card key={s} className="flex flex-col gap-1 p-5">
            <span className="text-sm text-ink-2">{s} to send</span>
            <span className="tabular font-mono text-[26px] font-medium tracking-tight">{formatAmount(totals[s])}</span>
            <span className="text-[13px] text-ink-2">
              {items.filter((i) => i.token === s).length} people · {balances[s] === undefined ? "…" : formatAmount(balances[s]!)} available
            </span>
          </Card>
        ))}
        <Card className="flex flex-col gap-1 p-5">
          <span className="text-sm text-ink-2">Transactions</span>
          <span className="font-mono text-[26px] font-medium tracking-tight">1</span>
          <span className="text-[13px] text-ink-2">
            Network fee about {fee === undefined ? "…" : `${formatEth(fee)} ETH`}, plus a token approval if your wallet needs one
          </span>
        </Card>
      </div>

      <Changes review={review} />

      <Card className="px-5 py-2">
        {checks.map((c) => (
          <div key={c.text} className="flex items-center gap-3 border-b border-line-soft py-3 last:border-0">
            <span className={`flex h-6 w-6 flex-none items-center justify-center rounded-full ${c.ok ? "bg-good-soft text-good" : "bg-bad-soft text-bad"}`}>
              {c.ok ? <CheckIcon className="h-3.5 w-3.5" /> : <XIcon className="h-3.5 w-3.5" />}
            </span>
            <span className="text-sm">{c.text}</span>
          </div>
        ))}
      </Card>

      {!preparing && toConfirm.length > 0 && (
        <Card className="overflow-hidden">
          <div className="px-5 pt-4">
            <h2 className="text-base font-semibold">New or changed wallets</h2>
            <p className="mt-1 text-sm text-ink-2">The preparer confirmed these with each person before asking for approval.</p>
          </div>
          <ul className="mt-3 divide-y divide-line-soft border-t border-line">
            {toConfirm.map((i) => {
              const k = i.wallet.toLowerCase();
              const like = lookalikes.get(k);
              return (
                <li key={i.wallet} className={`flex flex-col gap-2 px-5 py-3.5 ${like ? "bg-bad-soft/40" : ""}`}>
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-semibold">{i.name}</span>
                    {like ? <Badge tone="bad">Looks like {like.resemblesName}&apos;s wallet</Badge> : changedWallets.has(k) ? <Badge tone="bad">Wallet changed</Badge> : <Badge tone="warn">First payment</Badge>}
                    {preparerConfirmed.has(k) ? <Badge tone="good">Confirmed by preparer</Badge> : <Badge tone="neutral">Not confirmed</Badge>}
                  </div>
                  <span className="flex flex-wrap gap-x-2 font-mono text-[14px] tracking-wide">
                    {chunkAddress(i.wallet).map((c, n) => (
                      <span key={n} className={n === 0 || n === 9 ? "font-semibold" : "text-ink-2"}>{c}</span>
                    ))}
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {preparing && !review.firstRun && toConfirm.length > 0 && (
        <Card className="overflow-hidden">
          <div className="px-5 pt-4">
            <h2 className="text-base font-semibold">Confirm {toConfirm.length === 1 ? "this wallet" : `these ${toConfirm.length} wallets`} with each person</h2>
            <p className="mt-1 text-sm text-ink-2">
              Read the full address back to them on a call or in person. Don&apos;t rely on email or chat: those are how fake &ldquo;new wallet&rdquo; requests arrive.
            </p>
          </div>
          <ul className="mt-3 divide-y divide-line-soft border-t border-line">
            {toConfirm.map((i) => {
              const k = i.wallet.toLowerCase();
              const like = lookalikes.get(k);
              return (
                <li key={i.wallet} className={`flex flex-col gap-2.5 px-5 py-4 ${like ? "bg-bad-soft/40" : ""}`}>
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-semibold">{i.name}</span>
                    {like ? <Badge tone="bad">Looks like {like.resemblesName}&apos;s wallet</Badge> : changedWallets.has(k) ? <Badge tone="bad">Wallet changed</Badge> : <Badge tone="warn">First payment</Badge>}
                  </div>
                  <button
                    type="button"
                    onClick={() => copyText(i.wallet, toast, "Address copied")}
                    title="Copy address"
                    className="flex flex-wrap gap-x-2 gap-y-1 self-start rounded-lg bg-line-soft px-3 py-2 text-left font-mono text-[15px] tracking-wide text-ink hover:bg-line"
                  >
                    {chunkAddress(i.wallet).map((c, n) => (
                      <span key={n} className={n === 0 || n === 9 ? "font-semibold" : ""}>{c}</span>
                    ))}
                  </button>
                  <label className="flex cursor-pointer items-center gap-2.5 text-sm">
                    <input type="checkbox" checked={confirmed.has(k)} onChange={() => toggle(i.wallet)} className="h-5 w-5 flex-none accent-brand" />
                    I confirmed this full address with {i.name}
                  </label>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <Card className="overflow-hidden">
        <h2 className="px-5 py-4 text-base font-semibold">Who gets paid</h2>
        <ul className="divide-y divide-line-soft border-t border-line">
          {items.map((i) => {
            const w = i.wallet.toLowerCase();
            return (
              <li key={i.wallet} className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-5 py-3 text-sm">
                <span className="min-w-0 flex-1 basis-48">
                  <span className="font-semibold">{i.name}</span>
                  {i.role && <span className="text-ink-2"> · {i.role}</span>}
                </span>
                <span className="flex items-center gap-2">
                  {lookalikes.has(w) ? <Badge tone="bad">Lookalike</Badge> : changedWallets.has(w) ? <Badge tone="bad">Wallet changed</Badge> : newWallets.has(w) && !review.firstRun ? <Badge tone="warn">First payment</Badge> : null}
                  <button
                    type="button"
                    title={`${i.wallet} (click to copy)`}
                    onClick={() => copyText(i.wallet, toast, "Address copied")}
                    className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 font-mono text-[13px] text-ink-2 hover:bg-line-soft hover:text-ink"
                  >
                    {shortAddress(i.wallet)} <CopyIcon className="h-3.5 w-3.5" />
                  </button>
                </span>
                <span className="tabular min-w-[130px] text-right font-mono">
                  {formatAmount(i.amount)} {i.token}
                </span>
              </li>
            );
          })}
        </ul>
      </Card>

      {preparing && review.firstRun && (
        <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-warn-line bg-warn-soft p-4 text-sm text-warn">
          <input type="checkbox" checked={allChecked} onChange={(e) => setAllChecked(e.target.checked)} className="mt-0.5 h-5 w-5 flex-none accent-brand" />
          <span>
            <span className="font-semibold">I&apos;ve checked all {items.length} wallet addresses with each person.</span> Payments to a wrong address can&apos;t be
            reversed, and changed addresses are a common way payroll gets stolen.
          </span>
        </label>
      )}

      {mode === "approve" && (
        <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-line bg-surface p-4 text-sm">
          <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="mt-0.5 h-5 w-5 flex-none accent-brand" />
          <span>
            <span className="font-semibold">I&apos;ve checked who gets paid, the amounts and every new or changed wallet.</span> Your wallet will sign an
            approval of exactly this list. It doesn&apos;t move funds or cost gas.
          </span>
        </label>
      )}

      <div className="flex flex-col gap-2.5">
        {directSend || mode === "send" ? (
          <Button size="lg" className="min-h-[60px] text-lg" onClick={() => onSend(verified)} disabled={!canSend}>
            Send to {items.length} {items.length === 1 ? "person" : "people"}
          </Button>
        ) : preparing ? (
          <Button size="lg" className="min-h-[60px] text-lg" onClick={() => step(() => onRequest(verified))} disabled={!walletsOk || busy}>
            {busy ? <Spinner /> : null}
            {me.org.approvalsRequired > 0 ? "Submit for approval" : "Send to the treasury for signing"}
          </Button>
        ) : mode === "approve" ? (
          rejecting ? (
            <Card className="flex flex-col gap-3 p-4">
              <label className="flex flex-col gap-1.5 text-sm font-medium">
                Why are you sending it back?
                <textarea
                  className="min-h-[80px] rounded-[10px] border border-line-strong bg-surface px-3 py-2 text-[15px] text-ink focus:border-brand focus:outline-none"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  maxLength={300}
                  placeholder="e.g. Maya's new wallet wasn't confirmed with her."
                />
              </label>
              <div className="flex flex-wrap gap-2.5">
                <Button variant="danger" disabled={!reason.trim() || busy} onClick={() => step(() => onReject(reason))}>Reject payroll</Button>
                <Button variant="secondary" onClick={() => setRejecting(false)}>Keep reviewing</Button>
              </div>
            </Card>
          ) : (
            <div className="flex flex-col gap-2.5 sm:flex-row">
              <Button size="lg" className="min-h-[60px] flex-1 text-lg" onClick={() => step(onApprove)} disabled={!canSend || !actions.canApprove}>
                {busy ? <Spinner /> : null}
                Approve with my wallet
              </Button>
              <Button size="lg" variant="danger" className="min-h-[60px]" onClick={() => setRejecting(true)} disabled={busy}>Reject</Button>
            </div>
          )
        ) : null}
        {mode === "view" && actions.canCancel && (
          <Button variant="danger" onClick={() => step(onCancel)} disabled={busy}>Cancel this payroll</Button>
        )}
        <p className="text-center text-[13px] text-ink-2">
          {preparing && !walletsOk
            ? review.firstRun
              ? "Confirm the wallet check above to continue."
              : `Confirm ${pending} more ${pending === 1 ? "wallet" : "wallets"} above to continue.`
            : directSend || mode === "send"
              ? "Everyone is paid in one transaction from your wallet. Payments can't be reversed."
              : preparing
                ? me.org.approvalsRequired > 0
                  ? `${me.org.approvalsRequired} approver${me.org.approvalsRequired === 1 ? "" : "s"} must sign off before the treasury wallet can send it.`
                  : "The treasury wallet reviews and sends it."
                : mode === "approve"
                  ? "Once approvals are complete, only the treasury wallet can send it."
                  : ""}
        </p>
      </div>
    </div>
  );
}

/**
 * A rough fee for the payroll transaction, from gas measured in the contract tests: about 31k gas
 * for a first payment to a wallet, 14k for one paid before, plus approvals.
 */
function useNetworkFee(chainId: number, items: RunItem[], newWallets: Set<string>, tokens: number): bigint | undefined {
  const client = usePublicClient({ chainId });
  const price = useQuery({ queryKey: ["gasPrice", chainId], queryFn: () => client!.getGasPrice(), enabled: !!client, staleTime: 30_000 });
  if (price.data === undefined) return undefined;
  const gas = items.reduce((g, i) => g + (newWallets.has(i.wallet.toLowerCase()) ? 31_000n : 14_000n), 60_000n) + BigInt(tokens) * 46_000n;
  return gas * price.data;
}


function Changes({ review }: { review: RunReview }) {
  if (review.firstRun) {
    return (
      <Card className="flex gap-3 p-5">
        <span className="mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-full bg-brand-soft text-xs font-bold text-brand-dark" aria-hidden="true">1</span>
        <p className="text-sm leading-relaxed">
          <span className="font-semibold">This is your first payroll.</span> Every wallet is new, so check each address with its owner before you send.
        </p>
      </Card>
    );
  }
  if (review.changes.length === 0) {
    return (
      <Card className="flex items-center gap-3 p-5">
        <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-good-soft text-good"><CheckIcon className="h-3.5 w-3.5" /></span>
        <p className="text-sm"><span className="font-semibold">No changes since the last payroll.</span> Same people, same wallets, same amounts.</p>
      </Card>
    );
  }
  return (
    <Card className="overflow-hidden">
      <h2 className="px-5 pt-4 text-base font-semibold">
        {review.changes.length} {review.changes.length === 1 ? "change" : "changes"} since the last payroll
      </h2>
      <ul className="mt-2 divide-y divide-line-soft">
        {review.changes.map((c, i) => (
          <li key={`${c.kind}-${c.name}-${i}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3 text-sm">
            <ChangeBadge change={c} />
            <span className="font-medium">{c.name}</span>
            <span className="flex-1 basis-56 text-ink-2">{describe(c)}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function ChangeBadge({ change }: { change: Change }) {
  switch (change.kind) {
    case "wallet":
      return <Badge tone="bad">Wallet changed</Badge>;
    case "added":
      return <Badge tone="brand">New</Badge>;
    case "removed":
      return <Badge tone="neutral">Removed</Badge>;
    case "pay": {
      if (change.token !== change.beforeToken) return <Badge tone="warn">Token changed</Badge>;
      return Number(change.after) > Number(change.before) ? <Badge tone="warn">Pay up</Badge> : <Badge tone="warn">Pay down</Badge>;
    }
  }
}

function describe(c: Change): string {
  switch (c.kind) {
    case "wallet":
      return `${shortAddress(c.before)} → ${shortAddress(c.after)}`;
    case "added":
      return `${formatAmount(c.amount)} ${c.token}`;
    case "removed":
      return `Was ${formatAmount(c.amount)} ${c.token}, not in this run`;
    case "pay": {
      if (c.token !== c.beforeToken) return `${formatAmount(c.before)} ${c.beforeToken} → ${formatAmount(c.after)} ${c.token}`;
      const diff = Number(c.after) - Number(c.before);
      const pct = Number(c.before) > 0 ? Math.round((diff / Number(c.before)) * 100) : 0;
      return `${formatAmount(c.before)} → ${formatAmount(c.after)} ${c.token} (${diff > 0 ? "+" : ""}${pct}%)`;
    }
  }
}

function Progress({ phase }: { phase: Extract<Phase, { kind: "approving" | "confirm" | "sending" | "verifying" }> }) {
  const { connector } = useAccount();
  const wallet = connector?.name ?? "your wallet";
  const n = phase.items.length;
  const order = ["approving", "confirm", "sending", "verifying"] as const;
  const at = order.indexOf(phase.kind);
  const title =
    phase.kind === "approving"
      ? `Approve ${phase.symbol} in ${wallet}`
      : phase.kind === "confirm"
        ? `Confirm in ${wallet}`
        : phase.kind === "sending"
          ? `Sending to ${n} wallets`
          : "Checking the transaction";
  const body =
    phase.kind === "approving"
      ? `Step ${phase.step} of ${phase.steps}. This lets the payroll contract send exactly this run's ${phase.symbol} from your wallet, nothing more.`
      : phase.kind === "confirm"
        ? `${phase.batched ? "One confirmation approves the tokens and pays everyone" : "One signature pays everyone"}: ${totalsLabel(sumByToken(phase.items))}.`
        : phase.kind === "sending"
          ? "This usually takes a few seconds."
          : "Making sure every person got exactly what People says.";
  const batched = phase.kind === "confirm" && phase.batched;
  const steps = [
    { label: "Payroll pulled from People", idx: -1 },
    ...(batched ? [] : [{ label: "Tokens approved for this run", idx: 0 }]),
    { label: batched ? `Approved and signed in ${wallet}, in one go` : `Signed in ${wallet}`, idx: 1 },
    { label: `Sent to ${n} wallets`, idx: 2 },
    { label: "Verified on-chain", idx: 3 },
  ];

  return (
    <Card className="mx-auto mt-10 flex max-w-xl flex-col items-center gap-6 rounded-[20px] p-9 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-soft text-brand" aria-hidden="true">
        <Spinner className="h-7 w-7" />
      </span>
      <div role="status" aria-live="polite">
        <h1 className="text-[26px] font-semibold">{title}</h1>
        <p className="mt-1.5 text-[15px] leading-relaxed text-ink-2">{body}</p>
      </div>
      <ol className="flex w-full flex-col gap-3 text-left">
        {steps.map((s) => {
          const done = s.idx < at;
          const active = s.idx === at;
          return (
            <li key={s.label} className="flex items-center gap-3 text-[15px]">
              <span
                className={`flex h-[22px] w-[22px] flex-none items-center justify-center rounded-full ${
                  done ? "bg-good-dot text-white" : active ? "border-2 border-brand bg-brand-soft" : "border-2 border-line-strong"
                }`}
              >
                {done && <CheckIcon className="h-3 w-3" />}
              </span>
              <span className={active ? "font-semibold" : done ? "" : "text-ink-3"}>{s.label}</span>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

function Done({ run, items, onBack, onOpenHistory }: { run: Run; items: RunItem[]; onBack: () => void; onOpenHistory: () => void }) {
  const link = run.txHash ? explorerTx(run.chainId, run.txHash) : undefined;
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <Card className="flex flex-col items-center gap-5 rounded-[20px] p-9 text-center">
        <span className="flex h-[72px] w-[72px] items-center justify-center rounded-full bg-good-soft text-good">
          <CheckIcon className="h-9 w-9" />
        </span>
        <div role="status">
          <h1 className="text-[32px] font-semibold tracking-tight">
            Paid {items.length} {items.length === 1 ? "person" : "people"} in one transaction
          </h1>
          <p className="tabular mt-2 text-base text-ink-2">
            {totalsLabel(run.totals)} · verified on-chain{run.networkFee ? ` · network fee ${formatEth(run.networkFee)} ETH` : ""}
          </p>
        </div>
        {run.txHash && (
          <div className="flex flex-wrap items-center justify-center gap-2.5 text-sm">
            <span className="text-ink-2">Transaction</span>
            <span className="rounded-md bg-line-soft px-2 py-1 font-mono">{shortAddress(run.txHash)}</span>
            {link && <a href={link} target="_blank" rel="noreferrer" className="font-medium text-brand">View on explorer</a>}
          </div>
        )}
        <div className="flex flex-wrap justify-center gap-3">
          <Button variant="secondary" onClick={onBack}>Back to Pay</Button>
          <Button variant="secondary" onClick={onOpenHistory}>Payslips and records</Button>
        </div>
      </Card>
      <Card className="px-5 py-1">
        {items.map((i) => (
          <div key={i.wallet} className="flex flex-wrap items-center gap-3 border-b border-line-soft py-3 text-sm last:border-0">
            <CheckIcon className="h-3.5 w-3.5 text-good" />
            <span className="flex-1 font-medium">{i.name}</span>
            <span className="font-mono text-[13px] text-ink-2">{shortAddress(i.wallet)}</span>
            <span className="tabular min-w-[130px] text-right font-mono">{formatAmount(i.amount)} {i.token}</span>
          </div>
        ))}
      </Card>
    </div>
  );
}

function Problem({
  title,
  message,
  txHash,
  chainId,
  onBack,
  onRetry,
}: {
  title: string;
  message: string;
  txHash?: string | null;
  chainId?: number;
  onBack: () => void;
  onRetry?: () => void;
}) {
  const link = txHash && chainId ? explorerTx(chainId, txHash) : undefined;
  return (
    <Card className="mx-auto mt-10 flex max-w-xl flex-col items-center gap-5 rounded-[20px] p-9 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-bad-soft text-bad">
        <XIcon className="h-7 w-7" />
      </span>
      <div role="alert">
        <h1 className="text-[26px] font-semibold">{title}</h1>
        <p className="mt-1.5 text-[15px] leading-relaxed text-ink-2">{message}</p>
      </div>
      {link && <a href={link} target="_blank" rel="noreferrer" className="text-sm font-medium text-brand">View the transaction</a>}
      <div className="flex flex-wrap justify-center gap-3">
        {onRetry && <Button onClick={onRetry}>Try again</Button>}
        <Button variant="secondary" onClick={onBack}>Back to Pay</Button>
      </div>
    </Card>
  );
}
