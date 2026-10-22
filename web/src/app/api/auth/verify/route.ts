import { cookies } from "next/headers";
import { getAddress, isHex } from "viem";
import { parseSiweMessage } from "viem/siwe";
import { serverClient } from "@/lib/server/chain";
import { fail, json, readJson } from "@/lib/server/http";
import { upsertOrganization } from "@/lib/server/repo";
import { createSessionCookie, NONCE_COOKIE } from "@/lib/server/session";

export async function POST(req: Request) {
  const body = (await readJson(req)) as { message?: unknown; signature?: unknown } | null;
  const message = typeof body?.message === "string" ? body.message : null;
  const signature = typeof body?.signature === "string" && isHex(body.signature) ? body.signature : null;
  if (!message || !signature) return fail("Missing sign-in message or signature.");

  const nonce = cookies().get(NONCE_COOKIE)?.value;
  if (!nonce) return fail("Sign-in expired. Please try again.", 401);

  const parsed = parseSiweMessage(message);
  if (!parsed.address || !parsed.chainId) return fail("That sign-in message is incomplete.");
  const client = serverClient(parsed.chainId);
  if (!client) return fail("Switch your wallet to a supported network, then sign in again.");

  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? undefined;
  // Checks the signature (regular wallets and smart wallets such as Safe), domain, nonce and expiry.
  const valid = await client.verifySiweMessage({ message, signature, nonce, domain: host });
  if (!valid) return fail("We couldn't verify that signature.", 401);

  const address = getAddress(parsed.address);
  const org = await upsertOrganization(address);
  await createSessionCookie({ address, orgId: org.id, chainId: parsed.chainId });
  cookies().delete(NONCE_COOKIE);
  return json({ address, chainId: parsed.chainId, org });
}
