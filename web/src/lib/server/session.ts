import "server-only";
import crypto from "node:crypto";
import { jwtVerify, SignJWT } from "jose";
import { cookies } from "next/headers";

export const SESSION_COOKIE = "wf_session";
export const NONCE_COOKIE = "wf_nonce";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

export type Session = { address: string; orgId: string; chainId: number };

let devSecret: Uint8Array | undefined;

function secret(): Uint8Array {
  const value = process.env.SESSION_SECRET;
  if (value) return new TextEncoder().encode(value);
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

export async function createSessionCookie(session: Session): Promise<void> {
  const token = await new SignJWT({ orgId: session.orgId, chainId: session.chainId })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(session.address)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(secret());
  cookies().set(SESSION_COOKIE, token, cookieOptions(SESSION_TTL_SECONDS));
}

export async function readSession(): Promise<Session | null> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    if (!payload.sub || typeof payload.orgId !== "string" || typeof payload.chainId !== "number") return null;
    return { address: payload.sub, orgId: payload.orgId, chainId: payload.chainId };
  } catch {
    return null;
  }
}

export function clearSessionCookie(): void {
  cookies().set(SESSION_COOKIE, "", cookieOptions(0));
}
