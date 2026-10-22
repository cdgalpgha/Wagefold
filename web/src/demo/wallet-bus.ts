/** Lets the simulated wallet ask the viewer to approve requests, like a real wallet popup. */
export type PromptLine = { label: string; value: string };
export type WalletPrompt = {
  id: number;
  kind: "connect" | "sign" | "transaction";
  title: string;
  lines: PromptLine[];
  note?: string;
  confirmLabel: string;
};

type Pending = WalletPrompt & { resolve: () => void; reject: (err: Error) => void };
let current: Pending | null = null;
let nextId = 1;
const listeners = new Set<(p: WalletPrompt | null) => void>();

function emit() {
  for (const l of listeners) l(current);
}

export function subscribe(fn: (p: WalletPrompt | null) => void): () => void {
  listeners.add(fn);
  fn(current);
  return () => listeners.delete(fn);
}

export function ask(prompt: Omit<WalletPrompt, "id">): Promise<void> {
  if (current) current.reject(rejection());
  return new Promise<void>((resolve, reject) => {
    current = { ...prompt, id: nextId++, resolve, reject };
    emit();
  });
}

export function answer(approved: boolean): void {
  const p = current;
  current = null;
  emit();
  if (!p) return;
  if (approved) p.resolve();
  else p.reject(rejection());
}

function rejection() {
  return Object.assign(new Error("User rejected the request."), { code: 4001 });
}
