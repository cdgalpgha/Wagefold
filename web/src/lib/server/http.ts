import "server-only";
import { NextResponse } from "next/server";
import { can, type Action, type Role } from "../roles";
import { roleOf } from "./repo";
import { readSession, type Session } from "./session";

// Payroll data must never sit in a browser or proxy cache.
const NO_STORE = { "Cache-Control": "no-store" };

export function json<T>(body: T, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

export function fail(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status, headers: NO_STORE });
}

export type Member = Session & { role: Role };

/**
 * The signed-in wallet and its current role in the company, if it may do `action`. The role is read
 * from the database on every request, never from the cookie, so removing someone or changing their
 * role takes effect immediately. Not a member any more: 401 (sign in again). Not allowed: 403.
 */
export async function requireMember(action: Action = "view"): Promise<Member | NextResponse> {
  const session = await readSession();
  if (!session) return fail("Sign in with your wallet to continue.", 401);
  const role = await roleOf(session.orgId, session.address);
  if (!role) return fail("You're no longer on this company's team. Sign in again.", 401);
  if (!can(role, action)) return fail(DENIED[action], 403);
  return { ...session, role };
}

/** Kept for routes that only need a signed-in member (any role). */
export const requireSession = () => requireMember("view");

const DENIED: Record<Action, string> = {
  view: "You can't view this company.",
  editPeople: "Your role can't change People. Ask an admin or the owner.",
  prepare: "Your role can't prepare payroll.",
  approve: "Only admins and the owner can approve payroll.",
  send: "Only the treasury wallet (the owner) can send payroll.",
  settings: "Only admins and the owner can change settings.",
  team: "Only the owner can change the team or the approval rule.",
};

/**
 * The request body as JSON, or null if it isn't JSON. Bodies containing a NUL character anywhere are
 * refused too (null): Postgres can't store NUL, and no legitimate field needs one.
 */
export async function readJson(req: Request): Promise<unknown> {
  try {
    const text = await req.text();
    if (text.length > 2_000_000 || text.includes("\u0000") || text.includes("\\u0000")) return null;
    return JSON.parse(text);
  } catch {
    return null;
  }
}
