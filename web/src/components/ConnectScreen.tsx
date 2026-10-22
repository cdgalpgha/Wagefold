"use client";

import { useEffect, useState } from "react";
import { useConnect, type Connector } from "wagmi";
import { friendlyError } from "@/lib/errors";
import { Logo } from "./Logo";
import { Card, Spinner } from "./ui";

const NOTES: Record<string, string> = {
  coinbaseWalletSDK: "Smart wallet or browser extension",
  walletConnect: "Trust Wallet and other phone wallets, via QR code",
  safe: "Multisig. Open Wagefold from inside the Safe app",
  injected: "Browser extension",
};

export function ConnectScreen() {
  const { connectors, connect, isPending, variables, error } = useConnect();
  const [inIframe, setInIframe] = useState(false);
  useEffect(() => setInIframe(window.self !== window.top), []);

  const discovered = connectors.filter((c) => c.type === "injected" && c.id !== "injected");
  const list = connectors.filter((c) => {
    if (c.id === "injected") return discovered.length === 0; // generic fallback only when no wallet announced itself
    if (c.type === "safe") return inIframe;
    return true;
  });
  const pendingId = isPending ? (variables?.connector as Connector | undefined)?.uid : undefined;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-6xl items-center px-6 py-4">
          <Logo className="h-7" />
        </div>
      </header>
      <main className="flex flex-1 justify-center px-6 py-14">
        <Card className="h-fit w-full max-w-[560px] p-9">
          <h1 className="text-[30px] font-semibold tracking-tight">Connect your treasury wallet</h1>
          <p className="mt-2 text-base leading-relaxed text-ink-2">
            Payroll is sent from this wallet. You approve every payment, and Wagefold never holds your keys or funds.
          </p>
          <div className="mt-6 flex flex-col gap-2.5">
            {list.map((c) => (
              <button
                key={c.uid}
                type="button"
                onClick={() => connect({ connector: c })}
                disabled={isPending}
                className="flex min-h-16 items-center gap-3.5 rounded-2xl border border-line bg-white px-4 py-2.5 text-left hover:border-brand/40 disabled:opacity-60"
              >
                <WalletIcon connector={c} />
                <span className="flex flex-1 flex-col gap-0.5">
                  <span className="text-base font-semibold">{c.id === "injected" ? "Browser wallet" : c.name}</span>
                  <span className="text-[13px] text-ink-2">{NOTES[c.type] ?? NOTES[c.id] ?? NOTES.injected}</span>
                </span>
                {pendingId === c.uid ? <Spinner className="text-brand" /> : <Chevron />}
              </button>
            ))}
          </div>
          {error && (
            <p role="alert" className="mt-4 text-sm text-bad-text">
              {/No provider|not found|ProviderNotFound/i.test(error.message)
                ? "No browser wallet found. Install MetaMask or another wallet, or pick a different option."
                : friendlyError(error)}
            </p>
          )}
          <p className="mt-6 text-[13px] text-ink-2">Payroll runs on Base and pays in USDC or USDT.</p>
        </Card>
      </main>
    </div>
  );
}

function WalletIcon({ connector }: { connector: Connector }) {
  if (connector.icon) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={connector.icon} alt="" className="h-10 w-10 rounded-[10px]" />;
  }
  const letter = connector.id === "injected" ? "B" : connector.name.charAt(0);
  return (
    <span className="flex h-10 w-10 flex-none items-center justify-center rounded-[10px] bg-ink text-base font-bold text-white" aria-hidden="true">
      {letter}
    </span>
  );
}

function Chevron() {
  return (
    <svg className="h-[18px] w-[18px] text-ink-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}
