"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useAccount, useDisconnect } from "wagmi";
import { useTreasury } from "@/hooks/useTreasury";
import { api } from "@/lib/api";
import { getChainConfig } from "@/lib/chains";
import { formatAmount } from "@/lib/money";
import type { Me } from "@/lib/types";
import { HistoryTab } from "./HistoryTab";
import { InvoicesTab } from "./InvoicesTab";
import { Logo } from "./Logo";
import { NetworkSwitcher } from "./NetworkSwitcher";
import { PayTab } from "./PayTab";
import { PeopleTab } from "./PeopleTab";
import { SettingsTab } from "./SettingsTab";
import { ThemeToggle } from "./ThemeToggle";
import { ROLE_LABEL } from "@/lib/roles";
import { shortAddress } from "./ui";

type Tab = "pay" | "people" | "history" | "invoices" | "settings";
const TABS: { id: Tab; label: string }[] = [
  { id: "pay", label: "Pay" },
  { id: "people", label: "People" },
  { id: "history", label: "History" },
  { id: "invoices", label: "Invoices" },
  { id: "settings", label: "Settings" },
];

export function Dashboard({ me }: { me: Me }) {
  const [tab, setTab] = useState<Tab>("pay");
  const { chainId, connector } = useAccount();
  const { disconnect } = useDisconnect();
  const queryClient = useQueryClient();
  const { balances, symbols } = useTreasury();
  const cfg = getChainConfig(chainId);

  async function signOut() {
    await api("/api/auth/logout", { body: {} }).catch(() => undefined);
    queryClient.clear();
    disconnect();
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-5 gap-y-2 px-4 py-2.5 sm:px-6">
          <Logo className="h-7" />
          <OrgSwitcher me={me} />
          <nav aria-label="Main" className="order-last -mx-1 flex w-[calc(100%+0.5rem)] gap-1 overflow-x-auto px-1 sm:order-none sm:mx-0 sm:w-auto sm:flex-1 sm:px-0">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                aria-current={tab === t.id ? "page" : undefined}
                className={`min-h-10 flex-none rounded-lg px-3 text-[15px] font-medium sm:px-3.5 ${
                  tab === t.id ? "bg-brand-soft text-brand-dark" : "text-ink-2 hover:bg-line-soft hover:text-ink"
                }`}
              >
                {t.label}
              </button>
            ))}
          </nav>
          <ThemeToggle className="ml-auto hidden min-[1400px]:inline-flex" />
          <div className="ml-auto flex items-center gap-3 rounded-full border border-line py-1.5 pl-3.5 pr-1.5 min-[1400px]:ml-0">
            <span className={`h-2 w-2 rounded-full ${cfg ? "bg-good-dot" : "bg-warn-dot"}`} aria-hidden="true" />
            <span className="flex flex-col">
              <span className="text-[13px] font-semibold">
                {connector?.name ?? "Wallet"} · <span className="font-mono font-medium">{shortAddress(me.address)}</span>
                <span className="ml-1.5 rounded-full bg-brand-soft px-1.5 py-px text-[11px] font-semibold text-brand-dark">{ROLE_LABEL[me.role]}</span>
              </span>
              <span className="tabular hidden text-xs text-ink-2 sm:block">
                {cfg
                  ? (me.role === "owner" ? "" : "Treasury ") +
                    symbols.map((s) => `${balances[s] === undefined ? "…" : formatAmount(balances[s]!)} ${s}`).join(" · ") +
                    ` on ${cfg.chain.name}`
                  : "Unsupported network"}
              </span>
            </span>
            <button type="button" onClick={signOut} className="min-h-9 rounded-full bg-line-soft px-3 text-[13px] hover:bg-line">
              Sign out
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-16 pt-6 sm:px-6 sm:pt-8">
        {!cfg ? (
          <div className="mx-auto max-w-xl">
            <NetworkSwitcher />
          </div>
        ) : tab === "pay" ? (
          <PayTab onOpenPeople={() => setTab("people")} onOpenHistory={() => setTab("history")} onOpenSettings={() => setTab("settings")} />
        ) : tab === "people" ? (
          <PeopleTab />
        ) : tab === "history" ? (
          <HistoryTab me={me} />
        ) : tab === "invoices" ? (
          <InvoicesTab onOpenSettings={() => setTab("settings")} />
        ) : (
          <SettingsTab me={me} />
        )}
      </main>
    </div>
  );
}

/** For wallets on more than one company's team: switch between them. Membership is checked by the server. */
function OrgSwitcher({ me }: { me: Me }) {
  const queryClient = useQueryClient();
  if (me.memberships.length < 2) return null;
  return (
    <select
      aria-label="Company"
      value={me.org.id}
      onChange={async (e) => {
        await api("/api/session/switch", { body: { orgId: e.target.value } }).catch(() => undefined);
        queryClient.clear();
        await queryClient.invalidateQueries();
      }}
      className="hidden min-h-9 max-w-[200px] rounded-lg border border-line bg-surface px-2 text-sm text-ink md:block"
    >
      {me.memberships.map((m) => (
        <option key={m.orgId} value={m.orgId}>
          {m.name} · {ROLE_LABEL[m.role]}
        </option>
      ))}
    </select>
  );
}
