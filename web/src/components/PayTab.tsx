"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useAccount } from "wagmi";
import { usePayroll, type Phase } from "@/hooks/usePayroll";
import { useTreasury } from "@/hooks/useTreasury";
import { MAX_PAYMENTS } from "@/lib/abi";
import { api } from "@/lib/api";
import { explorerTx, getChainConfig, TOKEN_SYMBOLS, type TokenSymbol } from "@/lib/chains";
import { formatAmount, sumByToken, totalsLabel } from "@/lib/money";
import type { RunItem } from "@/lib/payments";
import type { Run } from "@/lib/types";
import { useEmployees } from "./PeopleTab";
import { Button, Card, CheckIcon, shortAddress, Spinner, XIcon } from "./ui";

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
      return <PayHome preparing={phase.kind === "preparing"} onRun={prepare} onOpenPeople={onOpenPeople} />;
    case "review":
      return <Review run={phase.run} items={phase.items} balances={treasury.balances} onBack={reset} onSend={() => send(phase.run, phase.items)} />;
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

function PayHome({ preparing, onRun, onOpenPeople }: { preparing: boolean; onRun: () => void; onOpenPeople: () => void }) {
  const employees = useEmployees();
  const runs = useQuery({ queryKey: ["runs"], queryFn: () => api<{ runs: Run[] }>("/api/runs").then((r) => r.runs) });
  const list = employees.data ?? [];
  const last = runs.data?.find((r) => r.status === "confirmed");

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <Card className="flex flex-col gap-6 rounded-[20px] p-9">
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-ink-2">Payroll</span>
          <h1 className="text-[40px] font-semibold leading-tight tracking-tight">
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
      </Card>
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
  balances,
  onBack,
  onSend,
}: {
  run: Run;
  items: RunItem[];
  balances: Partial<Record<TokenSymbol, bigint>>;
  onBack: () => void;
  onSend: () => void;
}) {
  const { chainId } = useAccount();
  const cfg = getChainConfig(run.chainId);
  const totals = sumByToken(items);
  const used = TOKEN_SYMBOLS.filter((s) => totals[s] > 0n);
  const short = used.filter((s) => balances[s] !== undefined && balances[s]! < totals[s]);
  const wrongChain = chainId !== run.chainId;
  const checks = [
    { ok: true, text: `All ${items.length} wallet addresses are valid EVM addresses` },
    {
      ok: short.length === 0,
      text: short.length === 0 ? `Your treasury holds enough: ${totalsLabel(totals)} needed` : `Not enough ${short.join(" and ")} in the treasury for this run`,
    },
    { ok: items.length <= MAX_PAYMENTS, text: `${items.length} of ${MAX_PAYMENTS} payments allowed in one transaction` },
    { ok: !wrongChain, text: wrongChain ? `Switch your wallet to ${cfg?.chain.name}` : `Paying on ${cfg?.chain.name}` },
  ];
  const canSend = checks.every((c) => c.ok);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <button type="button" onClick={onBack} className="inline-flex min-h-11 items-center gap-1.5 self-start text-sm text-ink-2 hover:text-ink">
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
        Back
      </button>
      <div>
        <h1 className="text-[32px] font-semibold tracking-tight">Review payroll</h1>
        <p className="mt-1 text-base text-ink-2">Pulled {items.length} people from People just now.</p>
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
          <span className="text-[13px] text-ink-2">Plus a one-time approval per token if needed</span>
        </Card>
      </div>

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
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-[#FAFBFC] text-left text-xs text-ink-3">
                <th scope="col" className="border-y border-line px-5 py-2.5 font-medium">Name</th>
                <th scope="col" className="border-y border-line px-5 py-2.5 font-medium">Wallet</th>
                <th scope="col" className="border-y border-line px-5 py-2.5 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.wallet}>
                  <td className="whitespace-nowrap border-b border-line-soft px-5 py-3">
                    <span className="font-semibold">{i.name}</span>
                    {i.role && <span className="text-ink-2"> · {i.role}</span>}
                  </td>
                  <td className="whitespace-nowrap border-b border-line-soft px-5 py-3 font-mono text-[13px] text-ink-2" title={i.wallet}>{shortAddress(i.wallet)}</td>
                  <td className="tabular whitespace-nowrap border-b border-line-soft px-5 py-3 text-right font-mono">{formatAmount(i.amount)} {i.token}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="flex flex-col gap-2.5">
        <Button size="lg" className="min-h-[60px] text-lg" onClick={onSend} disabled={!canSend}>
          Send to {items.length} {items.length === 1 ? "person" : "people"}
        </Button>
        <p className="text-center text-[13px] text-ink-2">Everyone is paid in one transaction from your wallet. Payments can&apos;t be reversed.</p>
      </div>
    </div>
  );
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
        ? `One signature pays everyone: ${totalsLabel(sumByToken(phase.items))}.`
        : phase.kind === "sending"
          ? "This usually takes a few seconds."
          : "Making sure every person got exactly what People says.";
  const steps = [
    { label: "Payroll pulled from People", idx: -1 },
    { label: "Tokens approved for this run", idx: 0 },
    { label: `Signed in ${wallet}`, idx: 1 },
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
