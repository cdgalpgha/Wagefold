/** Per-viewer persistence for the demo. Storage can be unavailable (private mode, previews), so it degrades to memory. */
// v3 made payroll two-person (accounts signs, treasury sends); older saved demos start fresh.
const KEY = "wagefold-demo-v3";

export function load<T>(fallback: () => T): T {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as T;
  } catch {
    /* storage blocked */
  }
  return fallback();
}

export function save(value: unknown): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(value));
  } catch {
    /* storage blocked or full: keep running in memory */
  }
}

export function clear(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
