"use client";

import { useEffect, useRef, useState } from "react";
import { useConnect, type Connector } from "wagmi";
import { friendlyError } from "@/lib/errors";
import { Spinner } from "./ui";

const NOTES: Record<string, string> = {
  coinbaseWalletSDK: "Smart wallet or browser extension",
  walletConnect: "Trust Wallet and other phone wallets, via QR code",
  safe: "Multisig. Open Wagefold from inside the Safe app",
  injected: "Browser extension",
  testWallet: "Built into this demo. Holds test USDC and USDT, no real funds",
};

/** The list of wallets you can connect, shown in a dialog over the landing page. */
export function WalletPicker({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { connectors, connect, isPending, variables, error, reset } = useConnect();
  const [inIframe, setInIframe] = useState(false);
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => setInIframe(window.self !== window.top), []);
  useEffect(() => {
    if (!open) return;
    reset();
    dialog.current?.querySelector<HTMLButtonElement>("button[data-wallet]")?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, reset]);
  if (!open) return null;

  const discovered = connectors.filter((c) => c.type === "injected" && c.id !== "injected");
  const list = connectors.filter((c) => {
    if (c.id === "injected") return discovered.length === 0; // generic fallback only when no wallet announced itself
    if (c.type === "safe") return inIframe;
    return true;
  });
  const pendingId = isPending ? (variables?.connector as Connector | undefined)?.uid : undefined;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/50 p-4 sm:items-center" onClick={onClose} role="presentation">
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="picker-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-[20px] bg-white p-6 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="picker-title" className="text-xl font-semibold">Connect your treasury wallet</h2>
            <p className="mt-1 text-sm leading-relaxed text-ink-2">Payroll is sent from this wallet. You approve every payment.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-10 w-10 flex-none items-center justify-center rounded-full text-ink-3 hover:bg-line-soft hover:text-ink">
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
        </div>
        <div className="mt-5 flex flex-col gap-2.5">
          {list.map((c) => (
            <button
              key={c.uid}
              data-wallet
              type="button"
              onClick={() => connect({ connector: c })}
              disabled={isPending}
              className="flex min-h-16 items-center gap-3.5 rounded-2xl border border-line bg-white px-4 py-2.5 text-left transition-colors hover:border-brand/40 hover:bg-brand-soft/40 disabled:opacity-60"
            >
              <WalletIcon connector={c} />
              <span className="flex flex-1 flex-col gap-0.5">
                <span className="text-base font-semibold">{c.id === "injected" ? "Browser wallet" : c.name}</span>
                <span className="text-[13px] text-ink-2">{NOTES[c.id] ?? NOTES[c.type] ?? NOTES.injected}</span>
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
        <p className="mt-5 text-[13px] text-ink-2">Wagefold never holds your keys or funds. Connecting doesn&apos;t move any money.</p>
      </div>
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
