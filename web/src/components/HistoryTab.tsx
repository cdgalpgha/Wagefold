"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { describeActivity } from "@/lib/activity";
import { api } from "@/lib/api";
import { LIVE } from "@/lib/live";
import { explorerTx, getChainConfig } from "@/lib/chains";
import { saveFile, type SaveResult } from "@/lib/download";
import { formatAmount, formatEth, totalsLabel } from "@/lib/money";
import {
  journalCsv,
  paidAt,
  payeeYearCsv,
  paymentsCsv,
  payslip,
  payslipDate,
  payslipFilename,
  payslipHtml,
  rateFor,
  type PaidRun,
  type Payslip,
} from "@/lib/records";
import type { Activity, Me, Records, Run, RunDetail, RunStatus } from "@/lib/types";
import { ApprovalPanel } from "./Approvals";
import { copyText, useToast } from "./toast";
import { Button, Card, CopyIcon, EmptyState, shortAddress, Skeleton, XIcon } from "./ui";

const STATUS: Record<RunStatus, { label: string; className: string }> = {
  confirmed: { label: "Paid", className: "bg-good-soft text-good" },
  submitted: { label: "Pending", className: "bg-brand-soft text-brand-dark" },
  failed: { label: "Not paid", className: "bg-bad-soft text-bad-text" },
  draft: { label: "Draft", className: "bg-line-soft text-ink-2" },
  pending: { label: "Awaiting approval", className: "bg-warn-soft text-warn" },
  approved: { label: "Approved", className: "bg-brand-soft text-brand-dark" },
  rejected: { label: "Rejected", className: "bg-bad-soft text-bad-text" },
  cancelled: { label: "Cancelled", className: "bg-line-soft text-ink-2" },
};

type View = "runs" | "activity";

export function HistoryTab({ me }: { me: Me }) {
  const [view, setView] = useState<View>("runs");
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.02em] sm:text-[30px]">History</h1>
          <p className="mt-1 text-[15px] text-ink-2">
            {view === "runs" ? "Every run, who was paid, payslips and exports for your accountant." : "Who changed what, and when. Entries can't be edited or deleted."}
          </p>
        </div>
        <div role="tablist" aria-label="History view" className="flex rounded-xl bg-line-soft p-1">
          {(["runs", "activity"] as View[]).map((v) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={view === v}
              onClick={() => setView(v)}
              className={`min-h-9 rounded-lg px-3.5 text-sm font-medium ${view === v ? "bg-surface text-ink shadow-raised" : "text-ink-2 hover:text-ink"}`}
            >
              {v === "runs" ? "Payroll runs" : "Activity"}
            </button>
          ))}
        </div>
      </div>
      {view === "runs" ? <Runs me={me} /> : <ActivityLog />}
    </div>
  );
}

function useSaved() {
  const toast = useToast();
  return (result: SaveResult, what: string) => {
    if (result === "saved") toast(`${what} downloaded`, { tone: "good" });
    else if (result === "unavailable") toast("Downloads aren't available here.", { tone: "bad" });
  };
}

