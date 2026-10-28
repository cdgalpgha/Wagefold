import { cookies } from "next/headers";
import { getAddress, isHex } from "viem";
import { parseSiweMessage } from "viem/siwe";
import { serverClient } from "@/lib/server/chain";
import { fail, json, readJson } from "@/lib/server/http";
import { LIMITS, rateLimited } from "@/lib/server/rate-limit";
import { getOrganization, logActivity, membershipsFor, upsertOrganization } from "@/lib/server/repo";
import { consumeNonce, createSessionCookie, NONCE_COOKIE, NONCE_TTL_SECONDS, readNonceCookie } from "@/lib/server/session";

const CLOCK_SKEW_MS = 2 * 60 * 1000;

export async function POST(req: Request) {
  const limited = await rateLimited(req, LIMITS.verify);
  if (limited) return limited;
  const body = (await readJson(req)) as { message?: unknown; signature?: unknown } | null;
  const message = typeof body?.message === "string" ? body.message : null;
  const signature = typeof body?.signature === "string" && isHex(body.signature) ? body.signature : null;
  if (!message || !signature) return fail("Missing sign-in message or signature.");

  const jar = await cookies();
  // Only a nonce this server issued (signed cookie) and only within its ten minutes.
  const nonce = await readNonceCookie();
  if (!nonce) return fail("Sign-in expired. Please try again.", 401);

  const parsed = parseSiweMessage(message);
  if (!parsed.address || !parsed.chainId) return fail("That sign-in message is incomplete.");
  // The message must be fresh and short-lived, so a copied signature is useless soon after.
  const now = Date.now();
  const issued = parsed.issuedAt?.getTime();
  const expires = parsed.expirationTime?.getTime();
  if (
    !issued ||
    !expires ||
    issued > now + CLOCK_SKEW_MS ||
    issued < now - NONCE_TTL_SECONDS * 1000 ||
    expires - issued > NONCE_TTL_SECONDS * 1000 + CLOCK_SKEW_MS
  ) {
    return fail("Sign-in expired. Please try again.", 401);
  }
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
  // Each signed message signs in once. A replay of the same message and nonce is refused.
  if (!(await consumeNonce(nonce))) return fail("That sign-in was already used. Please sign in again.", 401);

  const address = getAddress(parsed.address);
  const org = await chooseOrganization(address);
  if (!org) return fail("Couldn't open your company. Try again.", 500);
  await createSessionCookie({ address, orgId: org.id, chainId: parsed.chainId });
  jar.delete(NONCE_COOKIE);
  await logActivity(org.id, address, "signed_in", { chainId: parsed.chainId });
  return json({ address, chainId: parsed.chainId, org });
}

/**
 * Which company to open. A wallet that was added to someone else's team lands there, unless its own
 * company already has people in it. A wallet on no team gets its own company, as its owner.
 * The header switcher moves between companies afterwards.
 */
async function chooseOrganization(address: string) {
  const memberships = await membershipsFor(address);
  if (!memberships.length) return upsertOrganization(address);
  const owned = memberships.find((m) => m.role === "owner");
  const invited = memberships.find((m) => m.role !== "owner");
  const pick = owned && (owned.employees > 0 || !invited) ? owned : invited ?? memberships[0];
  return getOrganization(pick.orgId);
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
