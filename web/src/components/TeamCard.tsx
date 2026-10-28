"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { api } from "@/lib/api";
import { ASSIGNABLE_ROLES, can, MAX_APPROVALS, ROLE_HELP, ROLE_LABEL, type AssignableRole } from "@/lib/roles";
import type { Me, Member } from "@/lib/types";
import { useTeam } from "./Approvals";
import { copyText, useToast } from "./toast";
import { Badge, Button, Card, CopyIcon, Field, inputClass, shortAddress } from "./ui";

/** Team members, their roles, and the payroll rule. Only the owner can change any of it. */
export function TeamCard({ me }: { me: Me }) {
  const team = useTeam();
  const queryClient = useQueryClient();
  const toast = useToast();
  const isOwner = can(me.role, "team");
  const members = team.data?.members ?? [];
  const approvers = members.filter((m) => can(m.role, "approve")).length;
  const maxRule = Math.min(MAX_APPROVALS, Math.max(0, approvers - 1));
  const accounts = members.filter((m) => m.role !== "owner" && can(m.role, "prepare")).length;
  const [adding, setAdding] = useState(false);

  const refresh = async () => {
    await Promise.all([queryClient.invalidateQueries({ queryKey: ["team"] }), queryClient.invalidateQueries({ queryKey: ["me"] })]);
    queryClient.invalidateQueries({ queryKey: ["activity"] });
  };
  const run = async (fn: () => Promise<unknown>, done: string) => {
    try {
      await fn();
      await refresh();
      toast(done, { tone: "good" });
    } catch (err) {
      toast((err as Error).message, { tone: "bad" });
    }
  };

  return (
    <Card className="flex flex-col gap-5 p-5 sm:p-6">
      <div>
        <h2 className="text-base font-semibold">Team and signatures</h2>
        <p className="mt-1 text-sm leading-relaxed text-ink-2">
          Everyone signs in with their own wallet. Your accounts team prepares each payroll and signs it; the treasury reviews it and approves it by
          sending. Whoever prepared a payroll can never send or sign it off.
        </p>
      </div>

      <label className={`flex items-start gap-3 rounded-xl border p-4 ${me.org.twoPerson ? "border-brand/40 bg-brand-soft/40" : "border-warn-line bg-warn-soft"}`}>
        <input
          type="checkbox"
          className="mt-0.5 h-5 w-5 flex-none accent-brand"
          checked={me.org.twoPerson}
          disabled={!isOwner}
          onChange={(e) =>
            run(
              () => api("/api/team/policy", { method: "PATCH", body: { twoPerson: e.target.checked } }),
              e.target.checked ? "Two-person payroll is on" : "Two-person payroll is off: the treasury can pay alone",
            )
          }
        />
        <span className="flex-1">
          <span className="block text-sm font-semibold">Two-person payroll (recommended)</span>
          <span className="mt-0.5 block text-[13px] leading-relaxed text-ink-2">
            {me.org.twoPerson
              ? accounts > 0
                ? "On: your accounts team prepares and signs each payroll, and the treasury approves it by sending. Nobody can pay alone."
                : "On: add your accounts team below as a Preparer or Admin. They prepare and sign each payroll; you approve it by sending."
              : "Off: the treasury can prepare and send payroll alone. Turn it on as soon as someone else can prepare payroll."}
          </span>
        </span>
      </label>

      <div className="flex flex-wrap items-center gap-3 rounded-xl bg-surface-2 p-4">
        <div className="flex-1 basis-60">
          <p className="text-sm font-semibold">Extra sign-offs before the treasury</p>
          <p className="mt-0.5 text-[13px] text-ink-2">
            {me.org.approvalsRequired === 0
              ? "None: a signed payroll goes straight to the treasury. Add sign-offs if an admin should also check each one."
              : `${me.org.approvalsRequired} of the ${approvers} people who can sign off (owner and admins) check each payroll before the treasury.`}
            {isOwner && maxRule < 1 && " Add an admin to use extra sign-offs."}
          </p>
        </div>
        <select
          aria-label="Extra sign-offs"
          disabled={!isOwner}
          value={me.org.approvalsRequired}
          onChange={(e) => run(() => api("/api/team/policy", { method: "PATCH", body: { approvalsRequired: Number(e.target.value) } }), "Sign-offs updated")}
          className="min-h-11 rounded-[10px] border border-line-strong bg-surface px-3 text-[15px] text-ink disabled:opacity-70"
        >
          {Array.from({ length: Math.max(maxRule, me.org.approvalsRequired) + 1 }, (_, n) => (
            <option key={n} value={n}>{n === 0 ? "None" : `${n} sign-off${n === 1 ? "" : "s"}`}</option>
          ))}
        </select>
      </div>

      <ul className="divide-y divide-line-soft rounded-xl border border-line">
        {members.map((m) => (
          <MemberRow key={m.address} member={m} me={me} editable={isOwner && m.role !== "owner"} run={run} />
        ))}
      </ul>

      {isOwner &&
        (adding ? (
          <AddMember
            onCancel={() => setAdding(false)}
            onAdd={async (body) => {
              await api("/api/team", { body });
              await refresh();
              setAdding(false);
              toast(`${body.name} can now sign in with their wallet`, { tone: "good" });
            }}
          />
        ) : (
          <div>
            <Button variant="secondary" onClick={() => setAdding(true)}>Add a teammate</Button>
          </div>
        ))}
      {!isOwner && <p className="text-[13px] text-ink-2">Only the owner (the treasury wallet) can change the team or the payroll rule.</p>}

      <dl className="grid gap-2 text-[13px] sm:grid-cols-2">
        {(["owner", ...ASSIGNABLE_ROLES] as const).map((r) => (
          <div key={r} className="flex gap-2">
            <dt className="w-20 flex-none font-semibold">{ROLE_LABEL[r]}</dt>
            <dd className="text-ink-2">{ROLE_HELP[r]}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

function MemberRow({
  member,
  me,
  editable,
  run,
}: {
  member: Member;
  me: Me;
  editable: boolean;
  run: (fn: () => Promise<unknown>, done: string) => Promise<void>;
}) {
  const toast = useToast();
  const you = member.address.toLowerCase() === me.address.toLowerCase();
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 text-sm">
      <span className="flex min-w-0 flex-1 basis-48 flex-col">
        <span className="font-medium">
          {member.name || (member.role === "owner" ? "Treasury" : "Unnamed")} {you && <span className="text-ink-2">(you)</span>}
        </span>
        <button
          type="button"
          onClick={() => copyText(member.address, toast, "Address copied")}
          className="inline-flex items-center gap-1.5 self-start font-mono text-[12px] text-ink-2 hover:text-ink"
          title={member.address}
        >
          {shortAddress(member.address)} <CopyIcon className="h-3 w-3" />
        </button>
      </span>
      {editable ? (
        <>
          <select
            aria-label={`Role for ${member.name || member.address}`}
            value={member.role}
            onChange={(e) =>
              run(() => api(`/api/team/${member.address}`, { method: "PATCH", body: { role: e.target.value } }), `${member.name || "Teammate"} is now ${ROLE_LABEL[e.target.value as AssignableRole]}`)
            }
            className="min-h-10 rounded-lg border border-line-strong bg-surface px-2 text-sm text-ink"
          >
            {ASSIGNABLE_ROLES.map((r) => (
              <option key={r} value={r}>{ROLE_LABEL[r]}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => run(() => api(`/api/team/${member.address}`, { method: "DELETE" }), `${member.name || "Teammate"} removed`)}
            className="min-h-10 rounded-lg px-2 text-[13px] font-medium text-bad hover:bg-bad-soft"
          >
            Remove
          </button>
        </>
      ) : (
        <Badge tone={member.role === "owner" ? "brand" : member.role === "admin" ? "good" : "neutral"}>{ROLE_LABEL[member.role]}</Badge>
      )}
    </li>
  );
}

function AddMember({ onCancel, onAdd }: { onCancel: () => void; onAdd: (body: { name: string; address: string; role: AssignableRole }) => Promise<void> }) {
  const [form, setForm] = useState<{ name: string; address: string; role: AssignableRole }>({ name: "", address: "", role: "admin" });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onAdd({ ...form, name: form.name.trim(), address: form.address.trim() });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <form onSubmit={submit} className="flex flex-col gap-3 rounded-xl border border-line p-4" aria-label="Add a teammate">
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_160px]">
        <Field label="Name">
          <input className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={80} required />
        </Field>
        <Field label="Their wallet address">
          <input className={`${inputClass} font-mono text-sm`} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="0x…" spellCheck={false} required />
        </Field>
        <Field label="Role">
          <select className={inputClass} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as AssignableRole })}>
            {ASSIGNABLE_ROLES.map((r) => (
              <option key={r} value={r}>{ROLE_LABEL[r]}</option>
            ))}
          </select>
        </Field>
      </div>
      <p className="text-[13px] text-ink-2">{ROLE_HELP[form.role]} They sign in at this site with this wallet; no email or password.</p>
      {error && <p role="alert" className="text-sm text-bad-text">{error}</p>}
      <div className="flex flex-wrap gap-2.5">
        <Button type="submit" disabled={saving}>Add teammate</Button>
        <Button variant="secondary" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}
