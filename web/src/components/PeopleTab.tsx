"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState, type FormEvent } from "react";
import { useAccount } from "wagmi";
import { useSession } from "@/hooks/useSession";
import { api } from "@/lib/api";
import { can } from "@/lib/roles";
import { saveFile } from "@/lib/download";
import { findLookalikes } from "@/lib/lookalike";
import { toCsv } from "@/lib/records";
import { availableTokens, getChainConfig, type TokenSymbol } from "@/lib/chains";
import { formatAmount, sumByToken, totalsLabel } from "@/lib/money";
import type { Employee } from "@/lib/types";
import { parseEmployeesCsv } from "@/lib/validation";
import { copyText, useToast } from "./toast";
import { Button, Card, CopyIcon, Field, inputClass, shortAddress, Skeleton } from "./ui";

// Avatar backgrounds; each is a theme token so they stay soft in light and dark mode.
const TONES = ["bg-tone-1", "bg-tone-2", "bg-tone-3", "bg-tone-4", "bg-tone-5", "bg-tone-6"];
type Draft = { name: string; role: string; wallet: string; amount: string; token: TokenSymbol; email: string; address: string; taxId: string };

export function useEmployees() {
  return useQuery({ queryKey: ["employees"], queryFn: () => api<{ employees: Employee[] }>("/api/employees").then((r) => r.employees) });
}

type Sort = "added" | "name" | "pay";

