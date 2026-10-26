import { generateSiweNonce } from "viem/siwe";
import { json } from "@/lib/server/http";
import { issueNonceCookie } from "@/lib/server/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const nonce = generateSiweNonce();
  await issueNonceCookie(nonce);
  return json({ nonce });
}
