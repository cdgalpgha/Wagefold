import { NextResponse, type NextRequest } from "next/server";

/**
 * A strict Content-Security-Policy with a fresh nonce per page load. Only scripts carrying the nonce
 * run (Next.js adds it to its own scripts; the layout adds it to the theme script), so injected
 * markup can't execute code. Connections stay open to https/wss because wallets talk to their own
 * relays and RPCs (WalletConnect, Coinbase, the chain's RPC); the nonce is what stops XSS.
 */
export function middleware(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/api/")) return guardApi(request);
  const nonce = btoa(crypto.randomUUID());
  const dev = process.env.NODE_ENV !== "production";
  const localChain = process.env.NEXT_PUBLIC_PAYROLL_ADDRESS_31337 ? "http://127.0.0.1:8545 http://localhost:8545" : "";
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    // Geist comes from Google Fonts: its stylesheet and font files are the only outside styles allowed.
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data: https://fonts.gstatic.com",
    `connect-src 'self' https: wss: ${localChain}${dev ? " ws:" : ""}`.trim(),
    "frame-src 'self' https://verify.walletconnect.com https://verify.walletconnect.org https://secure.walletconnect.org https://keys.coinbase.com",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    // Only Wagefold itself and the Safe app (for multisig treasuries) may frame the app.
    "frame-ancestors 'self' https://app.safe.global",
  ].join("; ");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Cross-site request forgery, second line of defence (the first is the SameSite=Lax session cookie).
 * Requests that change something must come from this site and carry JSON, which a page on another
 * site can't send without the browser asking this server first (and it never says yes).
 */
function guardApi(request: NextRequest) {
  if (SAFE_METHODS.has(request.method)) return NextResponse.next();
  const deny = (status: number, error: string) =>
    NextResponse.json({ error }, { status, headers: { "Cache-Control": "no-store", "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'" } });
  // In production only APP_DOMAIN counts; Host can be set by whoever sends the request.
  const expected = process.env.APP_DOMAIN?.trim() || request.headers.get("host");
  const origin = request.headers.get("origin");
  if (request.headers.get("sec-fetch-site") === "cross-site") return deny(403, "Requests from other sites aren't allowed.");
  if (origin) {
    let host: string | null = null;
    try {
      host = new URL(origin).host;
    } catch {
      host = null;
    }
    if (!host || host !== expected) return deny(403, "Requests from other sites aren't allowed.");
  }
  const hasBody = Number(request.headers.get("content-length") ?? "0") > 0 || request.headers.has("transfer-encoding");
  const type = request.headers.get("content-type") ?? "";
  if (hasBody && !/^application\/json(;|$)/i.test(type)) return deny(415, "Send JSON (Content-Type: application/json).");
  return NextResponse.next();
}

export const config = {
  // Pages get the CSP; API writes get the cross-site guard. API responses get their own deny-all CSP (next.config.mjs).
  matcher: [
    "/api/:path*",
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:png|svg|ico|webmanifest|woff2?)$).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
