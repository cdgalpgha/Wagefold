"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { usePayroll, type Phase } from "@/hooks/usePayroll";
import { useTreasury } from "@/hooks/useTreasury";
import { MAX_PAYMENTS } from "@/lib/abi";
import { api } from "@/lib/api";
import { explorerTx, getChainConfig, TOKEN_SYMBOLS, type TokenSymbol } from "@/lib/chains";
import { formatAmount, sumByToken, totalsLabel } from "@/lib/money";
import type { Change, RunReview } from "@/lib/changes";
import type { RunItem } from "@/lib/payments";
import type { Run } from "@/lib/types";
import { useEmployees } from "./PeopleTab";
import { copyText, useToast } from "./toast";
import { Badge, Button, Card, CheckIcon, CopyIcon, shortAddress, Skeleton, Spinner, XIcon } from "./ui";

export function PayTab({ onOpenPeople, onOpenHistory }: { onOpenPeople: () => void; onOpenHistory: () => void }) {
  const { phase, prepare, send, reset } = usePayroll();
  const queryClient = useQueryClient();
  const treasury = useTreasury();

  useEffect(() => {
    if (phase.kind === "done" || phase.kind === "failed") {
      queryClient.invalidateQueries({ queryKey: ["runs"] });
      treasury.refetch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase.kind]);

  switch (phase.kind) {
    case "idle":
    case "preparing":
      return <PayHome preparing={phase.kind === "preparing"} onRun={prepare} onOpenPeople={onOpenPeople} balances={treasury.balances} />;
    case "review":
      return (
        <Review run={phase.run} items={phase.items} review={phase.review} balances={treasury.balances} onBack={reset} onSend={() => send(phase.run, phase.items)} />
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
          onRetry={phase.run && phase.items ? () => send(phase.run!, phase.items!) : undefined}
        />
      );
  }
}

function PayHome({
  preparing,
  onRun,
  onOpenPeople,
  balances,
}: {
  preparing: boolean;
  onRun: () => void;
  onOpenPeople: () => void;
  balances: Partial<Record<TokenSymbol, bigint>>;
}) {
  const employees = useEmployees();
  const runs = useQuery({ queryKey: ["runs"], queryFn: () => api<{ runs: Run[] }>("/api/runs").then((r) => r.runs) });
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
      <Card className="flex flex-col gap-6 rounded-[20px] p-6 sm:p-9">
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-ink-2">Payroll</span>
          <h1 className="text-[34px] font-semibold leading-tight tracking-tight sm:text-[40px]">
            Pay {list.length} {list.length === 1 ? "person" : "people"}
          </h1>
          <p className="tabular text-lg text-ink-2">{totalsLabel(sumByToken(list))}</p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <Button size="lg" onClick={onRun} disabled={preparing || list.length === 0}>
            {preparing ? <Spinner /> : null}
            {preparing ? "Pulling from People…" : "Run payroll"}
          </Button>
          <span className="max-w-[42ch] text-sm leading-relaxed text-ink-2">
            {list.length === 0 ? "Add your team first. " : "Names, wallets and amounts come straight from "}
            <button type="button" onClick={onOpenPeople} className="text-brand underline">People</button>.
          </span>
        </div>
        {short.length > 0 && (
          <p role="alert" className="rounded-xl bg-warn-soft px-4 py-3 text-sm text-warn">
            Top up {short.map((t) => `${formatAmount(totals[t] - balances[t]!)} ${t}`).join(" and ")} before paying everyone.
          </p>
        )}
      </Card>
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

function Review({
  run,
  items,
  review,
  balances,
  onBack,
  onSend,
}: {
  run: Run;
  items: RunItem[];
  review: RunReview;
  balances: Partial<Record<TokenSymbol, bigint>>;
  onBack: () => void;
  onSend: () => void;
}) {
  const { chainId } = useAccount();
  const toast = useToast();
  const [checked, setChecked] = useState(false);
  const cfg = getChainConfig(run.chainId);
  const totals = sumByToken(items);
  const used = TOKEN_SYMBOLS.filter((s) => totals[s] > 0n);
  const short = used.filter((s) => balances[s] !== undefined && balances[s]! < totals[s]);
  const wrongChain = chainId !== run.chainId;
  const changedWallets = new Set(review.changes.flatMap((c) => (c.kind === "wallet" ? [c.after.toLowerCase()] : [])));
  const newWallets = new Set(review.newWallets.map((w) => w.toLowerCase()));
  const toCheck = new Set([...changedWallets, ...newWallets]).size;
  const checks = [
    { ok: true, text: `All ${items.length} wallet addresses are valid EVM addresses` },
    {
      ok: short.length === 0,
      text: short.length === 0 ? `Your treasury holds enough: ${totalsLabel(totals)} needed` : `Not enough ${short.join(" and ")} in the treasury for this run`,
    },
    { ok: items.length <= MAX_PAYMENTS, text: `${items.length} of ${MAX_PAYMENTS} payments allowed in one transaction` },
    { ok: !wrongChain, text: wrongChain ? `Switch your wallet to ${cfg?.chain.name}` : `Paying on ${cfg?.chain.name}` },
  ];
  const canSend = checks.every((c) => c.ok) && (toCheck === 0 || checked);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <button type="button" onClick={onBack} className="inline-flex min-h-11 items-center gap-1.5 self-start text-sm text-ink-2 hover:text-ink">
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
        Back
      </button>
      <div>
        <h1 className="text-[28px] font-semibold tracking-tight sm:text-[32px]">Review payroll</h1>
        <p className="mt-1 text-base text-ink-2">Pulled {items.length} {items.length === 1 ? "person" : "people"} from People just now.</p>
      </div>

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
          <span className="text-[13px] text-ink-2">Plus a token approval if your wallet needs one</span>
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
                  {changedWallets.has(w) ? <Badge tone="bad">Wallet changed</Badge> : newWallets.has(w) && !review.firstRun ? <Badge tone="warn">First payment</Badge> : null}
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

      {toCheck > 0 && (
        <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-[#F3D9A4] bg-warn-soft p-4 text-sm text-warn">
          <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} className="mt-0.5 h-5 w-5 flex-none accent-brand" />
          <span>
            <span className="font-semibold">
              {review.firstRun
                ? `I've checked all ${items.length} wallet addresses with each person.`
                : `I've confirmed the ${toCheck} ${toCheck === 1 ? "wallet" : "wallets"} marked above with ${toCheck === 1 ? "that person" : "each person"}.`}
            </span>{" "}
            Payments to a wrong address can&apos;t be reversed, and changed addresses are a common way payroll gets stolen.
          </span>
        </label>
      )}

      <div className="flex flex-col gap-2.5">
        <Button size="lg" className="min-h-[60px] text-lg" onClick={onSend} disabled={!canSend}>
          Send to {items.length} {items.length === 1 ? "person" : "people"}
        </Button>
        <p className="text-center text-[13px] text-ink-2">
          {toCheck > 0 && !checked ? "Confirm the wallet check above to continue." : "Everyone is paid in one transaction from your wallet. Payments can't be reversed."}
        </p>
      </div>
    </div>
  );
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
          <p className="tabular mt-2 text-base text-ink-2">{totalsLabel(run.totals)} · verified on-chain</p>
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
          <Button variant="secondary" onClick={onOpenHistory}>See history</Button>
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