export function PeopleTab() {
  const { chainId } = useAccount();
  const tokens = availableTokens(getChainConfig(chainId));
  const queryClient = useQueryClient();
  const employees = useEmployees();
  const toast = useToast();
  const [editing, setEditing] = useState<Employee | "new" | null>(null);
  const [notice, setNotice] = useState<{ kind: "good" | "bad"; text: string; details?: string[] } | null>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("added");
  const fileRef = useRef<HTMLInputElement>(null);
  const session = useSession();
  // Viewers see the team but can't change it; the server enforces the same rule.
  const canEdit = can(session.data?.role, "editPeople");
  const all = employees.data ?? [];
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["employees"] });

  const q = query.trim().toLowerCase();
  const list = all
    .map((e, i) => ({ e, tone: TONES[i % TONES.length] }))
    .filter(({ e }) => !q || [e.name, e.role, e.wallet].some((v) => v.toLowerCase().includes(q)))
    .sort((a, b) =>
      sort === "name" ? a.e.name.localeCompare(b.e.name) : sort === "pay" ? Number(b.e.amount) - Number(a.e.amount) : 0,
    );

  const remove = useMutation({
    mutationFn: (e: Employee) => api(`/api/employees/${e.id}`, { method: "DELETE" }).then(() => e),
    onSuccess: (e) => {
      refresh();
      toast(`Removed ${e.name}`, {
        action: {
          label: "Undo",
          run: async () => {
            const { id: _id, ...rest } = e;
            try {
              await api("/api/employees", { body: rest });
              toast(`${e.name} is back`, { tone: "good" });
            } catch (err) {
              toast((err as Error).message, { tone: "bad" });
            }
            refresh();
          },
        },
      });
    },
    onError: (err) => toast((err as Error).message, { tone: "bad" }),
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
    void saveFile(
      "wagefold-people-template.csv",
      toCsv([
        ["name", "role", "wallet", "amount", "token", "email", "address", "tax_id"],
        ["Ada Lovelace", "Engineer", "0x0000000000000000000000000000000000000001", "5000", "USDC", "ada@example.com", "12 Example Road, London", ""],
      ]),
    );
  }

  const actions = (e: Employee) => !canEdit ? null : (
    <span className="inline-flex gap-1">
      <IconButton label={`Edit ${e.name}`} onClick={() => { setEditing(e); setNotice(null); }}>
        <path d="M4 20h4L19 9l-4-4L4 16zM14 6l4 4" />
      </IconButton>
      <IconButton label={`Remove ${e.name}`} onClick={() => remove.mutate(e)}>
        <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
      </IconButton>
    </span>
  );
  const wallet = (e: Employee) => (
    <button
      type="button"
      title={`${e.wallet} (click to copy)`}
      onClick={() => copyText(e.wallet, toast, "Address copied")}
      className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 font-mono text-[13px] text-ink hover:bg-line-soft"
    >
      {shortAddress(e.wallet)} <CopyIcon className="h-3.5 w-3.5 text-ink-3" />
    </button>
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-semibold tracking-tight sm:text-[30px]">People</h1>
          <p className="tabular mt-1 text-[15px] text-ink-2">
            {all.length} {all.length === 1 ? "person" : "people"} · {totalsLabel(sumByToken(all))} a month
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
          {canEdit && (
            <>
              <Button variant="secondary" onClick={() => fileRef.current?.click()}>
                Import CSV
              </Button>
              <Button onClick={() => { setEditing("new"); setNotice(null); }}>
                <PlusIcon /> Add person
              </Button>
            </>
          )}
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
          team={all}
          tokens={tokens}
          onCancel={() => setEditing(null)}
          onSaved={(name, isNew) => {
            setEditing(null);
            toast(isNew ? `${name} added. They'll be in the next payroll run.` : `${name} updated.`, { tone: "good" });
            refresh();
          }}
        />
      )}

      {all.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <label className="relative min-w-0 flex-1 basis-64">
            <span className="sr-only">Search people</span>
            <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, role or wallet" className={`${inputClass} pl-9`} />
          </label>
          <span className="flex items-center gap-2 text-sm text-ink-2">
            <label htmlFor="people-sort">Sort</label>
            <select id="people-sort" value={sort} onChange={(e) => setSort(e.target.value as Sort)} className={`${inputClass} w-auto`}>
              <option value="added">Date added</option>
              <option value="name">Name A–Z</option>
              <option value="pay">Highest pay</option>
            </select>
          </span>
        </div>
      )}

      <Card className="overflow-hidden">
        {/* Phones: one card per person */}
        <ul className="divide-y divide-line-soft sm:hidden">
          {list.map(({ e, tone }) => (
            <li key={e.id} className="flex items-start gap-3 px-4 py-3">
              <Avatar name={e.name} tone={tone} />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="font-semibold">{e.name}</span>
                <span className="text-[13px] text-ink-2">{e.role || "No role"}</span>
                <span className="tabular font-mono text-sm">{formatAmount(e.amount)} {e.token}</span>
                <span className="-ml-2">{wallet(e)}</span>
              </div>
              {actions(e)}
            </li>
          ))}
        </ul>
        {/* Wider screens: a table */}
        <div className="hidden overflow-x-auto sm:block">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-surface-2 text-left text-xs font-medium text-ink-3">
                <th scope="col" className="border-b border-line px-5 py-3 font-medium">Name</th>
                <th scope="col" className="border-b border-line px-5 py-3 font-medium">Role</th>
                <th scope="col" className="border-b border-line px-5 py-3 font-medium">Wallet address</th>
                <th scope="col" className="border-b border-line px-5 py-3 text-right font-medium">Monthly pay</th>
                <th scope="col" className="border-b border-line px-5 py-3"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {list.map(({ e, tone }) => (
                <tr key={e.id} className="text-sm hover:bg-surface-2">
                  <td className="whitespace-nowrap border-b border-line-soft px-5 py-3">
                    <span className="flex items-center gap-3">
                      <Avatar name={e.name} tone={tone} />
                      <span className="font-semibold">{e.name}</span>
                    </span>
                  </td>
                  <td className="whitespace-nowrap border-b border-line-soft px-5 py-3 text-ink-2">{e.role || "—"}</td>
                  <td className="whitespace-nowrap border-b border-line-soft px-3 py-1.5">{wallet(e)}</td>
                  <td className="tabular whitespace-nowrap border-b border-line-soft px-5 py-3 text-right font-mono">
                    {formatAmount(e.amount)} {e.token}
                  </td>
                  <td className="whitespace-nowrap border-b border-line-soft px-3 py-1.5 text-right">{actions(e)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {employees.isLoading && (
          <div className="flex flex-col gap-3 p-5" aria-busy="true">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-8 w-8 rounded-full" />
                <Skeleton className="h-4 w-40" />
                <Skeleton className="ml-auto h-4 w-24" />
              </div>
            ))}
          </div>
        )}
        {!employees.isLoading && all.length > 0 && list.length === 0 && (
          <p className="px-5 py-10 text-center text-sm text-ink-2">No one matches “{query}”.</p>
        )}
        {!employees.isLoading && all.length === 0 && (
          <div className="flex flex-col items-center gap-3 px-5 py-12 text-center">
            <p className="text-base font-medium">No one here yet</p>
            <p className="max-w-md text-sm text-ink-2">Add each person&apos;s name, role, wallet address and monthly pay, or import a CSV.</p>
            <p className="text-[13px] text-ink-2">
              CSV columns: <span className="font-mono">name, role, wallet, amount, token</span>, plus optional <span className="font-mono">email, address, tax_id</span>
            </p>
            <Button variant="ghost" onClick={downloadTemplate}>Download a CSV template</Button>
          </div>
        )}
      </Card>
    </div>
  );
}

