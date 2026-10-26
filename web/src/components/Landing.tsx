"use client";

import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { BRAND_LOGOS, type BrandLogo } from "./brand-logos";
import { Logo, LogoMark } from "./Logo";
import { ThemeToggle } from "./ThemeToggle";
import { WalletPicker } from "./WalletPicker";

const WALLETS: { key: BrandLogo; note: string }[] = [
  { key: "metamask", note: "Browser extension" },
  { key: "walletconnect", note: "Any phone wallet, by QR code" },
  { key: "trust", note: "Via WalletConnect" },
  { key: "coinbase-wallet", note: "Smart wallet or extension" },
  { key: "safe", note: "Multisig treasuries" },
];

const STEPS = [
  {
    title: "Connect your treasury wallet",
    body: "MetaMask, Coinbase Wallet, Trust Wallet or a Safe multisig. You sign in with a signature: no gas, and no money moves.",
    icon: <path d="M3 7a2 2 0 0 1 2-2h13v4M3 7v11a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9H5a2 2 0 0 1-2-2zM16 14h2" />,
  },
  {
    title: "Add your team once",
    body: "Name, role, wallet address and monthly pay. Type them in or import a CSV. Typos in wallet addresses are caught before they cost you.",
    icon: <path d="M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21a7 7 0 0 1 14 0M17 3.5a4 4 0 0 1 0 7.5M19 14a6 6 0 0 1 3 7" />,
  },
  {
    title: "Review and sign once",
    body: "On payday Wagefold shows only what changed since last time, then pays everyone in one transaction and checks the result on-chain.",
    icon: <path d="m5 12 4 4 10-10M4 20h16" />,
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

const PIPELINE = [
  { title: "People", body: "Name, wallet and pay for everyone" },
  { title: "Snapshot", body: "Frozen for this run, edits can't sneak in" },
  { title: "Checks", body: "Balance, addresses and what changed" },
  { title: "One signature", body: "Your wallet approves the whole run" },
  { title: "Verified", body: "Every transfer matched on Base" },
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
  { name: "Priya Nair", amount: "9,400.00", token: "usdc" as const },
  { name: "Maya Chen", amount: "12,500.00", token: "usdc" as const },
  { name: "Tunde Bakare", amount: "9,000.00", token: "usdc" as const },
  { name: "Lucía Gómez", amount: "6,900.00", token: "usdt" as const },
  { name: "Aisha Rahman", amount: "5,600.00", token: "usdt" as const },
];

// Measured in contracts/test/WagefoldPayroll.test.ts: 100 new recipients, test stablecoin.
const GAS = { separate: 5_156_164, wagefold: 3_086_659 };

const gutter = "px-[max(16px,env(safe-area-inset-left))] sm:px-6";

export function Landing() {
  const [picking, setPicking] = useState(false);
  const connect = () => setPicking(true);

  return (
    <div className="min-h-screen overflow-x-hidden bg-surface">
      <header className="sticky top-0 z-30 border-b border-line bg-surface/90 backdrop-blur">
        <div className={`mx-auto flex max-w-6xl items-center gap-6 py-3 ${gutter}`}>
          <Logo className="h-7" />
          <nav aria-label="Sections" className="hidden flex-1 gap-1 text-sm font-medium text-ink-2 md:flex">
            <a href="#how" className="rounded-lg px-3 py-2 hover:bg-line-soft hover:text-ink">How it works</a>
            <a href="#wallets" className="rounded-lg px-3 py-2 hover:bg-line-soft hover:text-ink">Wallets</a>
            <a href="#safety" className="rounded-lg px-3 py-2 hover:bg-line-soft hover:text-ink">Safety</a>
            <a href="#faq" className="rounded-lg px-3 py-2 hover:bg-line-soft hover:text-ink">FAQ</a>
          </nav>
          <ThemeToggle className="ml-auto hidden sm:inline-flex md:ml-0" />
          <button type="button" onClick={connect} className="ml-auto min-h-11 rounded-xl bg-brand-solid px-4 text-sm font-semibold text-white shadow-[0_6px_16px_-6px_rgba(38,71,217,0.6)] hover:bg-brand-hover sm:ml-0">
            Connect wallet
          </button>
        </div>
      </header>

      <main>
        {/* Hero ---------------------------------------------------------------------------------- */}
        <section className="relative bg-canvas">
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-[0.55] [background-image:radial-gradient(rgb(var(--c-dots))_1px,transparent_1px)] [background-size:22px_22px] [mask-image:radial-gradient(ellipse_at_70%_40%,black,transparent_70%)]" />
          <div className={`relative mx-auto grid max-w-6xl items-center gap-14 py-16 lg:grid-cols-[1fr_1.05fr] lg:py-24 ${gutter}`}>
            <div className="wf-rise">
              <p className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-[13px] font-semibold text-brand-dark">
                <span className="h-1.5 w-1.5 rounded-full bg-brand" aria-hidden="true" />
                Crypto payroll on Base
              </p>
              <h1 className="mt-5 text-balance text-[44px] font-semibold leading-[1.04] tracking-tight sm:text-[60px]">
                Pay your whole team in <span className="text-brand">one transaction.</span>
              </h1>
              <p className="mt-5 max-w-[54ch] text-lg leading-relaxed text-ink-2">
                Keep your team in one list. On payday, Wagefold pulls every name, wallet and amount, and pays everyone in USDC or USDT from
                your treasury wallet with a single signature.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <button type="button" onClick={connect} className="inline-flex min-h-14 items-center gap-2 rounded-xl bg-brand-solid px-7 text-[17px] font-semibold text-white shadow-[0_12px_28px_-10px_rgba(38,71,217,0.7)] transition hover:-translate-y-0.5 hover:bg-brand-hover">
                  Connect wallet
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                </button>
                <a href="#how" className="inline-flex min-h-14 items-center rounded-xl px-5 text-[17px] font-semibold text-ink hover:bg-surface">How it works</a>
              </div>
              <div className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-3">
                <span className="text-[13px] font-medium text-ink-2">Works with</span>
                <ul className="flex items-center gap-2.5">
                  {WALLETS.map((w) => (
                    <li key={w.key} className="flex h-10 w-10 items-center justify-center rounded-xl border border-line bg-surface shadow-sm" title={BRAND_LOGOS[w.key].name}>
                      <BrandImg logo={w.key} className="h-6 w-6" />
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <Hero3D />
          </div>
        </section>

        {/* At a glance ----------------------------------------------------------------------------- */}
        <section aria-label="At a glance" className="border-y border-line bg-surface">
          <dl className={`mx-auto grid max-w-6xl grid-cols-2 gap-y-6 py-8 md:grid-cols-4 ${gutter}`}>
            <Stat value="1 signature" label="pays the whole team" />
            <Stat value="500 people" label="per transaction" />
            <div className="flex flex-col gap-1 px-2">
              <dt className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
                <BrandImg logo="usdc" className="h-7 w-7" /> <BrandImg logo="usdt" className="h-7 w-7" /> <span className="sr-only">USDC and USDT</span>
              </dt>
              <dd className="text-sm text-ink-2">USDC and USDT on Base</dd>
            </div>
            <Stat value="0 custody" label="your keys, your funds" />
          </dl>
        </section>

        {/* How it works ---------------------------------------------------------------------------- */}
        <section id="how" className="scroll-mt-20">
          <div className={`mx-auto max-w-6xl py-20 ${gutter}`}>
            <p className="text-sm font-semibold uppercase tracking-[0.08em] text-brand">How it works</p>
            <h2 className="mt-2 text-balance text-3xl font-semibold tracking-tight sm:text-4xl">Payday in three steps</h2>
            <ol className="mt-10 grid gap-6 md:grid-cols-3">
              {STEPS.map((s, i) => (
                <li key={s.title} className="group relative flex flex-col gap-3 rounded-2xl border border-line bg-surface p-6 transition duration-300 hover:-translate-y-1 hover:shadow-[0_18px_40px_-24px_rgba(14,20,32,0.35)]">
                  <div className="flex items-center justify-between">
                    <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-soft text-brand">
                      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{s.icon}</svg>
                    </span>
                    <span className="font-mono text-sm text-ink-3">Step {i + 1}</span>
                  </div>
                  <h3 className="text-lg font-semibold">{s.title}</h3>
                  <p className="text-[15px] leading-relaxed text-ink-2">{s.body}</p>
                </li>
              ))}
            </ol>
            <RunPipeline />
          </div>
        </section>

        {/* Wallets & stablecoins --------------------------------------------------------------------- */}
        <section id="wallets" className="scroll-mt-20 bg-canvas">
          <div className={`mx-auto grid max-w-6xl gap-12 py-20 lg:grid-cols-[1.2fr_1fr] ${gutter}`}>
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.08em] text-brand">Wallets</p>
              <h2 className="mt-2 text-balance text-3xl font-semibold tracking-tight sm:text-4xl">Use the wallet you already have</h2>
              <p className="mt-3 max-w-[52ch] text-lg text-ink-2">Connect a single-signer wallet or a Safe, where your approvers become its signers.</p>
              <ul className="mt-8 grid gap-3 sm:grid-cols-2">
                {WALLETS.map((w) => (
                  <li key={w.key} className="flex items-center gap-4 rounded-2xl border border-line bg-surface p-4 transition hover:-translate-y-0.5 hover:shadow-[0_14px_30px_-22px_rgba(14,20,32,0.4)]">
                    <span className="flex h-12 w-12 flex-none items-center justify-center rounded-xl bg-canvas">
                      <BrandImg logo={w.key} className="h-8 w-8" />
                    </span>
                    <span className="flex flex-col">
                      <span className="font-semibold">{BRAND_LOGOS[w.key].name}</span>
                      <span className="text-[13px] text-ink-2">{w.note}</span>
                    </span>
                  </li>
                ))}
                <li className="flex items-center gap-4 rounded-2xl border border-dashed border-line-strong bg-surface/60 p-4">
                  <span className="flex h-12 w-12 flex-none items-center justify-center rounded-xl bg-canvas text-ink-2" aria-hidden="true">
                    <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9h18M7 6.5h.01M10 6.5h.01" /></svg>
                  </span>
                  <span className="flex flex-col">
                    <span className="font-semibold">Other browser wallets</span>
                    <span className="text-[13px] text-ink-2">Rabby, Brave Wallet and more</span>
                  </span>
                </li>
              </ul>
            </div>
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.08em] text-brand">Stablecoins</p>
              <h2 className="mt-2 text-balance text-3xl font-semibold tracking-tight sm:text-4xl">Paid in digital dollars</h2>
              <div className="mt-8 grid gap-4">
                <TokenCard logo="usdc" title="USD Coin (USDC)" body="Issued by Circle. Each person can be paid in USDC, USDT or a mix across the team." />
                <TokenCard logo="usdt" title="Tether (USDT)" body="Issued by Tether. Totals per token are shown before you sign, with your available balance." />
              </div>
            </div>
          </div>
        </section>

        {/* Measured --------------------------------------------------------------------------------- */}
        <section className="bg-night text-white">
          <div className={`mx-auto max-w-6xl py-20 ${gutter}`}>
            <p className="text-sm font-semibold uppercase tracking-[0.08em] text-[#9FB0F0]">Measured, not estimated</p>
            <h2 className="mt-2 max-w-2xl text-balance text-3xl font-semibold tracking-tight sm:text-4xl">Paying 100 people: one run versus 100 transfers</h2>
            <div className="mt-12 grid gap-10 lg:grid-cols-2">
              <GasBars />
              <SignatureDots />
            </div>
            <p className="mt-10 max-w-[70ch] text-[13px] leading-relaxed text-white/60">
              Gas measured in Wagefold&apos;s contract tests (Hardhat, a 6-decimal test stablecoin, 100 new recipients for each approach). Exact
              figures on Base with real USDC differ slightly; the ratio holds.
            </p>
          </div>
        </section>

        {/* Safety ------------------------------------------------------------------------------------ */}
        <section id="safety" className="scroll-mt-20">
          <div className={`mx-auto max-w-6xl py-20 ${gutter}`}>
            <p className="text-sm font-semibold uppercase tracking-[0.08em] text-brand">Safety</p>
            <h2 className="mt-2 max-w-2xl text-balance text-3xl font-semibold tracking-tight sm:text-4xl">Built for the moments payroll goes wrong</h2>
            <p className="mt-3 max-w-[60ch] text-lg text-ink-2">Crypto payments can&apos;t be reversed, so the safeguards sit before the signature, not after.</p>
            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {SAFEGUARDS.map((f) => (
                <div key={f.title} className="flex gap-3 rounded-2xl border border-line p-5 transition hover:border-brand/30 hover:bg-brand-soft/30">
                  <span className="mt-0.5 flex h-8 w-8 flex-none items-center justify-center rounded-full bg-good-soft text-good" aria-hidden="true">
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

        {/* FAQ --------------------------------------------------------------------------------------- */}
        <section id="faq" className="scroll-mt-20 bg-canvas">
          <div className={`mx-auto max-w-3xl py-20 ${gutter}`}>
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

        {/* CTA ---------------------------------------------------------------------------------------- */}
        <section className="relative overflow-hidden bg-brand-solid text-white">
          <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-white/10" />
          <div aria-hidden="true" className="pointer-events-none absolute -bottom-32 right-40 h-72 w-72 rounded-full bg-brand-deep/40" />
          <div className={`relative mx-auto flex max-w-6xl flex-col items-start gap-6 py-16 md:flex-row md:items-center md:justify-between ${gutter}`}>
            <div>
              <h2 className="max-w-xl text-balance text-3xl font-semibold tracking-tight">Run your next payroll with one signature.</h2>
              <p className="mt-2 text-white/80">Connect a wallet to start. It takes about five minutes to add your team.</p>
            </div>
            <button type="button" onClick={connect} className="min-h-14 rounded-xl bg-white px-7 text-[17px] font-semibold text-[#2647D9] shadow-[0_12px_28px_-12px_rgba(14,20,32,0.6)] transition hover:-translate-y-0.5">
              Connect wallet
            </button>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className={`mx-auto flex max-w-6xl flex-wrap items-center gap-4 py-8 text-sm text-ink-2 ${gutter}`}>
          <LogoMark className="h-6 w-6" />
          <span>© 2026 Wagefold</span>
          <span className="ml-auto max-w-[60ch]">Wallet and token names and logos are trademarks of their owners and are shown only to indicate compatibility.</span>
        </div>
      </footer>

      <WalletPicker open={picking} onClose={() => setPicking(false)} />
    </div>
  );
}

function BrandImg({ logo, className }: { logo: BrandLogo; className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={BRAND_LOGOS[logo].src} alt={BRAND_LOGOS[logo].name} className={`object-contain ${className ?? ""}`} draggable={false} />;
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col gap-1 px-2">
      <dt className="text-2xl font-semibold tracking-tight">{value}</dt>
      <dd className="text-sm text-ink-2">{label}</dd>
    </div>
  );
}

function TokenCard({ logo, title, body }: { logo: BrandLogo; title: string; body: string }) {
  return (
    <div className="flex items-start gap-4 rounded-2xl border border-line bg-surface p-5">
      <Coin logo={logo} size={56} spin={false} />
      <div>
        <h3 className="font-semibold">{title}</h3>
        <p className="mt-1 text-[15px] leading-relaxed text-ink-2">{body}</p>
      </div>
    </div>
  );
}

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const on = () => setReduced(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduced;
}

function useMediaQuery(query: string) {
  const [match, setMatch] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(query);
    setMatch(mq.matches);
    const on = () => setMatch(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [query]);
  return match;
}

function useInView<T extends Element>() {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return setInView(true);
    const io = new IntersectionObserver(([e]) => e.isIntersecting && (setInView(true), io.disconnect()), { threshold: 0.3 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return { ref, inView };
}

/** A coin with real thickness: front and back faces plus stacked rim layers, spinning in 3D. */
function Coin({ logo, size, spin = true, style }: { logo: BrandLogo; size: number; spin?: boolean; style?: CSSProperties }) {
  const rim = logo === "usdc" ? "#1E4FB0" : "#0B7F73";
  const depth = 6;
  return (
    <div className="preserve-3d flex-none [perspective:600px]" style={{ width: size, height: size, ...style }} aria-hidden="true">
      <div className={`preserve-3d relative h-full w-full ${spin ? "wf-coin-spin" : ""}`}>
        {Array.from({ length: depth }, (_, i) => (
          <span key={i} className="absolute inset-0 rounded-full" style={{ background: rim, transform: `translateZ(${-i - 0.5}px)` }} />
        ))}
        {[0, 180].map((deg) => (
          <span
            key={deg}
            className="backface-hidden absolute inset-0 flex items-center justify-center rounded-full bg-white shadow-[inset_0_0_0_3px_rgba(14,20,32,0.06)]"
            style={{ transform: `rotateY(${deg}deg) translateZ(${deg ? depth : 0.5}px)` }}
          >
            <BrandImg logo={logo} className="h-[78%] w-[78%]" />
          </span>
        ))}
      </div>
    </div>
  );
}

/** The product in a picture: one treasury fanning out to the whole team, tilted in 3D. */
function Hero3D() {
  const reduced = usePrefersReducedMotion();
  const wide = useMediaQuery("(min-width: 1024px)");
  const flat = reduced || !wide; // phones and tablets get a flat card that fits the screen
  const [tilt, setTilt] = useState({ rx: 8, ry: -14 });
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (flat || e.pointerType !== "mouse") return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    setTilt({ rx: 8 - y * 10, ry: -14 + x * 14 });
  };
  const rows = PREVIEW.length;
  const rowGap = 64;
  const top = 32;
  const height = top * 2 + rowGap * (rows - 1);
  const mid = height / 2;
  const paths = PREVIEW.map((_, i) => `M 34 ${mid} C 80 ${mid}, 70 ${top + i * rowGap}, 120 ${top + i * rowGap}`);

  return (
    <div className="relative mx-auto mt-8 w-full max-w-[540px] [perspective:1400px] lg:mt-0" onPointerMove={onMove} onPointerLeave={() => setTilt({ rx: 8, ry: -14 })}>
      <div
        className="preserve-3d relative"
        style={{ transform: flat ? "none" : `rotateX(${tilt.rx}deg) rotateY(${tilt.ry}deg)`, transition: "transform 400ms cubic-bezier(.2,.7,.2,1)" }}
      >
        {/* back plate for depth */}
        <div aria-hidden="true" className="absolute inset-0 rounded-[28px] bg-brand/15" style={{ transform: "translateZ(-40px) translate(18px, 18px)" }} />

        <figure className="relative rounded-[24px] border border-line bg-surface p-5 shadow-[0_40px_80px_-40px_rgba(14,20,32,0.45)] sm:p-6">
          <div className="flex items-center justify-between gap-3 border-b border-line-soft pb-4">
            <div>
              <p className="text-xs font-medium text-ink-2">October payroll</p>
              <p className="tabular mt-0.5 text-sm font-semibold tracking-[-0.01em] sm:text-lg">30,900 USDC + 12,500 USDT</p>
            </div>
            <span className="whitespace-nowrap rounded-full bg-good-soft px-2.5 py-1 text-xs font-semibold text-good">1 transaction</span>
          </div>
          <div className="relative mt-4 grid grid-cols-[64px_1fr] sm:grid-cols-[120px_1fr]">
            <div className="relative">
              <svg className="absolute inset-0 h-full w-full" viewBox={`0 0 120 ${height}`} preserveAspectRatio="none" aria-hidden="true">
                {paths.map((d, i) => (
                  <g key={i}>
                    <path d={d} fill="none" className="stroke-brand" strokeOpacity={0.18} strokeWidth="2" vectorEffect="non-scaling-stroke" />
                    <path d={d} fill="none" strokeOpacity={0.7} strokeWidth="2" strokeDasharray="4 10" vectorEffect="non-scaling-stroke" className="wf-dash stroke-brand" />
                    {!reduced && (
                      <circle r="3.5" className="fill-brand">
                        <animateMotion dur="2.4s" repeatCount="indefinite" begin={`${i * 0.35}s`} path={d} />
                      </circle>
                    )}
                  </g>
                ))}
              </svg>
              <div className="absolute left-0 top-1/2 flex -translate-y-1/2 flex-col items-center gap-1">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-night text-white shadow-lg">
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h13v4" /><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M16 13.5h2" /></svg>
                </span>
                <span className="text-[11px] font-medium text-ink-2">Treasury</span>
              </div>
            </div>
            <ul className="flex flex-col" style={{ gap: rowGap - 48, paddingBlock: top - 24 }}>
              {PREVIEW.map((p) => (
                <li key={p.name} className="flex h-12 items-center gap-2 rounded-xl border border-line bg-surface px-2 sm:gap-3 sm:px-3">
                  <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-good-soft text-good sm:h-7 sm:w-7" aria-hidden="true">
                    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="m5 12 5 5 9-10" /></svg>
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{p.name}</span>
                  <span className="tabular flex items-center gap-1 whitespace-nowrap text-xs font-medium sm:gap-1.5 sm:text-[13px]">
                    {p.amount}
                    <BrandImg logo={p.token} className="h-4 w-4" />
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <figcaption className="mt-4 text-xs text-ink-2">Example team. Every payment is checked on-chain after it lands.</figcaption>
        </figure>

        {/* floating layers in front of the card */}
        <div className="preserve-3d pointer-events-none absolute right-3 -top-7 lg:-right-8 lg:-top-8" style={{ transform: "translateZ(110px)" }}>
          <div className="wf-float">
            <Coin logo="usdc" size={wide ? 76 : 52} />
          </div>
        </div>
        <div className="preserve-3d pointer-events-none absolute -bottom-8 left-3 lg:-bottom-10 lg:-left-10" style={{ transform: "translateZ(80px)" }}>
          <div className="wf-float" style={{ animationDelay: "-3s" }}>
            <Coin logo="usdt" size={wide ? 64 : 46} />
          </div>
        </div>
        <div className="pointer-events-none absolute -left-6 top-24 hidden sm:block" style={{ transform: "translateZ(60px)" }} aria-hidden="true">
          <div className="wf-float flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2 text-xs font-semibold shadow-[0_18px_30px_-18px_rgba(14,20,32,0.5)]" style={{ animationDelay: "-1.5s" }}>
            <BrandImg logo="metamask" className="h-5 w-5" /> Signed once
          </div>
        </div>
        <div className="pointer-events-none absolute -bottom-6 right-6" style={{ transform: "translateZ(70px)" }} aria-hidden="true">
          <div className="wf-float flex items-center gap-2 rounded-xl bg-night px-3 py-2 text-xs font-semibold text-white shadow-xl" style={{ animationDelay: "-4.5s" }}>
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-good-dot">
              <svg className="h-2.5 w-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round"><path d="m5 12 5 5 9-10" /></svg>
            </span>
            Verified on Base
          </div>
        </div>
      </div>
    </div>
  );
}

/** Infographic: the five stages every payroll run goes through, with a pulse moving along the rail. */
function RunPipeline() {
  return (
    <div className="mt-14 rounded-[24px] border border-line bg-canvas p-6 sm:p-8">
      <h3 className="text-lg font-semibold">Inside one payroll run</h3>
      <div className="relative mt-8">
        <div aria-hidden="true" className="absolute left-[10%] right-[10%] top-5 hidden h-0.5 bg-line md:block">
          <span className="wf-rail-dot absolute -top-[5px] h-3 w-3 -translate-x-1/2 rounded-full bg-brand shadow-[0_0_0_6px_rgba(38,71,217,0.15)]" />
        </div>
        <ol className="relative grid gap-6 md:grid-cols-5">
          {PIPELINE.map((s, i) => (
            <li key={s.title} className="flex gap-4 md:flex-col md:items-center md:text-center">
              <span className={`relative z-10 flex h-10 w-10 flex-none items-center justify-center rounded-full border-2 text-sm font-semibold ${i === 3 ? "border-brand bg-brand-solid text-white" : "border-brand/30 bg-surface text-brand-dark"}`}>
                {i + 1}
              </span>
              <span className="flex flex-col gap-1">
                <span className="font-semibold">{s.title}</span>
                <span className="text-[13px] leading-snug text-ink-2">{s.body}</span>
              </span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

/** Infographic: measured gas, drawn to scale. */
function GasBars() {
  const { ref, inView } = useInView<HTMLDivElement>();
  const pct = (GAS.wagefold / GAS.separate) * 100;
  const saved = Math.round((1 - GAS.wagefold / GAS.separate) * 100);
  const fmt = (n: number) => n.toLocaleString("en-US");
  return (
    <div ref={ref} className="rounded-[20px] bg-white/[0.04] p-6 ring-1 ring-white/10">
      <p className="text-sm text-white/70">Gas used</p>
      <p className="mt-1 text-4xl font-semibold tracking-tight">{saved}% less</p>
      <div className="mt-6 flex flex-col gap-5" role="img" aria-label={`100 separate transfers used ${fmt(GAS.separate)} gas; one Wagefold run used ${fmt(GAS.wagefold)} gas.`}>
        {[
          { label: "100 separate transfers", value: GAS.separate, width: 100, color: "bg-white/35" },
          { label: "One Wagefold run", value: GAS.wagefold, width: pct, color: "bg-[#7D93F2]" },
        ].map((b) => (
          <div key={b.label}>
            <div className="flex justify-between gap-3 text-sm">
              <span className="text-white/85">{b.label}</span>
              <span className="tabular font-medium text-white">{fmt(b.value)}</span>
            </div>
            <div className="mt-2 h-3 rounded-full bg-white/10">
              <div className={`h-3 rounded-full ${b.color} transition-[width] duration-1000 ease-out`} style={{ width: inView ? `${b.width}%` : "0%" }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Infographic: signatures needed, one dot per signature. */
function SignatureDots() {
  return (
    <div className="rounded-[20px] bg-white/[0.04] p-6 ring-1 ring-white/10">
      <p className="text-sm text-white/70">Signatures needed</p>
      <p className="mt-1 text-4xl font-semibold tracking-tight">100 → 1</p>
      <div className="mt-6 grid gap-6 sm:grid-cols-[1fr_auto] sm:items-end">
        <div>
          <div className="grid grid-cols-[repeat(20,minmax(0,1fr))] gap-1" role="img" aria-label="100 dots, one per signature for separate transfers">
            {Array.from({ length: 100 }, (_, i) => (
              <span key={i} className="aspect-square rounded-full bg-white/30" />
            ))}
          </div>
          <p className="mt-2 text-[13px] text-white/70">Separate transfers: one per person</p>
        </div>
        <div className="flex flex-col items-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[#7D93F2] shadow-[0_0_0_10px_rgba(125,147,242,0.15)]" role="img" aria-label="One signature for a Wagefold run">
            <svg className="h-7 w-7 text-ink" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="m5 12 5 5 9-10" /></svg>
          </span>
          <p className="mt-2 text-[13px] text-white/70">Wagefold: one per run</p>
        </div>
      </div>
    </div>
  );
}
