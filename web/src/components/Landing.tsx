"use client";

import { useState } from "react";
import { Logo, LogoMark } from "./Logo";
import { WalletPicker } from "./WalletPicker";

const STEPS = [
  {
    title: "Connect your treasury wallet",
    body: "MetaMask, Coinbase Wallet, Trust Wallet or a Safe multisig. You sign in with a signature: no gas, and no money moves.",
  },
  {
    title: "Add your team once",
    body: "Name, role, wallet address and monthly pay. Type them in or import a CSV. Typos in wallet addresses are caught before they cost you.",
  },
  {
    title: "Review and sign once",
    body: "On payday Wagefold shows only what changed since last time, then pays everyone in one transaction and checks the result on-chain.",
  },
];

const SAFEGUARDS = [
  { title: "Wallet changes need your OK", body: "A changed or never-paid address is flagged, and you confirm it before any money moves." },
  { title: "All or nothing", body: "If one payment would fail, none go out. Payroll is never half paid." },
  { title: "Checked on-chain", body: "A run is marked paid only when the chain shows every person got exactly the right amount." },
  { title: "You keep custody", body: "Wagefold can't move your funds. Only your wallet can sign a payment." },
  { title: "Exact approvals", body: "The payroll contract is allowed this run's total and nothing more." },
  { title: "A record you can share", body: "Every payment links to its transaction, so “did I get paid?” takes seconds to answer." },
];

const FAQ = [
  { q: "Which network and tokens?", a: "Base, with USDC and USDT. Network fees for a whole payroll run are a few cents." },
  { q: "Do employees need an account?", a: "No. They only need a wallet address that can receive USDC or USDT on Base." },
  { q: "Can people be paid to a bank account?", a: "Not today. Wagefold pays crypto wallets directly." },
  { q: "How many people can one run pay?", a: "Up to 500 people in a single transaction." },
  {
    q: "Is the payroll contract audited?",
    a: "Not yet. It is small, has no owner or upgrade path, and only moves funds from the wallet that calls it. An external audit comes before handling real payroll.",
  },
];

const PREVIEW = [
  { name: "Priya Nair", amount: "9,400.00", token: "USDC" },
  { name: "Maya Chen", amount: "12,500.00", token: "USDC" },
  { name: "Tunde Bakare", amount: "9,000.00", token: "USDC" },
  { name: "Lucía Gómez", amount: "6,900.00", token: "USDT" },
  { name: "Aisha Rahman", amount: "5,600.00", token: "USDT" },
];

