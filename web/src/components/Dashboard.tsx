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
import { Logo } from "./Logo";
import { NetworkSwitcher } from "./NetworkSwitcher";
import { PayTab } from "./PayTab";
import { PeopleTab } from "./PeopleTab";
import { shortAddress } from "./ui";

type Tab = "pay" | "people" | "history";
const TABS: { id: Tab; label: string }[] = [
  { id: "pay", label: "Pay" },
  { id: "people", label: "People" },
  { id: "history", label: "History" },
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
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-5 px-6 py-2.5">
          <Logo className="h-7" />
          <nav aria-label="Main" className="flex flex-1 gap-1">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                aria-current={tab === t.id ? "page" : undefined}
                className={`min-h-10 rounded-lg px-3.5 text-[15px] font-medium ${
                  tab === t.id ? "bg-brand-soft text-brand-dark" : "text-ink-2 hover:bg-line-soft hover:text-ink"
                }`}
              >
                {t.label}
              </button>
            ))}
          </nav>
          <div className="flex items-center gap-3 rounded-full border border-line py-1.5 pl-3.5 pr-1.5">
            <span className={`h-2 w-2 rounded-full ${cfg ? "bg-good-dot" : "bg-[#E8A33A]"}`} aria-hidden="true" />
            <span className="flex flex-col">
              <span className="text-[13px] font-semibold">
                {connector?.name ?? "Wallet"} · <span className="font-mono font-medium">{shortAddress(me.address)}</span>
              </span>
              <span className="tabular text-xs text-ink-2">
                {cfg
                  ? symbols.map((s) => `${balances[s] === undefined ? "…" : formatAmount(balances[s]!)} ${s}`).join(" · ") +
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
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 pb-16 pt-8">
        {!cfg ? (
          <div className="mx-auto max-w-xl">
            <NetworkSwitcher />
          </div>
        ) : tab === "pay" ? (
          <PayTab onOpenPeople={() => setTab("people")} onOpenHistory={() => setTab("history")} />
        ) : tab === "people" ? (
          <PeopleTab />
        ) : (
          <HistoryTab />
        )}
      </main>
    </div>
  );
}
