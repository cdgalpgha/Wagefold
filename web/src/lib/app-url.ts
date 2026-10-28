// NEXT_PUBLIC_* values must be referenced literally so Next.js can inline them in the browser bundle.
const CONFIGURED = process.env.NEXT_PUBLIC_APP_URL;

/**
 * The address wallets show for this app (WalletConnect, Coinbase Wallet). It must match the page the
 * person is on: WalletConnect flags a mismatch as a possible phishing site. NEXT_PUBLIC_APP_URL when
 * set, otherwise the page's own origin; during server rendering, where there is no page, a placeholder
 * that the browser replaces before any wallet connects.
 */
export function appUrl(origin: string | undefined = typeof window === "undefined" ? undefined : window.location.origin): string {
  const configured = CONFIGURED?.trim().replace(/\/+$/, "");
  return configured || origin || "http://localhost:3000";
}

/** Wallet-facing app details: name, what it does, its address and its icon. */
export function walletMetadata(origin?: string) {
  const url = appUrl(origin);
  return {
    name: "Wagefold",
    description: "Two-person stablecoin payroll on Base: your accounts team signs, your treasury sends.",
    url,
    icons: [`${url}/icon-512.png`],
  };
}
