"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useAccount, useWalletClient } from "wagmi";
import { api } from "@/lib/api";
import { LIVE_SLOW } from "@/lib/live";
import type { Me, TreasuryTransfer } from "@/lib/types";
import { useToast } from "./toast";
import { Button, Card, Field, inputClass, shortAddress } from "./ui";

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/**
 * Moving the company to a new treasury wallet. The treasury proposes the address; nothing changes
 * until that wallet signs in and accepts with its own signature.
 */
export function TreasuryMove({ me }: { me: Me }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const isTreasury = me.address.toLowerCase() === me.org.ownerAddress.toLowerCase();
  const pending = useQuery({
    queryKey: ["treasury-transfer"],
    queryFn: () => api<{ transfer: TreasuryTransfer | null }>("/api/team/treasury").then((r) => r.transfer),
    ...LIVE_SLOW,
  });
  const [open, setOpen] = useState(false);
  const [address, setAddress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["treasury-transfer"] });
    queryClient.invalidateQueries({ queryKey: ["activity"] });
  };

  async function propose(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api("/api/team/treasury", { body: { address: address.trim() } });
      setOpen(false);
      setAddress("");
      refresh();
      toast("Proposed. The new wallet signs in here and accepts.", { tone: "good" });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function cancel() {
    try {
      await api("/api/team/treasury", { method: "DELETE" });
      refresh();
      toast("Treasury change cancelled", { tone: "good" });
    } catch (err) {
      toast((err as Error).message, { tone: "bad" });
    }
  }

  const t = pending.data;
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-line p-4">
      <div>
        <p className="text-sm font-semibold">Treasury wallet</p>
        <p className="mt-0.5 text-[13px] leading-relaxed text-ink-2">
          Payroll is paid from <span className="font-mono text-ink">{shortAddress(me.org.ownerAddress)}</span>. Moving to a new wallet takes two
          signatures: you propose it, then the new wallet signs in and accepts. The old treasury then leaves the team and is signed out everywhere.
        </p>
      </div>
      {t ? (
        <div role="status" className="flex flex-wrap items-center gap-3 rounded-lg bg-warn-soft px-3 py-2.5 text-[13px]">
          <span className="flex-1 basis-60">
            Waiting for <span className="font-mono font-medium">{shortAddress(t.to)}</span> to sign in and accept · open until {when(t.expiresAt)}
          </span>
          {isTreasury && (
            <button type="button" onClick={cancel} className="min-h-9 rounded-lg px-2 font-medium text-bad hover:bg-bad-soft">
              Cancel
            </button>
          )}
        </div>
      ) : isTreasury ? (
        open ? (
          <form onSubmit={propose} className="flex flex-col gap-3" aria-label="Move the treasury">
            <Field label="New treasury wallet address" hint="A wallet you control, or your company's Safe. It must not already run another company here.">
              <input className={`${inputClass} font-mono text-sm`} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="0x…" spellCheck={false} required />
            </Field>
            {error && <p role="alert" className="text-sm text-bad-text">{error}</p>}
            <div className="flex flex-wrap gap-2.5">
              <Button type="submit" disabled={saving}>Propose new treasury</Button>
              <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            </div>
          </form>
        ) : (
          <div>
            <Button variant="secondary" onClick={() => setOpen(true)}>Move to a new treasury wallet</Button>
          </div>
        )
      ) : null}
    </div>
  );
}

/** Shown to a wallet that a company asked to become its treasury: accept with a signature. */
export function TreasuryInvites() {
  const { address } = useAccount();
  const { data: walletClient } = useWalletClient();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const invites = useQuery({
    queryKey: ["treasury-invites"],
    queryFn: () => api<{ transfers: TreasuryTransfer[] }>("/api/treasury/transfers").then((r) => r.transfers),
    ...LIVE_SLOW,
  });
  if (!invites.data?.length) return null;

  async function accept(t: TreasuryTransfer) {
    setBusy(t.id);
    try {
      if (!walletClient || !address) throw new Error("Reconnect your wallet and try again.");
      const { message } = await api<{ message: string }>(`/api/treasury/transfers/${t.id}`);
      const signature = await walletClient.signMessage({ account: address, message });
      await api(`/api/treasury/transfers/${t.id}`, { body: { signature } });
      queryClient.clear();
      await queryClient.invalidateQueries();
      toast(`You're now the treasury of ${t.company}`, { tone: "good" });
    } catch (err) {
      toast((err as Error).message.replace(/^.*User (rejected|denied).*$/s, "Cancelled in your wallet."), { tone: "bad" });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mb-6 flex flex-col gap-3">
      {invites.data.map((t) => (
        <Card key={t.id} className="flex flex-wrap items-center gap-4 border-brand/50 p-5 ring-1 ring-brand/30">
          <div className="flex-1 basis-72">
            <p className="text-base font-semibold">{t.company} wants this wallet as its treasury</p>
            <p className="mt-1 text-[13px] leading-relaxed text-ink-2">
              Proposed by the current treasury {shortAddress(t.from)}. If you accept, this company&apos;s payroll is paid from this wallet and only
              this wallet can send it. Open until {when(t.expiresAt)}.
            </p>
          </div>
          <Button onClick={() => accept(t)} disabled={busy !== null}>{busy === t.id ? "Waiting for your wallet…" : "Accept with a signature"}</Button>
        </Card>
      ))}
    </div>
  );
}
