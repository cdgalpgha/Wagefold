"use client";

import { useEffect, useState } from "react";
import { applyTheme, storedTheme, THEMES, type Theme } from "@/lib/theme";

const LABEL: Record<Theme, string> = { system: "System", light: "Light", dark: "Dark" };

export function useTheme(): [Theme | null, (t: Theme) => void] {
  // null until mounted: the server can't know the stored choice, so nothing is shown as selected yet.
  const [theme, setTheme] = useState<Theme | null>(null);
  useEffect(() => {
    const sync = () => setTheme(storedTheme());
    sync();
    window.addEventListener("wagefold-theme", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("wagefold-theme", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return [theme, applyTheme];
}

function Icon({ theme }: { theme: Theme }) {
  const common = { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  if (theme === "light")
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </svg>
    );
  if (theme === "dark")
    return (
      <svg {...common}>
        <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z" />
      </svg>
    );
  return (
    <svg {...common}>
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 20h8M12 16v4" />
    </svg>
  );
}

/** Compact three-way switch for headers. `labels` shows the words too (used in Settings). */
export function ThemeToggle({ labels = false, className = "" }: { labels?: boolean; className?: string }) {
  const [theme, setTheme] = useTheme();
  return (
    <div role="radiogroup" aria-label="Theme" className={`inline-flex rounded-full border border-line bg-surface p-0.5 ${className}`}>
      {THEMES.map((t) => {
        const on = theme === t;
        return (
          <button
            key={t}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={labels ? undefined : `${LABEL[t]} theme`}
            title={`${LABEL[t]} theme`}
            onClick={() => setTheme(t)}
            className={`inline-flex min-h-8 items-center gap-1.5 rounded-full px-2 text-[13px] font-medium transition-colors ${
              labels ? "px-3" : "min-w-8 justify-center"
            } ${on ? "bg-brand-soft text-brand-dark" : "text-ink-3 hover:text-ink"}`}
          >
            <Icon theme={t} />
            {labels && LABEL[t]}
          </button>
        );
      })}
    </div>
  );
}
