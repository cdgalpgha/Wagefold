import { cookies } from "next/headers";
import { getAddress, isHex } from "viem";
import { parseSiweMessage } from "viem/siwe";
import { serverClient } from "@/lib/server/chain";
import { fail, json, readJson } from "@/lib/server/http";
import { logActivity, upsertOrganization } from "@/lib/server/repo";
import { createSessionCookie, NONCE_COOKIE } from "@/lib/server/session";

export async function POST(req: Request) {
  const body = (await readJson(req)) as { message?: unknown; signature?: unknown } | null;
  const message = typeof body?.message === "string" ? body.message : null;
  const signature = typeof body?.signature === "string" && isHex(body.signature) ? body.signature : null;
  if (!message || !signature) return fail("Missing sign-in message or signature.");

  const jar = await cookies();
  const nonce = jar.get(NONCE_COOKIE)?.value;
  if (!nonce) return fail("Sign-in expired. Please try again.", 401);

  const parsed = parseSiweMessage(message);
  if (!parsed.address || !parsed.chainId) return fail("That sign-in message is incomplete.");
  const client = serverClient(parsed.chainId);
  if (!client) return fail("Switch your wallet to a supported network, then sign in again.");

  const domain = expectedDomain(req);
  if (!domain) return fail("Sign-in isn't configured on this server (APP_DOMAIN is missing).", 500);
  // The message must be for this site. A phishing site can't reuse a signature it got for itself.
  let uriHost: string | null = null;
  try {
    uriHost = new URL(parsed.uri ?? "").host;
  } catch {
    uriHost = null;
  }
  if (parsed.domain !== domain || uriHost !== domain) return fail("This sign-in was made for a different site.", 401);
  // Checks the signature (regular wallets and smart wallets such as Safe), domain, nonce and expiry.
  const valid = await client.verifySiweMessage({ message, signature, nonce, domain });
  if (!valid) return fail("We couldn't verify that signature.", 401);

  const address = getAddress(parsed.address);
  const org = await upsertOrganization(address);
  await createSessionCookie({ address, orgId: org.id, chainId: parsed.chainId });
  jar.delete(NONCE_COOKIE);
  await logActivity(org.id, address, "signed_in", { chainId: parsed.chainId });
  return json({ address, chainId: parsed.chainId, org });
}

/**
 * The domain sign-in messages must name. Production uses only APP_DOMAIN: request headers such as
 * Host and X-Forwarded-Host can be set by whoever sends the request, so trusting them would let a
 * phishing site replay a signature it collected for its own domain.
 */
function expectedDomain(req: Request): string | null {
  const configured = process.env.APP_DOMAIN?.trim();
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") return null;
  return req.headers.get("host"); // local development only
}
