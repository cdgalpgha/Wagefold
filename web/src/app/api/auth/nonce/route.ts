import { cookies } from "next/headers";
import { generateSiweNonce } from "viem/siwe";
import { json } from "@/lib/server/http";
import { cookieOptions, NONCE_COOKIE } from "@/lib/server/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const nonce = generateSiweNonce();
  cookies().set(NONCE_COOKIE, nonce, cookieOptions(60 * 10));
  return json({ nonce });
}
