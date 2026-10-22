import "server-only";
import { NextResponse } from "next/server";
import { readSession, type Session } from "./session";

export function json<T>(body: T, status = 200) {
  return NextResponse.json(body, { status });
}

export function fail(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
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
