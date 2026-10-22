"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "@/lib/api";
import { explorerTx, getChainConfig } from "@/lib/chains";
import { formatAmount, totalsLabel } from "@/lib/money";
import type { Run, RunStatus, RunWithItems } from "@/lib/types";
import { copyText, useToast } from "./toast";
import { Card, CopyIcon, shortAddress, Skeleton } from "./ui";

const STATUS: Record<RunStatus, { label: string; className: string }> = {
  confirmed: { label: "Paid", className: "bg-good-soft text-good" },
  submitted: { label: "Pending", className: "bg-brand-soft text-brand-dark" },
  failed: { label: "Not paid", className: "bg-bad-soft text-bad-text" },
  draft: { label: "Draft", className: "bg-line-soft text-ink-2" },
};

export function HistoryTab() {
  const runs = useQuery({ queryKey: ["runs"], queryFn: () => api<{ runs: Run[] }>("/api/runs").then((r) => r.runs) });
  const [open, setOpen] = useState<string | null>(null);
  const list = runs.data ?? [];
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5">
      <div>
        <h1 className="text-[28px] font-semibold tracking-tight sm:text-[30px]">History</h1>
        <p className="mt-1 text-[15px] text-ink-2">Open a run to see exactly who was paid and to which wallet.</p>
      </div>
      <Card className="overflow-hidden">
        {list.map((r) => {
          const expanded = open === r.id;
          return (
            <div key={r.id} className="border-b border-line-soft last:border-0">
              <button
                type="button"
                onClick={() => setOpen(expanded ? null : r.id)}
                aria-expanded={expanded}
                className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-5 py-4 text-left hover:bg-[#FAFBFC]"
              >
                <span className="flex flex-1 basis-52 flex-col gap-0.5">
                  <span className="text-[15px] font-medium">
                    {new Date(r.createdAt).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}
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
              {expanded && <RunDetails run={r} />}
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
        {!runs.isLoading && list.length === 0 && <p className="px-5 py-12 text-center text-ink-2">No payroll runs yet.</p>}
      </Card>
    </div>
  );
}

function RunDetails({ run }: { run: Run }) {
  const toast = useToast();
  const detail = useQuery({ queryKey: ["run", run.id], queryFn: () => api<RunWithItems>(`/api/runs/${run.id}`) });
  const link = run.txHash ? explorerTx(run.chainId, run.txHash) : undefined;
  return (
    <div className="border-t border-line-soft bg-[#FAFBFC] px-5 py-3">
      {run.txHash && (
        <p className="flex flex-wrap items-center gap-2 pb-2 text-[13px] text-ink-2">
          Transaction
          <button type="button" onClick={() => copyText(run.txHash!, toast, "Transaction copied")} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 font-mono text-ink hover:bg-line-soft">
            {shortAddress(run.txHash)} <CopyIcon className="h-3.5 w-3.5" />
          </button>
          {link && <a href={link} target="_blank" rel="noreferrer" className="font-medium text-brand">View on explorer</a>}
        </p>
      )}
      {detail.isLoading ? (
        <Skeleton className="my-2 h-4 w-64" />
      ) : (
        <ul className="divide-y divide-line-soft">
          {detail.data?.items.map((i) => (
            <li key={i.wallet} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5 text-sm">
              <span className="flex-1 basis-40 font-medium">{i.name}</span>
              <span className="font-mono text-[13px] text-ink-2" title={i.wallet}>{shortAddress(i.wallet)}</span>
              <span className="tabular min-w-[130px] text-right font-mono">{formatAmount(i.amount)} {i.token}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