export function Landing() {
  const [picking, setPicking] = useState(false);
  const connect = () => setPicking(true);

  return (
    <div className="min-h-screen bg-white">
      <header className="sticky top-0 z-30 border-b border-line bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-[max(16px,env(safe-area-inset-left))] py-3 sm:px-6">
          <Logo className="h-7" />
          <nav aria-label="Sections" className="hidden flex-1 gap-1 text-sm font-medium text-ink-2 md:flex">
            <a href="#how" className="rounded-lg px-3 py-2 hover:bg-line-soft hover:text-ink">How it works</a>
            <a href="#safety" className="rounded-lg px-3 py-2 hover:bg-line-soft hover:text-ink">Safety</a>
            <a href="#faq" className="rounded-lg px-3 py-2 hover:bg-line-soft hover:text-ink">FAQ</a>
          </nav>
          <button type="button" onClick={connect} className="ml-auto min-h-11 rounded-xl bg-brand px-4 text-sm font-semibold text-white hover:bg-brand-dark md:ml-0">
            Connect wallet
          </button>
        </div>
      </header>

      <main>
        <section className="bg-canvas">
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-[max(16px,env(safe-area-inset-left))] py-16 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:py-24">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.08em] text-brand">Crypto payroll on Base</p>
              <h1 className="mt-4 text-balance text-[44px] font-semibold leading-[1.05] tracking-tight sm:text-[56px]">
                Pay your whole team in one transaction.
              </h1>
              <p className="mt-5 max-w-[56ch] text-lg leading-relaxed text-ink-2">
                Keep your team in one list. On payday, Wagefold pulls every name, wallet and amount, and pays everyone in USDC or USDT from
                your treasury wallet with a single signature.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <button type="button" onClick={connect} className="inline-flex min-h-14 items-center gap-2 rounded-xl bg-brand px-7 text-[17px] font-semibold text-white hover:bg-brand-dark">
                  Connect wallet
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                </button>
                <a href="#how" className="inline-flex min-h-14 items-center rounded-xl px-5 text-[17px] font-semibold text-ink hover:bg-white">
                  How it works
                </a>
              </div>
              <p className="mt-5 text-sm text-ink-2">Non-custodial. You approve every payment from your own wallet.</p>
            </div>
            <FoldPreview />
          </div>
        </section>

        <section aria-label="At a glance" className="border-y border-line">
          <dl className="mx-auto grid max-w-6xl grid-cols-2 gap-y-6 px-[max(16px,env(safe-area-inset-left))] py-8 sm:px-6 md:grid-cols-4">
            {[
              ["1 signature", "pays the whole team"],
              ["500 people", "per transaction"],
              ["USDC + USDT", "on Base"],
              ["0 custody", "your keys, your funds"],
            ].map(([k, v]) => (
              <div key={k} className="flex flex-col gap-1 px-2">
                <dt className="text-2xl font-semibold tracking-tight">{k}</dt>
                <dd className="text-sm text-ink-2">{v}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section id="how" className="scroll-mt-20">
          <div className="mx-auto max-w-6xl px-[max(16px,env(safe-area-inset-left))] py-20 sm:px-6">
            <h2 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">Payday in three steps</h2>
            <ol className="mt-10 grid gap-6 md:grid-cols-3">
              {STEPS.map((s, i) => (
                <li key={s.title} className="flex flex-col gap-3 rounded-2xl border border-line p-6">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-soft text-sm font-semibold text-brand-dark">{i + 1}</span>
                  <h3 className="text-lg font-semibold">{s.title}</h3>
                  <p className="text-[15px] leading-relaxed text-ink-2">{s.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="safety" className="scroll-mt-20 bg-canvas">
          <div className="mx-auto max-w-6xl px-[max(16px,env(safe-area-inset-left))] py-20 sm:px-6">
            <h2 className="max-w-2xl text-balance text-3xl font-semibold tracking-tight sm:text-4xl">Built for the moments payroll goes wrong</h2>
            <p className="mt-3 max-w-[60ch] text-lg text-ink-2">Crypto payments can&apos;t be reversed, so the safeguards sit before the signature, not after.</p>
            <div className="mt-10 grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
              {SAFEGUARDS.map((f) => (
                <div key={f.title} className="flex gap-3">
                  <span className="mt-0.5 flex h-7 w-7 flex-none items-center justify-center rounded-full bg-good-soft text-good" aria-hidden="true">
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="m5 12 5 5 9-10" /></svg>
                  </span>
                  <div>
                    <h3 className="font-semibold">{f.title}</h3>
                    <p className="mt-1 text-[15px] leading-relaxed text-ink-2">{f.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="faq" className="scroll-mt-20">
          <div className="mx-auto max-w-3xl px-[max(16px,env(safe-area-inset-left))] py-20 sm:px-6">
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Questions</h2>
            <div className="mt-8 divide-y divide-line border-y border-line">
              {FAQ.map((f) => (
                <details key={f.q} className="group py-4">
                  <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 text-[17px] font-medium">
                    {f.q}
                    <svg className="h-5 w-5 flex-none text-ink-3 transition-transform group-open:rotate-45" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
                  </summary>
                  <p className="mt-2 text-[15px] leading-relaxed text-ink-2">{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-ink text-white">
          <div className="mx-auto flex max-w-6xl flex-col items-start gap-6 px-[max(16px,env(safe-area-inset-left))] py-16 sm:px-6 md:flex-row md:items-center md:justify-between">
            <h2 className="max-w-xl text-balance text-3xl font-semibold tracking-tight">Run your next payroll with one signature.</h2>
            <button type="button" onClick={connect} className="min-h-14 rounded-xl bg-white px-7 text-[17px] font-semibold text-ink hover:bg-brand-soft">
              Connect wallet
            </button>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-[max(16px,env(safe-area-inset-left))] py-8 text-sm text-ink-2 sm:px-6">
          <LogoMark className="h-6 w-6" />
          <span>© 2026 Wagefold</span>
          <span className="ml-auto">Payments are final once sent. Check addresses before you sign.</span>
        </div>
      </footer>

      <WalletPicker open={picking} onClose={() => setPicking(false)} />
    </div>
  );
}

/** One treasury wallet fanning out to the whole team: the product in a picture. */
function FoldPreview() {
  const rows = PREVIEW.length;
  const rowGap = 64;
  const top = 32;
  const height = top * 2 + rowGap * (rows - 1);
  return (
    <figure className="rounded-[24px] border border-line bg-white p-5 shadow-[0_24px_60px_-30px_rgba(14,20,32,0.35)] sm:p-6">
      <div className="flex items-center justify-between gap-3 border-b border-line-soft pb-4">
        <div>
          <p className="text-xs font-medium text-ink-2">October payroll</p>
          <p className="tabular mt-0.5 font-mono text-lg font-medium">30,900 USDC + 12,500 USDT</p>
        </div>
        <span className="rounded-full bg-good-soft px-2.5 py-1 text-xs font-semibold text-good">1 transaction</span>
      </div>
      <div className="relative mt-4 grid grid-cols-[88px_1fr] gap-0 sm:grid-cols-[120px_1fr]">
        <div className="relative">
          <svg className="absolute inset-0 h-full w-full" viewBox={`0 0 120 ${height}`} preserveAspectRatio="none" aria-hidden="true">
            {PREVIEW.map((_, i) => {
              const y = top + i * rowGap;
              const mid = height / 2;
              return <path key={i} d={`M 34 ${mid} C 80 ${mid}, 70 ${y}, 120 ${y}`} fill="none" stroke="#2647D9" strokeOpacity={0.35} strokeWidth="2" vectorEffect="non-scaling-stroke" />;
            })}
          </svg>
          <div className="absolute left-0 top-1/2 flex -translate-y-1/2 flex-col items-center gap-1">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-ink text-white">
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h13v4" /><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M16 13.5h2" /></svg>
            </span>
            <span className="text-[11px] font-medium text-ink-2">Treasury</span>
          </div>
        </div>
        <ul className="flex flex-col" style={{ gap: rowGap - 48, paddingBlock: top - 24 }}>
          {PREVIEW.map((p) => (
            <li key={p.name} className="flex h-12 items-center gap-3 rounded-xl border border-line px-3">
              <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-good-soft text-good" aria-hidden="true">
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="m5 12 5 5 9-10" /></svg>
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{p.name}</span>
              <span className="tabular whitespace-nowrap font-mono text-[13px]">
                {p.amount} <span className="text-ink-2">{p.token}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
      <figcaption className="mt-4 text-xs text-ink-2">Example team. Every payment is checked on-chain after it lands.</figcaption>
    </figure>
  );
}
