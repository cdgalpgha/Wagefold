import { generateSiweNonce } from "viem/siwe";
import { json } from "@/lib/server/http";
import { LIMITS, rateLimited } from "@/lib/server/rate-limit";
import { issueNonceCookie } from "@/lib/server/session";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const limited = await rateLimited(req, LIMITS.nonce);
  if (limited) return limited;
  const nonce = generateSiweNonce();
  await issueNonceCookie(nonce);
  return json({ nonce });
}
