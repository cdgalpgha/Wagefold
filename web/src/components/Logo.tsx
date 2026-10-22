import { W_DARK, W_LIGHT, WORDMARK } from "@/lib/brand";

export function LogoMark({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 48" aria-hidden="true">
      <path d={W_DARK} className="fill-logo-a" />
      <path d={W_LIGHT} className="fill-logo-b" />
    </svg>
  );
}

export function Logo({ className = "h-7" }: { className?: string }) {
  return (
    <svg className={`${className} w-auto`} viewBox="0 24 556 104" role="img" aria-label="Wagefold">
      <g transform="translate(-8.75 13) scale(2.1875)">
        <path d={W_DARK} className="fill-logo-a" />
        <path d={W_LIGHT} className="fill-logo-b" />
      </g>
      <path transform="translate(110 0)" d={WORDMARK} className="fill-ink" />
    </svg>
  );
}
