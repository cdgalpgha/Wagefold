import type { ReactNode } from "react";

/**
 * Guilloché: the fine interwoven lines engraved on banknotes and cheques to make them hard to copy.
 * Wagefold's payroll run is a cheque for the whole team, so it wears the same engraving. Drawn once,
 * deterministically, in the current text colour; it never animates.
 */
const W = 1200;
const H = 80;

function wave(i: number, n: number, set: number): string {
  const phase = (i / n) * Math.PI * 2 + set * 0.9;
  const pts: string[] = [];
  for (let x = 0; x <= W; x += 6) {
    const t = (x / W) * Math.PI * 2;
    const y =
      H / 2 +
      15 * Math.sin(t * 4 + phase) +
      8 * Math.sin(t * 11 - phase * 1.7) * Math.cos(t * 1.5 + phase * 0.5) +
      3 * Math.sin(t * 23 + phase * 2.3);
    pts.push(`${x} ${y.toFixed(1)}`);
  }
  return `M${pts.join("L")}`;
}

const SET_A = Array.from({ length: 12 }, (_, i) => wave(i, 12, 0));
const SET_B = Array.from({ length: 12 }, (_, i) => wave(i, 12, 1));

export function Guilloche({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <g fill="none" stroke="currentColor" vectorEffect="non-scaling-stroke">
        {SET_A.map((d, i) => (
          <path key={`a${i}`} d={d} strokeWidth="0.7" strokeOpacity="0.5" vectorEffect="non-scaling-stroke" />
        ))}
        {SET_B.map((d, i) => (
          <path key={`b${i}`} d={d} strokeWidth="0.5" strokeOpacity="0.28" vectorEffect="non-scaling-stroke" />
        ))}
      </g>
    </svg>
  );
}

/** The engraved strip across the top of a cheque: who it's from on the left, its number on the right. */
export function ChequeBand({ left, right }: { left: ReactNode; right?: ReactNode }) {
  return (
    <div className="relative h-14 overflow-hidden border-b border-line text-brand">
      <Guilloche className="absolute inset-0 h-full w-full" />
      <div className="relative flex h-full items-center justify-between gap-4 px-6 sm:px-8">
        <span className="truncate rounded bg-surface/90 px-1.5 py-0.5 font-display text-[12px] font-semibold uppercase tracking-[0.16em] text-ink">
          {left}
        </span>
        {right && <span className="flex-none rounded bg-surface/90 px-1.5 py-0.5 font-mono text-[12px] text-brass">{right}</span>}
      </div>
    </div>
  );
}

/** A tear-off line with punched notches at both edges, between a cheque and its stub. */
export function Perforation() {
  return (
    <div className="relative" aria-hidden="true">
      <div className="mx-5 border-t-2 border-dotted border-line-strong" />
      <span className="absolute -left-[11px] -top-[10px] h-5 w-5 rounded-full border border-line bg-canvas" />
      <span className="absolute -right-[11px] -top-[10px] h-5 w-5 rounded-full border border-line bg-canvas" />
    </div>
  );
}

/** A labelled line on a cheque: a small caps label, then the value. */
export function ChequeLine({ label, children, rule = false }: { label: string; children: ReactNode; rule?: boolean }) {
  return (
    <div className={`flex items-baseline gap-4 ${rule ? "border-b border-line-strong pb-3" : ""}`}>
      <span className="w-[5.5rem] flex-none text-[11px] font-medium uppercase tracking-[0.14em] text-ink-3">{label}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
