import "server-only";
import { NextResponse } from "next/server";
import { readSession, type Session } from "./session";

// Payroll data must never sit in a browser or proxy cache.
const NO_STORE = { "Cache-Control": "no-store" };

export function json<T>(body: T, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

export function fail(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status, headers: NO_STORE });
}

/** Returns the signed-in session, or a 401 response to send back as-is. */
export async function requireSession(): Promise<Session | NextResponse> {
  const session = await readSession();
  return session ?? fail("Sign in with your wallet to continue.", 401);
}

export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}
