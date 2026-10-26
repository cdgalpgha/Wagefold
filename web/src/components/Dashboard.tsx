"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useAccount, useDisconnect } from "wagmi";
import { api } from "@/lib/api";
import { getChainConfig } from "@/lib/chains";
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
  const cfg = getChainConfig(chainId);

  async function signOut() {
    await api("/api/auth/logout", { body: {} }).catch(() => undefined);
    queryClient.clear();
    disconnect();
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b border-line bg-surface/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 px-4 sm:px-6">
          <div className="flex min-h-16 items-center gap-4">
            <Logo className="h-[26px]" />
            <OrgSwitcher me={me} />
          </div>
          <nav aria-label="Main" className="order-last -mx-4 flex w-[calc(100%+2rem)] gap-1 overflow-x-auto border-t border-line-soft px-3 sm:order-none sm:mx-0 sm:w-auto sm:flex-1 sm:self-stretch sm:border-0 sm:px-0">
            {TABS.map((t) => {
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  aria-current={active ? "page" : undefined}
                  className={`relative flex min-h-12 flex-none items-center px-3 text-[14px] font-medium transition-colors duration-150 ${
                    active ? "text-ink" : "text-ink-2 hover:text-ink"
                  }`}
                >
                  {t.label}
                  <span
                    aria-hidden="true"
                    className={`absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-ink transition-opacity duration-150 ${active ? "opacity-100" : "opacity-0"}`}
                  />
                </button>
              );
            })}
          </nav>
          <div className="ml-auto flex min-h-16 items-center gap-3">
            <ThemeToggle className="hidden lg:inline-flex" />
            <div
              className="flex items-center gap-2.5 rounded-full border border-line bg-surface py-1 pl-1 pr-1 shadow-card"
              title={`${connector?.name ?? "Wallet"} · ${me.address}`}
            >
              <span className="relative flex-none">
                <WalletAvatar address={me.address} />
                <span
                  className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-surface ${cfg ? "bg-good-dot" : "bg-warn-dot"}`}
                  aria-hidden="true"
                />
              </span>
              <span className="hidden flex-col leading-tight sm:flex">
                <span className="font-mono text-[12.5px] font-medium">{shortAddress(me.address)}</span>
                <span className="text-[11.5px] text-ink-3">
                  {ROLE_LABEL[me.role]} · {cfg ? cfg.chain.name : "Unsupported network"}
                </span>
              </span>
              <button
                type="button"
                onClick={signOut}
                className="min-h-8 rounded-full px-3 text-[12.5px] font-medium text-ink-2 transition-colors hover:bg-line-soft hover:text-ink"
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-20 pt-7 sm:px-6 sm:pt-10">
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
      className="hidden min-h-9 max-w-[200px] rounded-lg border border-line bg-surface px-2 text-sm text-ink shadow-card md:block"
    >
      {me.memberships.map((m) => (
        <option key={m.orgId} value={m.orgId}>
          {m.name} · {ROLE_LABEL[m.role]}
        </option>
      ))}
    </select>
  );
}

/** A colour pair derived from the wallet address, so the same wallet always looks the same. */
function WalletAvatar({ address }: { address: string }) {
  const h1 = parseInt(address.slice(2, 6), 16) % 360;
  const h2 = (h1 + 40 + (parseInt(address.slice(6, 8), 16) % 80)) % 360;
  return (
    <span
      className="block h-7 w-7 rounded-full"
      style={{ background: `linear-gradient(135deg, hsl(${h1} 65% 58%), hsl(${h2} 60% 42%))` }}
      aria-hidden="true"
    />
  );
}
