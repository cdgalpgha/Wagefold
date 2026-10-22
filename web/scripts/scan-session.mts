// Signs in a Hardhat test wallet against a local stack and prints the session cookie, for authenticated
// security scans (ZAP replacer, curl). Local chain only: never use a real key.
// Usage: npx tsx scripts/scan-session.mts <test-private-key>
import { privateKeyToAccount } from "viem/accounts";
import { createSiweMessage } from "viem/siwe";
const BASE = "http://localhost:3000";
const account = privateKeyToAccount(process.argv[2] as `0x${string}`);
const n = await fetch(`${BASE}/api/auth/nonce`);
const nonceCookie = n.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
const { nonce } = await n.json();
const message = createSiweMessage({ address: account.address, chainId: 31337, domain: "localhost:3000", uri: BASE, nonce, version: "1" });
const signature = await account.signMessage({ message });
const v = await fetch(`${BASE}/api/auth/verify`, { method: "POST", headers: { "content-type": "application/json", cookie: nonceCookie }, body: JSON.stringify({ message, signature }) });
const session = v.headers.getSetCookie().map((c) => c.split(";")[0]).find((c) => c.startsWith("wf_session="));
if (v.status !== 200 || !session) throw new Error(`sign-in failed ${v.status}`);
console.log(session);