function Runs({ me }: { me: Me }) {
  const runs = useQuery({ queryKey: ["runs"], queryFn: () => api<{ runs: Run[] }>("/api/runs").then((r) => r.runs), ...LIVE });
  const [open, setOpen] = useState<string | null>(null);
  const [slip, setSlip] = useState<{ run: Run; position: number } | null>(null);
  const list = runs.data ?? [];
  const paid = list.filter((r) => r.status === "confirmed");
  return (
    <>
      {paid.length > 0 && <Exports me={me} runs={paid} />}
      <Card className="overflow-hidden">
        {list.map((r) => {
          const expanded = open === r.id;
          return (
            <div key={r.id} className="border-b border-line-soft last:border-0">
              <button
                type="button"
                onClick={() => setOpen(expanded ? null : r.id)}
                aria-expanded={expanded}
                className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-5 py-4 text-left hover:bg-surface-2"
              >
                <span className="flex flex-1 basis-52 flex-col gap-0.5">
                  <span className="text-[15px] font-medium">
                    {new Date(r.paidAt ?? r.createdAt).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}
                  </span>
                  <span className="text-[13px] text-ink-2">
                    {r.recipientCount} people · {getChainConfig(r.chainId)?.chain.name ?? `Chain ${r.chainId}`}
                    {r.status === "failed" && r.failureReason ? ` · ${r.failureReason}` : ""}
                  </span>
                </span>
                <span className="tabular text-sm">{totalsLabel(r.totals)}</span>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS[r.status].className}`}>{STATUS[r.status].label}</span>
                <svg className={`h-4 w-4 text-ink-3 transition-transform ${expanded ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
              </button>
              {expanded && <RunDetails run={r} me={me} onPayslip={(position) => setSlip({ run: r, position })} />}
            </div>
          );
        })}
        {runs.isLoading && (
          <div className="flex flex-col gap-4 p-5" aria-busy="true">
            {[0, 1].map((i) => (
              <div key={i} className="flex items-center gap-4">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="ml-auto h-4 w-32" />
              </div>
            ))}
          </div>
        )}
        {!runs.isLoading && list.length === 0 && (
          <EmptyState icon="runs" title="No payroll runs yet">
            Every run you prepare shows up here with who was paid, its approvals, payslips and an export for your accountant.
          </EmptyState>
        )}
      </Card>
      {slip && <PayslipDialog me={me} run={slip.run} position={slip.position} onClose={() => setSlip(null)} />}
    </>
  );
}

