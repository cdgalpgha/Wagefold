"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";

type Toast = { id: number; message: string; tone: "good" | "bad" | "neutral"; action?: { label: string; run: () => void } };
type ToastApi = (message: string, opts?: { tone?: Toast["tone"]; action?: Toast["action"] }) => void;

const Ctx = createContext<ToastApi>(() => undefined);

/** One short message at the bottom of the screen; announced politely to screen readers. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const show = useCallback<ToastApi>(
    (message, opts) => {
      const id = nextId.current++;
      setToasts((t) => [...t.slice(-2), { id, message, tone: opts?.tone ?? "neutral", action: opts?.action }]);
      setTimeout(() => dismiss(id), opts?.action ? 7000 : 4000);
    },
    [dismiss],
  );
  return (
    <Ctx.Provider value={show}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex flex-col items-center gap-2 px-4 pb-[max(16px,env(safe-area-inset-bottom))]">
        {toasts.map((t) => (
          <div key={t.id} className="pointer-events-auto flex max-w-md items-center gap-3 rounded-xl bg-night px-4 py-3 text-sm text-white shadow-lg">
            {t.tone !== "neutral" && <span className={`h-2 w-2 flex-none rounded-full ${t.tone === "good" ? "bg-good-dot" : "bg-[#F97066]"}`} aria-hidden="true" />}
            <span className="flex-1">{t.message}</span>
            {t.action && (
              <button
                type="button"
                className="min-h-9 rounded-lg px-2 font-semibold text-[#9FB0F0] hover:text-white"
                onClick={() => {
                  t.action!.run();
                  dismiss(t.id);
                }}
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast(): ToastApi {
  return useContext(Ctx);
}

/** Copies text inside the click handler (required by browsers) and reports the result. */
export async function copyText(text: string, toast: ToastApi, label = "Copied") {
  try {
    await navigator.clipboard.writeText(text);
    toast(label, { tone: "good" });
  } catch {
    toast("Couldn't copy here. Select the address and copy it manually.", { tone: "bad" });
  }
}
