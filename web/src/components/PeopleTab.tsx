"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState, type FormEvent } from "react";
import { useAccount } from "wagmi";
import { api } from "@/lib/api";
import { availableTokens, getChainConfig, type TokenSymbol } from "@/lib/chains";
import { formatAmount, sumByToken, totalsLabel } from "@/lib/money";
import type { Employee } from "@/lib/types";
import { parseEmployeesCsv } from "@/lib/validation";
import { Button, Card, Field, inputClass, shortAddress } from "./ui";

const TONES = ["#DCE4FD", "#E3F1E8", "#FBE9D7", "#EEE3FA", "#E0F0F4", "#F8E1E7"];
type Draft = { name: string; role: string; wallet: string; amount: string; token: TokenSymbol };

export function useEmployees() {
  return useQuery({ queryKey: ["employees"], queryFn: () => api<{ employees: Employee[] }>("/api/employees").then((r) => r.employees) });
}

export function PeopleTab() {
  const { chainId } = useAccount();
  const tokens = availableTokens(getChainConfig(chainId));
  const queryClient = useQueryClient();
  const employees = useEmployees();
  const [editing, setEditing] = useState<Employee | "new" | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: "good" | "bad"; text: string; details?: string[] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const list = employees.data ?? [];
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["employees"] });

  const remove = useMutation({
    mutationFn: (id: string) => api(`/api/employees/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      setConfirmDelete(null);
      refresh();
    },
  });

  async function importCsv(file: File) {
    const { rows, error } = parseEmployeesCsv(await file.text());
    if (error) return setNotice({ kind: "bad", text: error });
    try {
      const res = await api<{ created: Employee[]; errors: { row: number; error: string }[] }>("/api/employees", {
        body: { employees: rows },
      });
      setNotice({
        kind: res.errors.length ? "bad" : "good",
        text: `Imported ${res.created.length} ${res.created.length === 1 ? "person" : "people"}${res.errors.length ? `; ${res.errors.length} rows skipped` : ""}.`,
        details: res.errors.slice(0, 8).map((e) => `Row ${e.row}: ${e.error}`),
      });
    } catch (err) {
      const body = (err as { body?: { errors?: { row: number; error: string }[] } }).body;
      setNotice({
        kind: "bad",
        text: "Nothing was imported.",
        details: body?.errors?.slice(0, 8).map((e) => `Row ${e.row}: ${e.error}`) ?? [(err as Error).message],
      });
    }
    refresh();
  }

  function downloadTemplate() {
    const csv = "name,role,wallet,amount,token\nAda Lovelace,Engineer,0x0000000000000000000000000000000000000001,5000,USDC\n";
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "wagefold-people.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[30px] font-semibold tracking-tight">People</h1>
          <p className="tabular mt-1 text-[15px] text-ink-2">
            {list.length} {list.length === 1 ? "person" : "people"} · {totalsLabel(sumByToken(list))} a month
          </p>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            aria-label="Import a CSV file"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) importCsv(f);
              e.target.value = "";
            }}
          />
          <Button variant="secondary" onClick={() => fileRef.current?.click()}>
            Import CSV
          </Button>
          <Button onClick={() => { setEditing("new"); setNotice(null); }}>
            <PlusIcon /> Add person
          </Button>
        </div>
      </div>

      {notice && (
        <div role="status" className={`rounded-xl px-4 py-3 text-sm ${notice.kind === "good" ? "bg-good-soft text-good" : "bg-bad-soft text-bad-text"}`}>
          <p className="font-medium">{notice.text}</p>
          {notice.details?.length ? (
            <ul className="mt-1 list-disc pl-5">
              {notice.details.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          ) : null}
        </div>
      )}

      {editing && (
        <EmployeeForm
          key={editing === "new" ? "new" : editing.id}
          initial={editing === "new" ? undefined : editing}
          tokens={tokens}
          onCancel={() => setEditing(null)}
          onSaved={(name, isNew) => {
            setEditing(null);
            setNotice({ kind: "good", text: isNew ? `${name} added. They'll be in the next payroll run.` : `${name} updated.` });
            refresh();
          }}
        />
      )}

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-[#FAFBFC] text-left text-xs font-medium text-ink-3">
                <th scope="col" className="border-b border-line px-5 py-3 font-medium">Name</th>
                <th scope="col" className="border-b border-line px-5 py-3 font-medium">Role</th>
                <th scope="col" className="border-b border-line px-5 py-3 font-medium">Wallet address</th>
                <th scope="col" className="border-b border-line px-5 py-3 text-right font-medium">Monthly pay</th>
                <th scope="col" className="border-b border-line px-5 py-3"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {list.map((e, i) => (
                <tr key={e.id} className="text-sm">
                  <td className="whitespace-nowrap border-b border-line-soft px-5 py-3">
                    <span className="flex items-center gap-3">
                      <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full text-xs font-semibold" style={{ background: TONES[i % TONES.length] }} aria-hidden="true">
                        {initials(e.name)}
                      </span>
                      <span className="font-semibold">{e.name}</span>
                    </span>
                  </td>
                  <td className="whitespace-nowrap border-b border-line-soft px-5 py-3 text-ink-2">{e.role || "—"}</td>
                  <td className="whitespace-nowrap border-b border-line-soft px-5 py-3 font-mono text-[13px]" title={e.wallet}>
                    {shortAddress(e.wallet)}
                  </td>
                  <td className="tabular whitespace-nowrap border-b border-line-soft px-5 py-3 text-right font-mono">
                    {formatAmount(e.amount)} {e.token}
                  </td>
                  <td className="whitespace-nowrap border-b border-line-soft px-3 py-1.5 text-right">
                    {confirmDelete === e.id ? (
                      <span className="inline-flex items-center gap-2">
                        <span className="text-[13px] text-ink-2">Remove {e.name.split(" ")[0]}?</span>
                        <Button variant="danger" className="!min-h-9" onClick={() => remove.mutate(e.id)} disabled={remove.isPending}>Remove</Button>
                        <Button variant="secondary" className="!min-h-9" onClick={() => setConfirmDelete(null)}>Keep</Button>
                      </span>
                    ) : (
                      <span className="inline-flex gap-1">
                        <IconButton label={`Edit ${e.name}`} onClick={() => { setEditing(e); setNotice(null); }}>
                          <path d="M4 20h4L19 9l-4-4L4 16zM14 6l4 4" />
                        </IconButton>
                        <IconButton label={`Remove ${e.name}`} onClick={() => setConfirmDelete(e.id)}>
                          <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
                        </IconButton>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {employees.isLoading && <p className="px-5 py-8 text-center text-ink-2">Loading…</p>}
        {!employees.isLoading && list.length === 0 && (
          <div className="flex flex-col items-center gap-3 px-5 py-12 text-center">
            <p className="text-base font-medium">No one here yet</p>
            <p className="max-w-md text-sm text-ink-2">Add each person&apos;s name, role, wallet address and monthly pay, or import a CSV.</p>
            <Button variant="ghost" onClick={downloadTemplate}>Download a CSV template</Button>
          </div>
        )}
      </Card>
    </div>
  );
}

function EmployeeForm({
  initial,
  tokens,
  onCancel,
  onSaved,
}: {
  initial?: Employee;
  tokens: TokenSymbol[];
  onCancel: () => void;
  onSaved: (name: string, isNew: boolean) => void;
}) {
  const [draft, setDraft] = useState<Draft>(
    initial
      ? { name: initial.name, role: initial.role, wallet: initial.wallet, amount: initial.amount, token: initial.token }
      : { name: "", role: "", wallet: "", amount: "", token: tokens[0] ?? "USDC" },
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const set = (k: keyof Draft) => (e: { target: { value: string } }) => {
    setDraft((d) => ({ ...d, [k]: e.target.value }));
    setError(null);
  };
  const tokenOptions = Array.from(new Set([...tokens, draft.token]));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      if (initial) await api(`/api/employees/${initial.id}`, { method: "PATCH", body: draft });
      else await api("/api/employees", { body: draft });
      onSaved(draft.name.trim(), !initial);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="p-5">
      <form onSubmit={submit} aria-labelledby="person-form-h" className="flex flex-col gap-4">
        <h2 id="person-form-h" className="text-base font-semibold">{initial ? `Edit ${initial.name}` : "Add a person"}</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <Field label="Name" className="lg:col-span-2">
            <input className={inputClass} value={draft.name} onChange={set("name")} autoComplete="off" required />
          </Field>
          <Field label="Role" className="lg:col-span-2">
            <input className={inputClass} value={draft.role} onChange={set("role")} autoComplete="off" />
          </Field>
          <Field label="Monthly pay">
            <input className={inputClass} value={draft.amount} onChange={set("amount")} inputMode="decimal" placeholder="5000" required />
          </Field>
          <Field label="Paid in">
            <select className={inputClass} value={draft.token} onChange={set("token")}>
              {tokenOptions.map((t) => (
                <option key={t} value={t}>{t}{tokens.includes(t) ? "" : " (not on this network)"}</option>
              ))}
            </select>
          </Field>
          <Field label="Wallet address (EVM)" className="sm:col-span-2 lg:col-span-6" hint="Double-check it. Payments to a wrong address can't be reversed.">
            <input className={`${inputClass} font-mono text-sm`} value={draft.wallet} onChange={set("wallet")} placeholder="0x…" spellCheck={false} autoComplete="off" required />
          </Field>
        </div>
        {error && <p role="alert" className="text-sm text-bad-text">{error}</p>}
        <div className="flex flex-wrap gap-2.5">
          <Button type="submit" disabled={saving}>{initial ? "Save changes" : "Save person"}</Button>
          <Button variant="secondary" onClick={onCancel}>Cancel</Button>
        </div>
      </form>
    </Card>
  );
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} onClick={onClick} className="flex h-10 w-10 items-center justify-center rounded-lg text-ink-3 hover:bg-line-soft hover:text-ink">
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {children}
      </svg>
    </button>
  );
}

function PlusIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function initials(name: string) {
  return name.split(/\s+/).map((w) => w.charAt(0)).join("").slice(0, 2).toUpperCase();
}
