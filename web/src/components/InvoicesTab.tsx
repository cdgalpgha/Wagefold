"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "@/lib/api";
import { saveFile } from "@/lib/download";
import { invoiceFilename, periodLabel, type Invoice } from "@/lib/invoices";
import { formatAmount } from "@/lib/money";
import { payslipDate } from "@/lib/records";
import { useToast } from "./toast";
import { Badge, Button, Card, Skeleton } from "./ui";

/** pdf-lib is only needed when someone downloads, so it loads on first use. */
async function pdf(invoices: Invoice[]) {
  const { invoicesPdf } = await import("@/lib/pdf");
  return invoicesPdf(invoices.map((i) => i.data));
}

export function InvoicesTab({ onOpenSettings }: { onOpenSettings: () => void }) {
  const toast = useToast();
  const invoices = useQuery({ queryKey: ["invoices"], queryFn: () => api<{ invoices: Invoice[] }>("/api/invoices").then((r) => r.invoices) });
  const list = invoices.data ?? [];
  const periods = [...new Set(list.map((i) => i.data.period))].sort().reverse();
  const [period, setPeriod] = useState<string>("all");
  const shown = period === "all" ? list : list.filter((i) => i.data.period === period);
  const [busy, setBusy] = useState<string | null>(null);

  async function download(key: string, items: Invoice[], filename: string) {
    setBusy(key);
    try {
      const bytes = await pdf([...items].sort((a, b) => a.number - b.number));
      const result = await saveFile(filename, bytes);
      if (result === "saved") toast(items.length === 1 ? "Invoice downloaded" : `${items.length} invoices downloaded`, { tone: "good" });
      else if (result === "unavailable") toast("Downloads aren't available here.", { tone: "bad" });
    } catch (err) {
      toast(`Couldn't create the PDF: ${(err as Error).message}`, { tone: "bad" });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[28px] font-semibold tracking-tight sm:text-[30px]">Invoices</h1>
          <p className="mt-1 max-w-[62ch] text-[15px] text-ink-2">
            Issued automatically for every payment once a payroll is verified on-chain, numbered in order. Issued invoices never change.
          </p>
        </div>
        <Button variant="secondary" onClick={onOpenSettings}>Invoice details</Button>
      </div>

      {list.length > 0 && (
        <Card className="flex flex-wrap items-center gap-3 p-4 sm:p-5">
          <label className="flex items-center gap-2 text-sm text-ink-2">
            Period
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="min-h-10 rounded-lg border border-line-strong bg-surface px-2 text-sm text-ink"
            >
              <option value="all">All periods</option>
              {periods.map((p) => (
                <option key={p} value={p}>{periodLabel(p)}</option>
              ))}
            </select>
          </label>
          <span className="flex-1 text-sm text-ink-2">
            {shown.length} {shown.length === 1 ? "invoice" : "invoices"}
          </span>
          <Button
            disabled={!shown.length || busy !== null}
            onClick={() => download("all", shown, `invoices-${period === "all" ? "all" : period}.pdf`)}
          >
            {busy === "all" ? "Creating PDF…" : "Download all as one PDF"}
          </Button>
        </Card>
      )}

      <Card className="overflow-hidden">
        {shown.length > 0 && (
          <div className="hidden grid-cols-[110px_1fr_150px_150px_90px] gap-3 border-b border-line px-5 py-2.5 text-xs font-semibold uppercase tracking-wide text-ink-3 md:grid">
            <span>Number</span>
            <span>Supplier</span>
            <span>Period</span>
            <span className="text-right">Amount</span>
            <span />
          </div>
        )}
        <ul className="divide-y divide-line-soft">
          {shown.map((inv) => (
            <li key={inv.id} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 px-5 py-3 text-sm md:grid-cols-[110px_1fr_150px_150px_90px]">
              <span className="font-mono text-[13px] font-medium">{inv.data.label}</span>
              <span className="order-3 col-span-2 flex min-w-0 flex-col md:order-none md:col-span-1">
                <span className="truncate font-medium">{inv.data.supplier.name}</span>
                <span className="truncate text-[13px] text-ink-2">{inv.data.description}</span>
              </span>
              <span className="order-4 hidden text-ink-2 md:order-none md:block">{periodLabel(inv.data.period)}</span>
              <span className="order-2 flex items-center justify-end gap-2 md:order-none">
                <Badge tone="good">Paid</Badge>
                <span className="tabular whitespace-nowrap font-mono">{formatAmount(inv.data.amount)} {inv.data.token}</span>
              </span>
              <span className="order-5 col-span-2 flex items-center justify-between md:order-none md:col-span-1 md:justify-end">
                <span className="text-[13px] text-ink-2 md:hidden">{payslipDate(inv.issuedAt)}</span>
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => download(inv.id, [inv], invoiceFilename(inv.data))}
                  className="min-h-9 rounded-lg px-2.5 text-[13px] font-medium text-brand hover:bg-brand-soft disabled:opacity-50"
                  aria-label={`Download invoice ${inv.data.label} as PDF`}
                >
                  {busy === inv.id ? "…" : "PDF"}
                </button>
              </span>
            </li>
          ))}
        </ul>
        {invoices.isLoading && (
          <div className="flex flex-col gap-4 p-5" aria-busy="true">
            <Skeleton className="h-4 w-64" />
            <Skeleton className="h-4 w-48" />
          </div>
        )}
        {!invoices.isLoading && list.length === 0 && (
          <div className="flex flex-col items-center gap-2 px-5 py-14 text-center">
            <p className="font-medium">No invoices yet</p>
            <p className="max-w-sm text-sm text-ink-2">
              Run a payroll and each person gets an invoice as soon as the payment is verified. Add your company&apos;s legal name and address in Settings first.
            </p>
          </div>
        )}
      </Card>
    </div>
  );
}
