"use client";

import { useEffect, useState } from "react";
import { answer, subscribe, type WalletPrompt } from "./wallet-bus";
import { chain, resetDemo } from "./mock-api";
import { DEMO_ACCOUNTS, type DemoAccount } from "./sim-chain";

export function DemoBanner() {
  const [confirming, setConfirming] = useState(false);
  const [account, setAccount] = useState<DemoAccount>(chain.active);
  return (
    <div className="bg-night text-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-1 px-6 py-2 text-[13px]">
        <span className="rounded bg-white/15 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide">Demo</span>
        <span className="flex-1 text-white/85">
          Simulated network and test wallet with an example team. No real money moves. Payroll needs one approval: switch to Dana to approve.
        </span>
        <label className="flex items-center gap-2 text-white/85">
          Test wallet account
          <select
            value={account}
            onChange={(e) => {
              const next = e.target.value as DemoAccount;
              setAccount(next);
              chain.switchAccount(next);
            }}
            className="min-h-8 rounded-md border border-white/20 bg-white/10 px-2 font-medium text-white [&>option]:text-ink"
          >
            {(Object.keys(DEMO_ACCOUNTS) as DemoAccount[]).map((k) => (
              <option key={k} value={k}>{DEMO_ACCOUNTS[k].label}</option>
            ))}
          </select>
        </label>
        {confirming ? (
          <span className="flex items-center gap-2">
            <span className="text-white/85">Start over with fresh data?</span>
            <button type="button" className="min-h-8 rounded-md bg-surface px-2.5 font-semibold text-ink" onClick={() => { resetDemo(); window.location.reload(); }}>
              Reset
            </button>
            <button type="button" className="min-h-8 rounded-md px-2 text-white/85 hover:text-white" onClick={() => setConfirming(false)}>
              Cancel
            </button>
          </span>
        ) : (
          <button type="button" className="min-h-8 rounded-md px-2 font-medium text-white/85 underline hover:text-white" onClick={() => setConfirming(true)}>
            Reset demo
          </button>
        )}
      </div>
    </div>
  );
}

/** The test wallet's popup. A real wallet shows the same choice in its own window. */
export function WalletPopup() {
  const [prompt, setPrompt] = useState<WalletPrompt | null>(null);
  useEffect(() => subscribe(setPrompt), []);
  if (!prompt) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-night/40 p-4 sm:items-start sm:justify-end sm:p-6" role="presentation">
      <div role="dialog" aria-modal="true" aria-labelledby="wallet-title" className="w-full max-w-sm overflow-hidden rounded-2xl bg-surface shadow-2xl">
        <div className="flex items-center gap-2.5 border-b border-line bg-canvas px-4 py-3">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-night text-white" aria-hidden="true">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7a2 2 0 0 1 2-2h13v4" /><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M16 13.5h2" /></svg>
          </span>
          <span className="flex-1 text-sm font-semibold">Test Wallet</span>
          <span className="text-xs text-ink-2">Demo network</span>
        </div>
        <div className="flex flex-col gap-4 p-5">
          <div>
            <p className="text-xs font-medium text-ink-2">Request from Wagefold</p>
            <h2 id="wallet-title" className="mt-1 text-lg font-semibold">{prompt.title}</h2>
          </div>
          <dl className="flex flex-col gap-2 rounded-xl border border-line p-3">
            {prompt.lines.map((l) => (
              <div key={l.label} className="flex flex-col gap-0.5">
                <dt className="text-xs text-ink-2">{l.label}</dt>
                <dd className={`text-sm font-medium ${prompt.kind === "sign" ? "max-h-40 overflow-y-auto whitespace-pre-wrap break-words font-mono text-xs font-normal" : "tabular"}`}>{l.value}</dd>
              </div>
            ))}
          </dl>
          {prompt.note && <p className="text-[13px] leading-relaxed text-ink-2">{prompt.note}</p>}
          <div className="grid grid-cols-2 gap-2.5">
            <button type="button" onClick={() => answer(false)} className="min-h-11 rounded-xl border border-line-strong bg-surface text-sm font-semibold hover:border-ink-3">
              Reject
            </button>
            <button type="button" autoFocus onClick={() => answer(true)} className="min-h-11 rounded-xl bg-brand-solid text-sm font-semibold text-white hover:bg-brand-hover">
              {prompt.confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