function Avatar({ name, tone }: { name: string; tone: string }) {
  return (
    <span className={`flex h-8 w-8 flex-none items-center justify-center rounded-full text-xs font-semibold ${tone}`} aria-hidden="true">
      {initials(name)}
    </span>
  );
}

function EmployeeForm({
  initial,
  team,
  tokens,
  onCancel,
  onSaved,
}: {
  initial?: Employee;
  team: Employee[];
  tokens: TokenSymbol[];
  onCancel: () => void;
  onSaved: (name: string, isNew: boolean) => void;
}) {
  const [draft, setDraft] = useState<Draft>(
    initial
      ? { name: initial.name, role: initial.role, wallet: initial.wallet, amount: initial.amount, token: initial.token, email: initial.email, address: initial.address, taxId: initial.taxId }
      : { name: "", role: "", wallet: "", amount: "", token: tokens[0] ?? "USDC", email: "", address: "", taxId: "" },
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [billingOpen, setBillingOpen] = useState(!!(initial?.email || initial?.address || initial?.taxId));
  const set = (k: keyof Draft) => (e: { target: { value: string } }) => {
    setDraft((d) => ({ ...d, [k]: e.target.value }));
    setError(null);
  };
  const tokenOptions = Array.from(new Set([...tokens, draft.token]));
  const others = team.filter((e) => e.id !== initial?.id);
  const lookalike = findLookalikes([{ wallet: draft.wallet.trim(), name: draft.name }], others)[0];
  const walletChanged = !!initial && draft.wallet.trim().toLowerCase() !== initial.wallet.toLowerCase() && draft.wallet.trim().length === 42;

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
        <div>
          <button
            type="button"
            aria-expanded={billingOpen}
            onClick={() => setBillingOpen((o) => !o)}
            className="inline-flex min-h-9 items-center gap-1.5 text-sm font-medium text-brand"
          >
            <svg className={`h-4 w-4 transition-transform ${billingOpen ? "rotate-90" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
            Invoice details (optional)
          </button>
          {billingOpen && (
            <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Email">
                <input className={inputClass} type="email" value={draft.email} onChange={set("email")} autoComplete="off" maxLength={200} />
              </Field>
              <Field label="Tax ID">
                <input className={inputClass} value={draft.taxId} onChange={set("taxId")} autoComplete="off" maxLength={50} />
              </Field>
              <Field label="Address" className="sm:col-span-2" hint="Printed on their invoices.">
                <textarea className={`${inputClass} min-h-[72px] py-2`} value={draft.address} onChange={set("address")} rows={2} maxLength={300} />
              </Field>
            </div>
          )}
        </div>
        {lookalike && (
          <div role="alert" className="rounded-xl border border-bad-line bg-bad-soft px-4 py-3 text-sm text-bad-text">
            <p className="font-semibold">This address looks like {lookalike.resemblesName}&apos;s wallet, but it&apos;s a different address.</p>
            <p className="mt-1">
              <span className="font-mono">{shortAddress(lookalike.wallet)}</span> vs <span className="font-mono">{shortAddress(lookalike.resembles)}</span>. Scammers
              create addresses with the same first and last characters and plant them in wallet history. Copy addresses only from the person, never from past transactions.
            </p>
          </div>
        )}
        {walletChanged && !lookalike && (
          <p className="rounded-xl bg-warn-soft px-4 py-3 text-sm text-warn">
            <span className="font-semibold">Changing {initial!.name}&apos;s wallet.</span> Confirm the new address with them on a call or in person, not by
            email or chat: a request to change payout details is the most common way payroll gets stolen. The change is logged and flagged at the next payroll.
          </p>
        )}
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
