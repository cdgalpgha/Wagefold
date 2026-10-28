import "server-only";
import { NextResponse } from "next/server";
import { sessionKey } from "./session";

/**
 * In-memory rate limits for sign-in and payment checks. Each server process counts on its own, so
 * with several instances put a limiter in front of them too (your host's or proxy's).
 *
 * Who is counted: the signed-in session when there is one; otherwise the client IP, but only when
 * TRUST_PROXY=1 says a proxy in front sets X-Forwarded-For (its first entry is the client). Without
 * that, anyone can write the header, so anonymous requests share one, larger, allowance.
 */
export type Limit = { name: string; max: number; anonMax: number; windowMs: number };

export const LIMITS = {
  nonce: { name: "nonce", max: 30, anonMax: 300, windowMs: 60_000 },
  verify: { name: "verify", max: 10, anonMax: 120, windowMs: 60_000 },
  logout: { name: "logout", max: 30, anonMax: 300, windowMs: 60_000 },
  // The app checks a sent payroll every 1.5 s for up to 30 s, and a Safe payment every 30 s.
  confirm: { name: "confirm", max: 60, anonMax: 600, windowMs: 60_000 },
} satisfies Record<string, Limit>;

type Window = { count: number; resetAt: number };
const windows = new Map<string, Window>();
const MAX_KEYS = 50_000;

/** Counts one request. Returns the seconds to wait if it's over the limit, otherwise null. */
export function hit(key: string, max: number, windowMs: number, now = Date.now()): number | null {
  if (windows.size >= MAX_KEYS) {
    for (const [k, w] of windows) if (w.resetAt <= now) windows.delete(k);
    if (windows.size >= MAX_KEYS) windows.clear(); // never let the table grow without bound
  }
  let w = windows.get(key);
  if (!w || w.resetAt <= now) {
    w = { count: 0, resetAt: now + windowMs };
    windows.set(key, w);
  }
  w.count++;
  return w.count > max ? Math.max(1, Math.ceil((w.resetAt - now) / 1000)) : null;
}

/** The client's IP from the first X-Forwarded-For entry, only when a trusted proxy sets it. */
export function clientIp(headers: Headers): string | null {
  if (process.env.TRUST_PROXY !== "1") return null;
  const first = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return first && first.length <= 64 && /^[0-9a-fA-F.:]+$/.test(first) ? first : null;
}

/** A 429 response if this request is over `limit`, otherwise null. */
export async function rateLimited(req: Request, limit: Limit): Promise<NextResponse | null> {
  const session = await sessionKey();
  const ip = session ? null : clientIp(req.headers);
  const key = session ? `s:${session}` : ip ? `ip:${ip}` : "anon";
  const wait = hit(`${limit.name}:${key}`, key === "anon" ? limit.anonMax : limit.max, limit.windowMs);
  if (wait === null) return null;
  return NextResponse.json(
    { error: "Too many requests. Wait a moment and try again." },
    { status: 429, headers: { "Retry-After": String(wait), "Cache-Control": "no-store" } },
  );
}
