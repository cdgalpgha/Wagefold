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

  const wallet = (
    <div className="flex items-center gap-2.5" title={`${connector?.name ?? "Wallet"} · ${me.address}`}>
      <span className="relative flex-none">
        <WalletAvatar address={me.address} />
        <span className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-surface ${cfg ? "bg-good-dot" : "bg-warn-dot"}`} aria-hidden="true" />
      </span>
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="font-mono text-[12.5px] font-medium">{shortAddress(me.address)}</span>
        <span className="truncate text-[11.5px] text-ink-3">
          {ROLE_LABEL[me.role]} · {cfg ? cfg.chain.name : "Unsupported network"}
        </span>
      </span>
    </div>
  );
  const signOutButton = (
    <button type="button" onClick={signOut} className="min-h-9 rounded-lg px-3 text-[13px] font-medium text-ink-2 transition-colors hover:bg-line-soft hover:text-ink">
      Sign out
    </button>
  );

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[244px_minmax(0,1fr)]">
      <aside className="hidden border-r border-line bg-surface-2 lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col">
        <div className="flex h-[72px] items-center px-6">
          <Logo className="h-[24px]" />
        </div>
        <div className="mx-3 mb-4 flex flex-col gap-3 rounded-[10px] border border-line bg-surface p-3 shadow-card">
          {wallet}
          <OrgSwitcher me={me} />
        </div>
        <nav aria-label="Main" className="flex flex-col gap-0.5 px-3">
          {TABS.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-10 items-center gap-3 rounded-lg px-3 text-[14px] font-medium transition-colors duration-150 ${
                  active ? "bg-surface text-ink shadow-card ring-1 ring-line" : "text-ink-2 hover:bg-surface/70 hover:text-ink"
                }`}
              >
                <NavIcon id={t.id} className={`h-[18px] w-[18px] ${active ? "text-brand" : "text-ink-3"}`} />
                {t.label}
              </button>
            );
          })}
        </nav>
        <div className="mt-auto flex items-center justify-between gap-2 border-t border-line px-4 py-3">
          <ThemeToggle />
          {signOutButton}
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 border-b border-line bg-surface-2/90 backdrop-blur-md lg:hidden">
          <div className="flex min-h-14 items-center gap-3 px-4 sm:px-6">
            <Logo className="h-[22px]" />
            <div className="ml-auto flex items-center gap-1">
              <WalletAvatar address={me.address} />
              {signOutButton}
            </div>
          </div>
          <nav aria-label="Main" className="flex gap-1 overflow-x-auto px-3 sm:px-5">
            {TABS.map((t) => {
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  aria-current={active ? "page" : undefined}
                  className={`relative flex min-h-11 flex-none items-center px-3 text-[14px] font-medium ${active ? "text-ink" : "text-ink-2"}`}
                >
                  {t.label}
                  <span aria-hidden="true" className={`absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-brand ${active ? "opacity-100" : "opacity-0"}`} />
                </button>
              );
            })}
          </nav>
        </header>
        <main className="mx-auto w-full max-w-[1120px] flex-1 px-4 pb-20 pt-7 sm:px-8 sm:pt-10">
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
      className="min-h-9 w-full rounded-lg border border-line bg-surface px-2 text-sm text-ink shadow-card"
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

const NAV_PATHS: Record<Tab, string[]> = {
  pay: ["M3 7h18v10H3z", "M7 12h.01M17 12h.01", "M12 9.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5z"],
  people: ["M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z", "M2.5 20a6.5 6.5 0 0 1 13 0", "M16 4.5a3.5 3.5 0 0 1 0 7", "M21.5 20a6.5 6.5 0 0 0-4-6"],
  history: ["M3 12a9 9 0 1 0 3-6.7", "M3 4v5h5", "M12 8v4l3 2"],
  invoices: ["M6 3h9l4 4v14H6z", "M14 3v5h5", "M9 13h6M9 17h4"],
  settings: ["M4 7h10M18 7h2M4 17h4M12 17h8", "M16 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM10 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"],
};

function NavIcon({ id, className }: { id: Tab; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {NAV_PATHS[id].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
