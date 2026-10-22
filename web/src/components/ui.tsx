import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
const VARIANTS: Record<Variant, string> = {
  primary: "bg-brand text-white hover:bg-brand-dark disabled:bg-[#C9D2F5] disabled:text-[#31428F]",
  secondary: "border border-[#D5D9E0] bg-white text-ink hover:border-brand hover:text-brand-dark",
  ghost: "text-brand hover:underline",
  danger: "border border-[#F1C4BF] bg-white text-bad hover:bg-bad-soft",
};
const SIZES = { md: "min-h-11 px-4 text-sm", lg: "min-h-14 px-7 text-[17px]" };

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
      className={`inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-colors disabled:cursor-not-allowed ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
    />
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-2xl border border-line bg-white ${className}`}>{children}</section>;
}

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
    <label className={`flex flex-col gap-1.5 text-[13px] font-medium ${className}`}>
      {label}
      {children}
      {hint && <span className="text-xs font-normal text-ink-2">{hint}</span>}
    </label>
  );
}

export const inputClass =
  "min-h-11 w-full rounded-[10px] border border-line-strong bg-white px-3 text-[15px] text-ink placeholder:text-ink-3 focus:border-brand focus:outline-none";

export function shortAddress(a: string) {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}
