"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { explorerTx, getChainConfig } from "@/lib/chains";
import { totalsLabel } from "@/lib/money";
import type { Run, RunStatus } from "@/lib/types";
import { Card, shortAddress } from "./ui";

const STATUS: Record<RunStatus, { label: string; className: string }> = {
  confirmed: { label: "Paid", className: "bg-good-soft text-good" },
  submitted: { label: "Pending", className: "bg-brand-soft text-brand-dark" },
  failed: { label: "Not paid", className: "bg-bad-soft text-bad-text" },
  draft: { label: "Draft", className: "bg-line-soft text-ink-2" },
};

export function HistoryTab() {
  const runs = useQuery({ queryKey: ["runs"], queryFn: () => api<{ runs: Run[] }>("/api/runs").then((r) => r.runs) });
  const list = runs.data ?? [];
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5">
      <h1 className="text-[30px] font-semibold tracking-tight">History</h1>
      <Card className="overflow-hidden">
        {list.map((r) => {
          const link = r.txHash ? explorerTx(r.chainId, r.txHash) : undefined;
          return (
            <div key={r.id} className="flex flex-wrap items-center gap-4 border-b border-line-soft px-5 py-4 last:border-0">
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
              {r.txHash &&
                (link ? (
                  <a href={link} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center font-mono text-[13px] text-brand">
                    {shortAddress(r.txHash)}
                  </a>
                ) : (
                  <span className="font-mono text-[13px] text-ink-2">{shortAddress(r.txHash)}</span>
                ))}
            </div>
          );
        })}
        {runs.isLoading && <p className="px-5 py-8 text-center text-ink-2">Loading…</p>}
        {!runs.isLoading && list.length === 0 && <p className="px-5 py-12 text-center text-ink-2">No payroll runs yet.</p>}
      </Card>
    </div>
  );
}
