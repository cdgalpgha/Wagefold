import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-brand-solid text-white shadow-button hover:bg-brand-hover disabled:bg-line disabled:text-ink-3 disabled:shadow-none",
  secondary:
    "border border-line-strong bg-surface text-ink shadow-card hover:border-ink-3/50 hover:bg-surface-2 disabled:text-ink-3 disabled:hover:border-line-strong disabled:hover:bg-surface",
  ghost: "text-brand hover:bg-brand-soft",
  danger: "border border-bad-line bg-surface text-bad shadow-card hover:bg-bad-soft",
};
const SIZES = { md: "min-h-11 rounded-[10px] px-4 text-sm", lg: "min-h-[52px] rounded-xl px-6 text-[16px]" };

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: keyof typeof SIZES }) {
  return (
    <button
      type="button"
      {...props}
      className={`inline-flex select-none items-center justify-center gap-2 font-semibold tracking-[-0.005em] transition duration-150 ease-out active:translate-y-px disabled:cursor-not-allowed disabled:active:translate-y-0 ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
    />
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-2xl border border-line bg-surface shadow-card ${className}`}>{children}</section>;
}

/** Title, one line of context and the page's actions, the same on every tab. */
export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end gap-x-6 gap-y-4">
      <div className="flex flex-1 basis-72 flex-col gap-1.5">
        <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.02em] sm:text-[30px]">{title}</h1>
        {description && <p className="tabular text-[15px] text-ink-2">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2.5">{actions}</div>}
    </div>
  );
}

/** Small label above a value or section: quiet, but easy to scan. */
export function Eyebrow({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <span className={`text-[12px] font-medium uppercase tracking-[0.08em] text-ink-3 ${className}`}>{children}</span>;
}

/** What to show when a list is empty: what will appear here, and the next step. Sits inside a Card. */
export function EmptyState({ icon, title, children, action }: { icon: keyof typeof EMPTY_ICONS; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2.5 px-6 py-14 text-center">
      <span className="mb-1 flex h-11 w-11 items-center justify-center rounded-xl border border-line bg-surface-2 text-ink-2 shadow-card" aria-hidden="true">
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          {EMPTY_ICONS[icon]}
        </svg>
      </span>
      <h2 className="text-base font-semibold">{title}</h2>
      {children && <div className="max-w-[48ch] text-sm leading-relaxed text-ink-2">{children}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

const EMPTY_ICONS = {
  people: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M21.5 20a6.5 6.5 0 0 0-4-6" />
    </>
  ),
  runs: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  invoices: (
    <>
      <path d="M6 3h9l4 4v14H6z" />
      <path d="M14 3v5h5M9 13h6M9 17h4" />
    </>
  ),
  activity: <path d="M3 12h4l3-8 4 16 3-8h4" />,
};

export function Spinner({ className = "" }: { className?: string }) {
  return (
    <svg className={`h-5 w-5 animate-spin ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function CheckIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden="true">
      <path d="m5 12 5 5 9-10" />
    </svg>
  );
}

export function XIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden="true">
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

export function Field({ label, children, hint, className = "" }: { label: string; children: ReactNode; hint?: string; className?: string }) {
  return (
    <label className={`flex flex-col gap-1.5 text-[13px] font-medium text-ink ${className}`}>
      {label}
      {children}
      {hint && <span className="text-xs font-normal text-ink-2">{hint}</span>}
    </label>
  );
}

export const inputClass =
  "min-h-11 w-full rounded-[10px] border border-line-strong bg-surface px-3 text-[15px] text-ink shadow-card transition duration-150 placeholder:text-ink-3 hover:border-ink-3/50 focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/15 disabled:bg-surface-2 disabled:text-ink-2";

export function shortAddress(a: string) {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <span className={`block animate-pulse rounded-md bg-line-soft ${className}`} aria-hidden="true" />;
}

export function CopyIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15V5a2 2 0 0 1 2-2h10" />
    </svg>
  );
}

export function Badge({ tone, children }: { tone: "brand" | "good" | "warn" | "bad" | "neutral"; children: React.ReactNode }) {
  const tones = {
    brand: "bg-brand-soft text-brand-dark",
    good: "bg-good-soft text-good",
    warn: "bg-warn-soft text-warn",
    bad: "bg-bad-soft text-bad-text",
    neutral: "bg-line-soft text-ink-2",
  };
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${tones[tone]}`}>{children}</span>;
}