function Exports({ me, runs }: { me: Me; runs: Run[] }) {
  const saved = useSaved();
  const years = [...new Set(runs.map((r) => Number(paidAt(r).slice(0, 4))))].sort((a, b) => b - a);
  const [year, setYear] = useState(years[0]);
  const [busy, setBusy] = useState(false);

  async function run(kind: "payments" | "journal" | "totals") {
    setBusy(true);
    try {
      const records = await api<Records>(`/api/records?year=${year}`);
      const file =
        kind === "payments"
          ? { name: `wagefold-payments-${year}.csv`, data: paymentsCsv(records.runs, me.org.ownerAddress), what: "Payments" }
          : kind === "journal"
            ? { name: `wagefold-journal-${year}.csv`, data: journalCsv(records.runs), what: "Journal" }
            : { name: `wagefold-totals-per-person-${year}.csv`, data: payeeYearCsv(records.runs, year), what: "Totals per person" };
      saved(await saveFile(file.name, file.data), file.what);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="flex flex-col gap-3 p-5">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="flex-1 text-base font-semibold">Records for your accountant</h2>
        <label className="flex items-center gap-2 text-sm text-ink-2">
          Year
          <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="min-h-10 rounded-lg border border-line-strong bg-surface px-2 text-sm text-ink">
            {years.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" disabled={busy} onClick={() => run("payments")}>Every payment (CSV)</Button>
        <Button variant="secondary" disabled={busy} onClick={() => run("journal")}>Journal for QuickBooks</Button>
        <Button variant="secondary" disabled={busy} onClick={() => run("totals")}>Totals per person</Button>
      </div>
      <p className="text-[13px] leading-relaxed text-ink-2">
        Each payment lists its transaction, block, network fee and the USD rate used, with its source. Totals per person help with year-end forms: in the
        US, contractors paid $2,000 or more in a year from 2026 generally need a 1099-NEC. Check with your accountant.
      </p>
    </Card>
  );
}

function RunDetails({ run, me, onPayslip }: { run: Run; me: Me; onPayslip: (position: number) => void }) {
  const toast = useToast();
  const saved = useSaved();
  const detail = useQuery({ queryKey: ["run", run.id], queryFn: () => api<RunDetail>(`/api/runs/${run.id}`) });
  const link = run.txHash ? explorerTx(run.chainId, run.txHash) : undefined;
  const paid = run.status === "confirmed";
  const rates = run.usdRates ? Object.entries(run.usdRates) : [];
  return (
    <div className="border-t border-line-soft bg-surface-2 px-5 py-3">
      {run.txHash && (
        <p className="flex flex-wrap items-center gap-2 pb-2 text-[13px] text-ink-2">
          Transaction
          <button type="button" onClick={() => copyText(run.txHash!, toast, "Transaction copied")} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 font-mono text-ink hover:bg-line-soft">
            {shortAddress(run.txHash)} <CopyIcon className="h-3.5 w-3.5" />
          </button>
          {link && <a href={link} target="_blank" rel="noreferrer" className="font-medium text-brand">View on explorer</a>}
        </p>
      )}
      {paid && (
        <dl className="grid gap-x-6 gap-y-1 pb-3 text-[13px] sm:grid-cols-3">
          <div><dt className="text-ink-2">Settled</dt><dd>{run.paidAt ? `${payslipDate(run.paidAt)} UTC` : "—"}{run.blockNumber ? ` · block ${run.blockNumber}` : ""}</dd></div>
          <div><dt className="text-ink-2">Network fee</dt><dd>{run.networkFee ? `${formatEth(run.networkFee)} ETH` : "—"}</dd></div>
          <div>
            <dt className="text-ink-2">USD rate</dt>
            <dd>{rates.length ? rates.map(([t, r]) => `${t} ${r!.rate}`).join(" · ") : "—"}{rates.some(([, r]) => r!.source.startsWith("par")) ? " (par)" : ""}</dd>
          </div>
        </dl>
      )}
      {detail.data && (run.createdBy || detail.data.approvals.length > 0 || run.rejection) && (
        <div className="pb-3">
          <ApprovalPanel run={run} approvals={detail.data.approvals} required={detail.data.approvals.length ? Math.max(detail.data.approvals.length, 0) : 0} />
        </div>
      )}
      {detail.isLoading ? (
        <Skeleton className="my-2 h-4 w-64" />
      ) : (
        <ul className="divide-y divide-line-soft">
          {detail.data?.items.map((i, n) => (
            <li key={i.wallet} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5 text-sm">
              <span className="flex-1 basis-40 font-medium">{i.name}</span>
              <span className="font-mono text-[13px] text-ink-2" title={i.wallet}>{shortAddress(i.wallet)}</span>
              <span className="tabular min-w-[130px] text-right font-medium">{formatAmount(i.amount)} {i.token}</span>
              {paid && (
                <button type="button" onClick={() => onPayslip(n)} className="min-h-9 rounded-lg px-2 text-[13px] font-medium text-brand hover:bg-brand-soft">
                  Payslip
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {paid && detail.data && (
        <div className="pt-2">
          <Button
            variant="ghost"
            className="!min-h-9 !px-0"
            onClick={async () => saved(await saveFile(`wagefold-run-${paidAt(run).slice(0, 10)}.csv`, paymentsCsv([detail.data as PaidRun], me.org.ownerAddress)), "Run")}
          >
            Download this run (CSV)
          </Button>
        </div>
      )}
    </div>
  );
}

function PayslipDialog({ me, run, position, onClose }: { me: Me; run: Run; position: number; onClose: () => void }) {
  const saved = useSaved();
  const year = paidAt(run).slice(0, 4);
  const records = useQuery({ queryKey: ["records", year], queryFn: () => api<Records>(`/api/records?year=${year}`) });
  const slip: Payslip | null = records.data ? payslip(records.data.runs, records.data.org.name, me.org.ownerAddress, run.id, position) : null;
  const dialog = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    dialog.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function print() {
    const f = frame.current;
    if (!f || !slip) return;
    f.onload = () => f.contentWindow?.print();
    f.srcdoc = payslipHtml(slip);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-night/50 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="payslip-h"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-surface p-6 shadow-xl outline-none sm:rounded-xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[13px] text-ink-2">Payment statement</p>
            <h2 id="payslip-h" className="text-xl font-semibold">{slip?.name ?? "Payslip"}</h2>
          </div>
          <button type="button" aria-label="Close" onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-lg text-ink-3 hover:bg-line-soft hover:text-ink">
            <XIcon />
          </button>
        </div>
        {!slip ? (
          <div className="flex flex-col gap-3 py-6" aria-busy="true">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-64" />
          </div>
        ) : (
          <>
            <p className="tabular mt-4 text-3xl font-semibold tracking-[-0.02em]">{formatAmount(slip.amount)} {slip.token}</p>
            <p className="mt-1 text-sm text-ink-2">
              ≈ {formatAmount(slip.usd)} USD · {rateFor(run, slip.token).source.startsWith("par") ? "at par" : `at ${slip.rate.rate}`}
            </p>
            <dl className="mt-4 divide-y divide-line-soft border-y border-line-soft text-sm">
              <Row k="From" v={slip.employer} />
              <Row k="Paid on" v={`${payslipDate(slip.paidAt)} (UTC) · ${slip.chain}`} />
              <Row k="To wallet" v={<span className="break-all font-mono text-[13px]">{slip.wallet}</span>} />
              <Row k={`Year to date (${slip.ytd.year})`} v={`≈ ${formatAmount(slip.ytd.usd)} USD over ${slip.ytd.payments} ${slip.ytd.payments === 1 ? "payment" : "payments"}`} />
              <Row k="Transaction" v={<span className="break-all font-mono text-[13px]">{slip.txHash ?? "—"}</span>} />
            </dl>
            <p className="mt-3 text-[13px] leading-relaxed text-ink-2">
              The transaction is the proof of payment. The PDF is a branded payment statement the person can keep or share with a lender.
            </p>
            <div className="mt-5 flex flex-wrap gap-2.5">
              <Button
                onClick={async () => {
                  const { payslipPdf } = await import("@/lib/pdf");
                  saved(await saveFile(payslipFilename(slip).replace(/\.html$/, ".pdf"), await payslipPdf(slip)), "Payslip");
                }}
              >
                Download PDF
              </Button>
              {!process.env.NEXT_PUBLIC_DEMO && <Button variant="secondary" onClick={print}>Print or save as PDF</Button>}
            </div>
            <iframe ref={frame} title="Payslip for printing" className="hidden" sandbox="allow-same-origin allow-modals" />
          </>
        )}
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 py-2.5 sm:flex-row sm:gap-4">
      <dt className="flex-none text-ink-2 sm:w-36">{k}</dt>
      <dd className="min-w-0">{v}</dd>
    </div>
  );
}

const TONE = { neutral: "bg-line-strong", warn: "bg-warn-dot", good: "bg-good-dot", bad: "bg-bad" };

function ActivityLog() {
  const activity = useQuery({ queryKey: ["activity"], queryFn: () => api<{ activity: Activity[] }>("/api/activity").then((r) => r.activity), ...LIVE });
  const list = activity.data ?? [];
  return (
    <Card className="overflow-hidden">
      <ul className="divide-y divide-line-soft">
        {list.map((a) => {
          const d = describeActivity(a);
          return (
            <li key={a.id} className="flex gap-3 px-5 py-3.5">
              <span className={`mt-1.5 h-2.5 w-2.5 flex-none rounded-full ${TONE[d.tone]}`} aria-hidden="true" />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-[15px] font-medium">{d.title}</span>
                {d.detail && <span className="break-words text-[13px] text-ink-2">{d.detail}</span>}
              </span>
              <span className="flex flex-none flex-col items-end gap-0.5 text-right text-[12px] text-ink-2">
                <span>{new Date(a.at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
                <span className="font-mono">{shortAddress(a.actor)}</span>
              </span>
            </li>
          );
        })}
      </ul>
      {activity.isLoading && (
        <div className="flex flex-col gap-4 p-5" aria-busy="true">
          <Skeleton className="h-4 w-56" />
          <Skeleton className="h-4 w-40" />
        </div>
      )}
      {!activity.isLoading && list.length === 0 && (
        <EmptyState icon="activity" title="Nothing logged yet">Sign-ins, changes to People and every payroll step are recorded here.</EmptyState>
      )}
    </Card>
  );
}
