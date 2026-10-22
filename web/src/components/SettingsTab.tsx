"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { api } from "@/lib/api";
import { canSave, saveFile, type SaveResult } from "@/lib/download";
import { paymentsCsv, toCsv } from "@/lib/records";
import { isPayDay, LAST_DAY, payDayIcs, payDayLabel } from "@/lib/schedule";
import type { Employee, Me, Org, Records } from "@/lib/types";
import { useToast } from "./toast";
import { Button, Card, Field, inputClass } from "./ui";

const DAYS = [...Array.from({ length: 28 }, (_, i) => i + 1), LAST_DAY];

export function SettingsTab({ me }: { me: Me }) {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-[28px] font-semibold tracking-tight sm:text-[30px]">Settings</h1>
        <p className="mt-1 text-[15px] text-ink-2">Company details, your payday, and a copy of all your data.</p>
      </div>
      <CompanyForm key={`${me.org.name}-${me.org.payDay}`} org={me.org} />
      <DataExport org={me.org} />
    </div>
  );
}

function useSaveToast() {
  const toast = useToast();
  return (result: SaveResult, what: string) => {
    if (result === "saved") toast(`${what} downloaded`, { tone: "good" });
    else if (result === "unavailable") toast("Downloads aren't available here.", { tone: "bad" });
  };
}

function CompanyForm({ org }: { org: Org }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const saved = useSaveToast();
  const [name, setName] = useState(org.name);
  const [payDay, setPayDay] = useState<string>(org.payDay === null ? "" : String(org.payDay));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const dirty = name.trim() !== org.name || payDay !== (org.payDay === null ? "" : String(org.payDay));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const day = payDay === "" ? null : Number(payDay);
      await api<{ org: Org }>("/api/me", { method: "PATCH", body: { name: name.trim(), payDay: day } });
      await queryClient.invalidateQueries({ queryKey: ["me"] });
      queryClient.invalidateQueries({ queryKey: ["activity"] });
      toast("Settings saved", { tone: "good" });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const ics = "wagefold-payday.ics";
  return (
    <Card className="p-5 sm:p-6">
      <form onSubmit={submit} className="flex flex-col gap-4" aria-labelledby="company-h">
        <h2 id="company-h" className="text-base font-semibold">Company</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Company name" hint="Shown on payslips.">
            <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required />
          </Field>
          <Field label="Payday" hint="Wagefold reminds you; it never sends money on its own.">
            <select className={inputClass} value={payDay} onChange={(e) => setPayDay(e.target.value)}>
              <option value="">Not set</option>
              {DAYS.map((d) => (
                <option key={d} value={d}>{payDayLabel(d)}</option>
              ))}
            </select>
          </Field>
        </div>
        {error && <p role="alert" className="text-sm text-bad-text">{error}</p>}
        <div className="flex flex-wrap items-center gap-2.5">
          <Button type="submit" disabled={saving || !dirty || !name.trim()}>Save</Button>
          {isPayDay(org.payDay) && canSave(ics) && (
            <Button
              variant="secondary"
              onClick={async () => saved(await saveFile(ics, payDayIcs(org.payDay!, org.name, new Date(), org.id)), "Calendar reminder")}
            >
              Add payday to my calendar
            </Button>
          )}
        </div>
      </form>
    </Card>
  );
}

function DataExport({ org }: { org: Org }) {
  const saved = useSaveToast();
  const people = useQuery({ queryKey: ["employees"], queryFn: () => api<{ employees: Employee[] }>("/api/employees").then((r) => r.employees) });
  const [busy, setBusy] = useState(false);

  async function exportPeople() {
    const rows = [["name", "role", "wallet", "amount", "token"], ...(people.data ?? []).map((e) => [e.name, e.role, e.wallet, e.amount, e.token])];
    saved(await saveFile("wagefold-people.csv", toCsv(rows)), "People");
  }

  async function exportPayments() {
    setBusy(true);
    try {
      const records = await api<Records>("/api/records");
      saved(await saveFile("wagefold-all-payments.csv", paymentsCsv(records.runs, org.ownerAddress)), "Payment history");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="flex flex-col gap-4 p-5 sm:p-6">
      <div>
        <h2 className="text-base font-semibold">Your data</h2>
        <p className="mt-1 text-sm leading-relaxed text-ink-2">
          Take everything with you at any time. People exports in the same format Wagefold imports, and every payment is on-chain, so your records
          don&apos;t depend on Wagefold staying around.
        </p>
      </div>
      <div className="flex flex-wrap gap-2.5">
        <Button variant="secondary" onClick={exportPeople} disabled={!people.data}>Download people (CSV)</Button>
        <Button variant="secondary" onClick={exportPayments} disabled={busy}>Download all payments (CSV)</Button>
      </div>
    </Card>
  );
}
