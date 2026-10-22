/**
 * Light, dark, or follow the system. The choice lives on <html data-theme> (absent = system) and in
 * this browser's storage. Storage can be blocked (private mode, sandboxed previews), so every
 * access is guarded and the app still works, just without remembering.
 */
export type Theme = "system" | "light" | "dark";
export const THEMES: Theme[] = ["system", "light", "dark"];
const KEY = "wagefold-theme";

export function storedTheme(): Theme {
  try {
    const t = window.localStorage.getItem(KEY);
    return t === "light" || t === "dark" ? t : "system";
  } catch {
    return "system";
  }
}

export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);
  try {
    if (theme === "system") window.localStorage.removeItem(KEY);
    else window.localStorage.setItem(KEY, theme);
  } catch {
    /* storage blocked: the choice lasts for this visit */
  }
  window.dispatchEvent(new Event("wagefold-theme"));
}

/** Runs in <head> before the page paints, so a saved dark theme never flashes light. Keep it tiny. */
export const THEME_SCRIPT = `try{var t=localStorage.getItem("${KEY}");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}`;
