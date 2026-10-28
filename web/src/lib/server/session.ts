import "server-only";
import crypto from "node:crypto";
import { jwtVerify, SignJWT } from "jose";
import { cookies } from "next/headers";
import { getDb } from "./db";

export const SESSION_COOKIE = "wf_session";
export const NONCE_COOKIE = "wf_nonce";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 3;
export const NONCE_TTL_SECONDS = 60 * 10;

export type Session = { address: string; orgId: string; chainId: number };

let devSecret: Uint8Array | undefined;

function secret(): Uint8Array {
  const value = process.env.SESSION_SECRET;
  if (value) {
    if (process.env.NODE_ENV === "production" && value.length < 32) throw new Error("SESSION_SECRET must be at least 32 characters.");
    return new TextEncoder().encode(value);
  }
  if (process.env.NODE_ENV === "production") throw new Error("SESSION_SECRET must be set in production.");
  // Development only: a per-process secret, so sessions reset when the dev server restarts.
  devSecret ??= crypto.randomBytes(32);
  return devSecret;
}

export const cookieOptions = (maxAge: number) => ({
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge,
});

/**
 * Starts a session: a row on the server and a signed cookie naming it. Both are needed, so a
 * session ends for real when it's revoked, not when the cookie happens to expire.
 */
export async function createSessionCookie(session: Session): Promise<void> {
  const db = await getDb();
  const { rows } = await db.query<{ id: string }>(
    `insert into sessions (address, org_id, expires_at) values ($1, $2, now() + ($3::int * interval '1 second')) returning id::text as id`,
    [session.address, session.orgId, SESSION_TTL_SECONDS],
  );
  const token = await new SignJWT({ orgId: session.orgId, chainId: session.chainId })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(session.address)
    .setJti(rows[0].id)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(secret());
  (await cookies()).set(SESSION_COOKIE, token, cookieOptions(SESSION_TTL_SECONDS));
}

async function readToken(): Promise<(Session & { id: string }) | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    if (!payload.sub || !payload.jti || typeof payload.orgId !== "string" || typeof payload.chainId !== "number") return null;
    return { id: payload.jti, address: payload.sub, orgId: payload.orgId, chainId: payload.chainId };
  } catch {
    return null;
  }
}

/** This browser's session id, if it carries a cookie this server signed (revoked or not). For rate limits. */
export async function sessionKey(): Promise<string | null> {
  return (await readToken())?.id ?? null;
}

export async function readSession(): Promise<Session | null> {
  const token = await readToken();
  if (!token || !/^[0-9a-f-]{36}$/i.test(token.id)) return null;
  const db = await getDb();
  const { rows } = await db.query(
    `select 1 from sessions where id = $1 and org_id = $2 and lower(address) = lower($3) and revoked_at is null and expires_at > now()`,
    [token.id, token.orgId, token.address],
  );
  return rows.length ? { address: token.address, orgId: token.orgId, chainId: token.chainId } : null;
}

/** Ends this browser's session on the server and clears the cookie. */
export async function endSession(): Promise<void> {
  const token = await readToken();
  if (token && /^[0-9a-f-]{36}$/i.test(token.id)) {
    const db = await getDb();
    await db.query(`update sessions set revoked_at = now() where id = $1 and revoked_at is null`, [token.id]);
  }
  (await cookies()).set(SESSION_COOKIE, "", cookieOptions(0));
}

/** Ends every session a wallet has in a company, e.g. when the owner removes it from the team. */
export async function revokeSessions(orgId: string, address: string): Promise<void> {
  const db = await getDb();
  await db.query(`update sessions set revoked_at = now() where org_id = $1 and lower(address) = lower($2) and revoked_at is null`, [orgId, address]);
}

/** A sign-in nonce in a signed cookie, so only nonces this server issued are accepted. */
export async function issueNonceCookie(nonce: string): Promise<void> {
  const token = await new SignJWT({ nonce })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${NONCE_TTL_SECONDS}s`)
    .sign(secret());
  (await cookies()).set(NONCE_COOKIE, token, cookieOptions(NONCE_TTL_SECONDS));
}

export async function readNonceCookie(): Promise<string | null> {
  const token = (await cookies()).get(NONCE_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    return typeof payload.nonce === "string" ? payload.nonce : null;
  } catch {
    return null;
  }
}

/** Marks a nonce used. False if it already was: the same signed message can't sign in twice. */
export async function consumeNonce(nonce: string): Promise<boolean> {
  const db = await getDb();
  await db.query(`delete from used_nonces where expires_at < now()`);
  const { rows } = await db.query(
    `insert into used_nonces (nonce, expires_at) values ($1, now() + ($2::int * interval '1 second')) on conflict do nothing returning nonce`,
    [nonce, NONCE_TTL_SECONDS * 2],
  );
  return rows.length > 0;
}
