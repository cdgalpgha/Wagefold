/**
 * End-to-end test against a running stack:
 *   1. contracts: `npx hardhat node`, then `npm run dev:setup`
 *   2. web:       `npm run build && npm start` (or `npm run dev`)
 *   3. web:       `npm run e2e`
 * Uses Hardhat's well-known test accounts. Never point this at a real network.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createPublicClient, createWalletClient, erc20Abi, getAddress, http, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { hardhat } from "viem/chains";
import { createSiweMessage } from "viem/siwe";
import { payrollAbi } from "../src/lib/abi";
import { buildPayments, requiredAllowances, type RunItem } from "../src/lib/payments";
import type { ChainConfig } from "../src/lib/chains";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const KEYS = {
  treasury: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  otherCompany: "0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a",
  admin: "0x92db14e403b83dfe3df233f83dfa3a0d7096f21ca9b0d6d6b8d88b2b4ec1564e",
  preparer: "0x4bbbf85ce3377467afe5d46f804f221813b2bb87f24d81f60f1fcdbf7cbf4356",
  viewer: "0xdbda1821b80551c9d65939329250298aa3472ba22feea921c0cf5d620ea67b97",
} as const;
const RECIPIENTS = [
  "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
  "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
  "0x90F79bf6EB2c4f870365E785982E1f101E93b906",
] as const;

const env = Object.fromEntries(
  fs
    .readFileSync(path.resolve(__dirname, "../.env.local"), "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => l.split("=") as [string, string]),
);
const cfg: ChainConfig = {
  chain: hardhat,
  payroll: getAddress(env.NEXT_PUBLIC_PAYROLL_ADDRESS_31337),
  tokens: {
    USDC: { symbol: "USDC", address: getAddress(env.NEXT_PUBLIC_USDC_ADDRESS_31337), decimals: 6 },
    USDT: { symbol: "USDT", address: getAddress(env.NEXT_PUBLIC_USDT_ADDRESS_31337), decimals: 6 },
  },
};
const publicClient = createPublicClient({ chain: hardhat, transport: http() });

/** Minimal cookie-keeping HTTP client, one per signed-in user. */
function client() {
  const jar = new Map<string, string>();
  return Object.assign(call, { jar });
  async function call<T = any>(p: string, init: { method?: string; body?: unknown; headers?: Record<string, string> } = {}) {
    const res = await fetch(BASE + p, {
      method: init.method ?? (init.body === undefined ? "GET" : "POST"),
      headers: {
        ...init.headers,
        ...(init.body === undefined ? {} : { "content-type": "application/json" }),
        cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; "),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(";");
      const [k, v] = pair.split("=");
      if (v) jar.set(k, v);
      else jar.delete(k);
    }
    return { status: res.status, headers: res.headers, body: (await res.json().catch(() => null)) as T };
  }
}

/** A sign-in message like the app makes: fresh, and valid for ten minutes. */
function siwe(address: Address, nonce: string, over: Partial<Parameters<typeof createSiweMessage>[0]> = {}) {
  return createSiweMessage({
    address,
    chainId: hardhat.id,
    domain: new URL(BASE).host,
    uri: BASE,
    nonce,
    version: "1",
    issuedAt: new Date(),
    expirationTime: new Date(Date.now() + 10 * 60 * 1000),
    ...over,
  });
}

async function signIn(call: ReturnType<typeof client>, key: Hex) {
  const account = privateKeyToAccount(key);
  const { body } = await call<{ nonce: string }>("/api/auth/nonce");
  const message = siwe(account.address, body.nonce);
  const signature = await account.signMessage({ message });
  const res = await call("/api/auth/verify", { body: { message, signature } });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return account;
}

/** The accounts team submits a draft: fetch the exact message for this run, sign it, send it back. */
async function submitSigned(call: ReturnType<typeof client>, key: Hex, runId: string, body: Record<string, unknown> = {}) {
  const { body: m } = await call<{ message: string }>(`/api/runs/${runId}/request`);
  const signature = await privateKeyToAccount(key).signMessage({ message: m.message });
  return call(`/api/runs/${runId}/request`, { body: { ...body, signature } });
}

async function pay(key: Hex, runRef: Hex, items: RunItem[]): Promise<Hex> {
  const account = privateKeyToAccount(key);
  const wallet = createWalletClient({ account, chain: hardhat, transport: http() });
  const payments = buildPayments(items, cfg);
  for (const [token, amount] of requiredAllowances(payments)) {
    const h = await wallet.writeContract({ address: token, abi: erc20Abi, functionName: "approve", args: [cfg.payroll, amount] });
    await publicClient.waitForTransactionReceipt({ hash: h });
  }
  const hash = await wallet.writeContract({ address: cfg.payroll, abi: payrollAbi, functionName: "pay", args: [runRef, payments] });
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

const balance = (token: Address, who: Address) =>
  publicClient.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [who] });

let passed = 0;
async function step(name: string, fn: () => Promise<void>) {
  await fn();
  passed++;
  console.log(`  ✔ ${name}`);
}

async function main() {
  console.log(`Wagefold end-to-end against ${BASE}`);
  const api = client();
  const startBalances = await Promise.all([
    balance(cfg.tokens.USDC!.address, RECIPIENTS[0]),
    balance(cfg.tokens.USDC!.address, RECIPIENTS[1]),
    balance(cfg.tokens.USDT!.address, RECIPIENTS[2]),
  ]);

  await step("blocks payroll data without a wallet sign-in", async () => {
    assert.equal((await api("/api/employees")).status, 401);
    assert.equal((await api("/api/runs", { body: { chainId: 31337 } })).status, 401);
  });

  await step("rejects a forged sign-in signature", async () => {
    const forger = client();
    const { body } = await forger<{ nonce: string }>("/api/auth/nonce");
    const victim = privateKeyToAccount(KEYS.treasury);
    const attacker = privateKeyToAccount(KEYS.otherCompany);
    const message = siwe(victim.address, body.nonce);
    const res = await forger("/api/auth/verify", { body: { message, signature: await attacker.signMessage({ message }) } });
    assert.equal(res.status, 401);
  });

  await step("rejects a signature collected by a phishing site and replayed with a spoofed host header", async () => {
    const attacker = client();
    const { body } = await attacker<{ nonce: string }>("/api/auth/nonce");
    const victim = privateKeyToAccount(KEYS.treasury);
    // The victim signs a normal-looking sign-in on evil.example; the wallet shows no warning because the domain matches.
    const message = siwe(victim.address, body.nonce, { domain: "evil.example", uri: "https://evil.example" });
    const signature = await victim.signMessage({ message });
    const res = await attacker("/api/auth/verify", { body: { message, signature }, headers: { "x-forwarded-host": "evil.example" } });
    assert.equal(res.status, 401, JSON.stringify(res.body));
  });

  await step("a signed sign-in works once, must be fresh, and only with a nonce this server issued", async () => {
    const account = privateKeyToAccount(KEYS.otherCompany);
    const first = client();
    const { body } = await first<{ nonce: string }>("/api/auth/nonce");
    const nonceCookie = first.jar.get("wf_nonce")!;
    const message = siwe(account.address, body.nonce);
    const signature = await account.signMessage({ message });
    assert.equal((await first("/api/auth/verify", { body: { message, signature } })).status, 200);
    // Someone who copied the message, signature and nonce cookie can't sign in with them again.
    const replay = client();
    replay.jar.set("wf_nonce", nonceCookie);
    const again = await replay("/api/auth/verify", { body: { message, signature } });
    assert.equal(again.status, 401);
    assert.match(again.body.error, /already used/);
    // A nonce the server never issued (unsigned cookie) is refused.
    const forged = client();
    forged.jar.set("wf_nonce", "abcdefgh12345678");
    const m2 = siwe(account.address, "abcdefgh12345678");
    assert.equal((await forged("/api/auth/verify", { body: { message: m2, signature: await account.signMessage({ message: m2 }) } })).status, 401);
    // Stale, or never expiring, messages are refused.
    for (const over of [{ issuedAt: new Date(Date.now() - 60 * 60 * 1000) }, { expirationTime: undefined }, { expirationTime: new Date(Date.now() + 7 * 864e5) }]) {
      const c = client();
      const n = (await c<{ nonce: string }>("/api/auth/nonce")).body.nonce;
      const m = siwe(account.address, n, over);
      assert.equal((await c("/api/auth/verify", { body: { message: m, signature: await account.signMessage({ message: m }) } })).status, 401, JSON.stringify(over));
    }
  });

  await step("sends a nonce-based CSP, anti-clickjacking and no-cache headers", async () => {
    const page = await fetch(BASE + "/");
    const csp = page.headers.get("content-security-policy") ?? "";
    assert.match(csp, /frame-ancestors 'self' https:\/\/app\.safe\.global/);
    assert.match(csp, /script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/);
    assert.match(csp, /object-src 'none'/);
    assert.ok(!/script-src[^;]*'unsafe-inline'/.test(csp), "scripts must not allow unsafe-inline");
    const nonce = csp.match(/'nonce-([^']+)'/)![1];
    const html = await page.text();
    assert.ok(html.includes(`nonce="${nonce}"`), "inline scripts carry this request's nonce");
    const again = (await fetch(BASE + "/")).headers.get("content-security-policy") ?? "";
    assert.notEqual(again.match(/'nonce-([^']+)'/)![1], nonce, "a fresh nonce per request");
    assert.match(csp, /style-src [^;]*https:\/\/fonts\.googleapis\.com/, "the Geist stylesheet is allowed");
    assert.match(csp, /font-src [^;]*https:\/\/fonts\.gstatic\.com/, "Geist font files are allowed");
    const apiCsp = (await fetch(BASE + "/api/auth/nonce")).headers.get("content-security-policy");
    assert.equal(apiCsp, "default-src 'none'; frame-ancestors 'none'");
    const unknown = await fetch(BASE + "/api/does-not-exist");
    assert.equal(unknown.status, 404);
    assert.match(unknown.headers.get("content-type") ?? "", /application\/json/);
    assert.equal(page.headers.get("x-content-type-options"), "nosniff");
    assert.equal(page.headers.get("cross-origin-opener-policy"), "same-origin-allow-popups");
    assert.equal(page.headers.get("cross-origin-resource-policy"), "same-origin");
    assert.equal(page.headers.get("x-permitted-cross-domain-policies"), "none");
    assert.equal(page.headers.get("x-powered-by"), null);
    const res = await api("/api/auth/nonce");
    assert.equal(res.headers.get("cache-control"), "no-store");
  });

  const treasury = await step("signs in with the treasury wallet (SIWE)", async () => {
    await signIn(api, KEYS.treasury);
    const me = await api("/api/me");
    assert.equal(me.status, 200);
    assert.equal(me.body.address, privateKeyToAccount(KEYS.treasury).address);
  });
  void treasury;

  await step("a new company starts with two-person payroll on; a solo owner can switch it off", async () => {
    const me = await api("/api/me");
    assert.equal(me.body.org.twoPerson, true);
    await api("/api/employees", { body: { name: "Probe", wallet: "0x14dC79964da2C08b23698B3D3cc7Ca32193d9955", amount: "1", token: "USDC" } });
    const blocked = await api("/api/runs", { body: { chainId: 31337 } });
    assert.equal(blocked.status, 403);
    assert.match(blocked.body.error, /accounts team prepares/);
    const off = await api("/api/team/policy", { method: "PATCH", body: { twoPerson: false } });
    assert.equal(off.status, 200, JSON.stringify(off.body));
    assert.equal(off.body.org.twoPerson, false);
    const probe = (await api("/api/employees")).body.employees.find((e: { name: string }) => e.name === "Probe");
    await api(`/api/employees/${probe.id}`, { method: "DELETE" });
  });

  await step("validates employees: bad checksum, zero amount, unknown token", async () => {
    const typo = await api("/api/employees", { body: { name: "Typo", wallet: "0x70997970C51812dc3A010C7d01b50e0d17dc79c8", amount: "1", token: "USDC" } });
    assert.equal(typo.status, 400);
    assert.match(typo.body.error, /checksum/);
    assert.equal((await api("/api/employees", { body: { name: "Zero", wallet: RECIPIENTS[0], amount: "0", token: "USDC" } })).status, 400);
    assert.equal((await api("/api/employees", { body: { name: "Dai", wallet: RECIPIENTS[0], amount: "1", token: "DAI" } })).status, 400);
  });

  await step("imports people in bulk and reports bad rows", async () => {
    const res = await api("/api/employees", {
      body: {
        employees: [
          { name: "Priya Nair", role: "Head of Finance", wallet: RECIPIENTS[0], amount: "9,400", token: "USDC", email: "priya@example.com", address: "1 Market St, Lagos", taxId: "NG-123" },
          { name: "Maya Chen", role: "Engineer", wallet: RECIPIENTS[1].toLowerCase(), amount: "0.5", token: "USDC" },
          { name: "Tunde Bakare", role: "Engineer", wallet: RECIPIENTS[2], amount: "6900", token: "USDT" },
          { name: "Broken", role: "", wallet: "0x123", amount: "10", token: "USDC" },
        ],
      },
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.created.length, 3);
    assert.deepEqual(res.body.errors.map((e: { row: number }) => e.row), [4]);
  });

  await step("rejects NUL and control characters instead of crashing (fuzzing regression)", async () => {
    for (const body of [
      { name: "Nul", wallet: RECIPIENTS[0], amount: "1", token: "USDC", address: "a\u0000b" },
      { name: "Nul", wallet: RECIPIENTS[0], amount: "1", token: "USDC", taxId: "X\u0000" },
      { name: "Bell\u0007", wallet: RECIPIENTS[0], amount: "1", token: "USDC" },
    ]) {
      const res = await api("/api/employees", { body });
      assert.equal(res.status, 400, JSON.stringify(res.body));
    }
    for (const body of [{ taxId: "GB\u0000" }, { invoiceNote: "a\u0000" }, { address: "x\u0001y" }]) {
      assert.equal((await api("/api/me", { method: "PATCH", body })).status, 400);
    }
    // A body over 2 MB is refused without being read into memory.
    assert.equal((await api("/api/employees", { body: { name: "x".repeat(2_500_000), wallet: RECIPIENTS[0], amount: "1", token: "USDC" } })).status, 400);
  });

  await step("refuses cross-site writes even with a valid session (CSRF defence in depth)", async () => {
    const body = JSON.stringify({ name: "CSRF", wallet: "0x14dC79964da2C08b23698B3D3cc7Ca32193d9955", amount: "1", token: "USDC" });
    // The cookie is SameSite=Lax, so a browser wouldn't send it cross-site; this checks the second layer.
    const forms = await api("/api/employees", { body: JSON.parse(body), headers: { origin: "https://evil.example" } });
    assert.equal(forms.status, 403);
    assert.equal((await api("/api/employees", { body: JSON.parse(body), headers: { "sec-fetch-site": "cross-site" } })).status, 403);
    const plain = await fetch(BASE + "/api/employees", { method: "POST", headers: { "content-type": "text/plain" }, body });
    assert.equal(plain.status, 415);
    // Same-site requests (the app itself) still work.
    assert.equal((await api("/api/employees", { body: JSON.parse(body), headers: { origin: BASE } })).status, 201);
    const added = (await api("/api/employees")).body.employees.find((e: { name: string }) => e.name === "CSRF");
    assert.equal((await api(`/api/employees/${added.id}`, { method: "DELETE", headers: { origin: BASE } })).status, 200);
  });

  await step("refuses a second person with the same wallet", async () => {
    const dup = await api("/api/employees", { body: { name: "Dup", wallet: RECIPIENTS[0].toLowerCase(), amount: "1", token: "USDC" } });
    assert.equal(dup.status, 409);
  });

  let run: { id: string; onchainRef: Hex; totals: Record<string, string> };
  let items: RunItem[];
  await step("pulls name, wallet and amount for everyone into a run", async () => {
    const res = await api("/api/runs", { body: { chainId: 31337 } });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    ({ run, items } = res.body);
    assert.equal(items.length, 3);
    assert.equal(res.body.review.firstRun, true);
    assert.equal(res.body.review.newWallets.length, 3);
    assert.deepEqual(run.totals, { USDC: "9400.5", USDT: "6900" });
  });

  await step("keeps the run snapshot even if People changes mid-run", async () => {
    const { body } = await api("/api/employees");
    const priya = body.employees.find((e: { name: string }) => e.name === "Priya Nair");
    await api(`/api/employees/${priya.id}`, { method: "PATCH", body: { ...priya, amount: "99999" } });
    const again = await api(`/api/runs/${run.id}`);
    assert.equal(again.body.items[0].amount, "9400");
    await api(`/api/employees/${priya.id}`, { method: "PATCH", body: { ...priya, amount: "9400" } });
  });

  let txHash: Hex;
  await step("pays all 3 people in one on-chain transaction", async () => {
    txHash = await pay(KEYS.treasury, run.onchainRef, items);
    const receipt = await publicClient.getTransactionReceipt({ hash: txHash });
    assert.equal(receipt.status, "success");
  });

  await step("server verifies the transaction on-chain and marks the run paid", async () => {
    assert.equal((await api(`/api/runs/${run.id}/submit`, { body: { txHash, verifiedWallets: RECIPIENTS } })).status, 200);
    const res = await api(`/api/runs/${run.id}/confirm`, { body: {} });
    assert.equal(res.status, 200);
    assert.equal(res.body.run.status, "confirmed", JSON.stringify(res.body));
  });

  await step("issues one numbered invoice per payment as soon as the run is verified", async () => {
    const first = await api("/api/invoices");
    assert.equal(first.status, 200);
    const invoices = [...first.body.invoices].sort((a: { number: number }, b: { number: number }) => a.number - b.number);
    assert.deepEqual(invoices.map((i: { number: number }) => i.number), [1, 2, 3]);
    assert.deepEqual(invoices.map((i: { data: { label: string } }) => i.data.label), ["INV-0001", "INV-0002", "INV-0003"]);
    const priya = invoices[0].data;
    assert.equal(priya.supplier.name, "Priya Nair");
    assert.equal(priya.supplier.wallet, RECIPIENTS[0]);
    assert.equal(priya.supplier.email, "priya@example.com");
    assert.equal(priya.supplier.taxId, "NG-123");
    assert.equal(priya.amount, "9400");
    assert.equal(priya.txHash, txHash);
    assert.equal(priya.customer.wallet, privateKeyToAccount(KEYS.treasury).address);
    // Asking again doesn't issue duplicates.
    assert.equal((await api("/api/invoices")).body.invoices.length, 3);
  });

  await step("issued invoices don't change when company or people details change", async () => {
    const saved = await api("/api/me", { method: "PATCH", body: { legalName: "Northwind Labs Ltd", invoicePrefix: "NW-", address: "14 Harbour St" } });
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    assert.equal((await api("/api/me", { method: "PATCH", body: { invoicePrefix: "<b>" } })).status, 400);
    const { body } = await api("/api/employees");
    const priya = body.employees.find((e: { name: string }) => e.name === "Priya Nair");
    assert.equal(priya.taxId, "NG-123");
    assert.equal((await api(`/api/employees/${priya.id}`, { method: "PATCH", body: { ...priya, email: "not an email" } })).status, 400);
    await api(`/api/employees/${priya.id}`, { method: "PATCH", body: { ...priya, address: "New address" } });
    const after = (await api("/api/invoices")).body.invoices.find((i: { number: number }) => i.number === 1);
    assert.equal(after.data.label, "INV-0001");
    assert.equal(after.data.supplier.address, "1 Market St, Lagos");
    assert.notEqual(after.data.customer.name, "Northwind Labs Ltd");
    assert.equal((await api("/api/invoices", { method: "DELETE" })).status, 405);
  });

  await step("recipients received exactly the right amounts", async () => {
    const usd = (n: number) => BigInt(Math.round(n * 1e6));
    assert.equal(await balance(cfg.tokens.USDC!.address, RECIPIENTS[0]), startBalances[0] + usd(9400));
    assert.equal(await balance(cfg.tokens.USDC!.address, RECIPIENTS[1]), startBalances[1] + usd(0.5));
    assert.equal(await balance(cfg.tokens.USDT!.address, RECIPIENTS[2]), startBalances[2] + usd(6900));
  });

  await step("flags a changed wallet in the next run's review", async () => {
    const { body } = await api("/api/employees");
    const maya = body.employees.find((e: { name: string }) => e.name === "Maya Chen");
    const newWallet = "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65";
    await api(`/api/employees/${maya.id}`, { method: "PATCH", body: { ...maya, wallet: newWallet } });
    const res = await api("/api/runs", { body: { chainId: 31337 } });
    assert.equal(res.body.review.firstRun, false);
    assert.deepEqual(
      res.body.review.changes.map((c: { kind: string; name: string }) => `${c.kind}:${c.name}`),
      ["wallet:Maya Chen"],
    );
    assert.deepEqual(res.body.review.newWallets, [newWallet]);
    await api(`/api/employees/${maya.id}`, { method: "PATCH", body: maya });
  });

  await step("warns when a new wallet mimics one already paid (address poisoning)", async () => {
    // Same first 4 and last 4 characters as Priya's paid wallet, different in between.
    const fake = getAddress("0x7099" + "1".repeat(32) + "79c8");
    const add = await api("/api/employees", { body: { name: "Priya (new wallet)", wallet: fake, amount: "1", token: "USDC" } });
    assert.equal(add.status, 201, JSON.stringify(add.body));
    const res = await api("/api/runs", { body: { chainId: 31337 } });
    assert.deepEqual(
      res.body.review.lookalikes.map((l: { wallet: string; resemblesName: string }) => `${l.wallet}~${l.resemblesName}`),
      [`${fake}~Priya Nair`],
    );
    await api(`/api/employees/${add.body.employee.id}`, { method: "DELETE" });
  });

  await step("records when the run settled, its block, network fee and USD rate", async () => {
    const res = await api("/api/records");
    assert.equal(res.status, 200);
    const paid = res.body.runs.find((r: { run: { id: string } }) => r.run.id === run.id);
    assert.ok(paid, "paid run missing from records");
    const receipt = await publicClient.getTransactionReceipt({ hash: txHash });
    assert.equal(paid.run.blockNumber, receipt.blockNumber.toString());
    assert.ok(Number(paid.run.networkFee) > 0, `fee ${paid.run.networkFee}`);
    assert.ok(Math.abs(new Date(paid.run.paidAt).getTime() - Date.now()) < 10 * 60_000);
    assert.equal(paid.run.usdRates.USDC.rate, "1");
    assert.match(paid.run.usdRates.USDC.source, /^par/);
    assert.equal(paid.items.length, 3);
    assert.equal((await api("/api/records?year=2026;drop table")).status, 400);
    assert.equal((await api("/api/records?year=1e3")).status, 400);
  });

  await step("returns 404, not a server error, for malformed ids", async () => {
    assert.equal((await api("/api/runs/not-a-uuid")).status, 404);
    assert.equal((await api("/api/employees/not-a-uuid", { method: "DELETE" })).status, 404);
  });

  await step("won't mark a run paid using another run's transaction", async () => {
    const next = await api("/api/runs", { body: { chainId: 31337 } });
    // Junk and foreign addresses in the "confirmed wallets" list are dropped, not logged as confirmed.
    await api(`/api/runs/${next.body.run.id}/submit`, {
      body: { txHash, verifiedWallets: [RECIPIENTS[0].toLowerCase(), "0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc", "<script>", 7, null] },
    });
    const res = await api(`/api/runs/${next.body.run.id}/confirm`, { body: {} });
    assert.equal(res.body.run.status, "failed");
    assert.match(res.body.run.failureReason, /didn't pay this run/);
  });

  await step("history lists the paid and the rejected run", async () => {
    const { body } = await api("/api/runs");
    const statuses = body.runs.map((r: { status: string }) => r.status);
    assert.ok(statuses.includes("confirmed") && statuses.includes("failed"), statuses.join(","));
  });

  await step("logs who changed what, including wallet changes, in an append-only activity log", async () => {
    const { body } = await api("/api/activity");
    const actions = body.activity.map((a: { action: string }) => a.action);
    for (const a of ["signed_in", "people_imported", "person_updated", "person_added", "person_removed", "run_sent", "run_paid", "run_failed"]) {
      assert.ok(actions.includes(a), `missing ${a} in ${actions.join(",")}`);
    }
    type Entry = { action: string; actor: string; detail: { changes?: { wallet?: string[] } } };
    const walletChanges = body.activity.filter((a: Entry) => a.action === "person_updated" && a.detail.changes?.wallet);
    const change = walletChanges.find((a: Entry) => a.detail.changes!.wallet![0] === RECIPIENTS[1]);
    assert.deepEqual(change?.detail.changes.wallet, [RECIPIENTS[1], "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65"]);
    assert.equal(change.actor, privateKeyToAccount(KEYS.treasury).address);
    const sent = body.activity.filter((a: { action: string }) => a.action === "run_sent");
    assert.deepEqual(sent[0].detail.verifiedWallets, [RECIPIENTS[0]]); // newest first: the junk list was filtered
    assert.deepEqual(sent[1].detail.verifiedWallets, [...RECIPIENTS]);
    assert.equal((await api("/api/activity", { method: "DELETE" })).status, 405);
    assert.equal((await api("/api/activity", { body: { action: "run_paid" } })).status, 405);
  });

  await step("saves company settings and rejects bad or extra fields", async () => {
    const ok = await api("/api/me", { method: "PATCH", body: { name: "Northwind Labs", payDay: 31 } });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.equal(ok.body.org.payDay, 31);
    assert.equal((await api("/api/me", { method: "PATCH", body: { payDay: 30 } })).status, 400);
    assert.equal((await api("/api/me", { method: "PATCH", body: { name: " " } })).status, 400);
    const takeover = await api("/api/me", { method: "PATCH", body: { ownerAddress: privateKeyToAccount(KEYS.otherCompany).address } });
    assert.equal(takeover.status, 400);
    assert.equal((await api("/api/me")).body.org.ownerAddress, privateKeyToAccount(KEYS.treasury).address);
    const cleared = await api("/api/me", { method: "PATCH", body: { payDay: null } });
    assert.equal(cleared.body.org.payDay, null);
    assert.equal(cleared.body.org.name, "Northwind Labs");
  });

  const addr = (k: keyof typeof KEYS) => privateKeyToAccount(KEYS[k]).address;
  const prep = client();
  const admin = client();
  const viewer = client();
  let run2: { id: string; onchainRef: Hex };
  let items2: RunItem[];
  let approval2: { message: string; signature: Hex };

  await step("the owner builds a team, and only the owner can change it", async () => {
    for (const [k, role, name] of [["admin", "admin", "Dana Okafor"], ["preparer", "preparer", "Sam Lee"], ["viewer", "viewer", "Ada (accountant)"]] as const) {
      const res = await api("/api/team", { body: { address: addr(k), name, role } });
      assert.equal(res.status, 201, JSON.stringify(res.body));
    }
    assert.equal((await api("/api/team", { body: { address: addr("admin"), name: "Again", role: "admin" } })).status, 409);
    assert.equal((await api("/api/team", { body: { address: addr("otherCompany"), name: "X", role: "owner" } })).status, 400);
    assert.equal((await api("/api/team/policy", { method: "PATCH", body: { approvalsRequired: 3 } })).status, 400); // only 2 can approve
    const policy = await api("/api/team/policy", { method: "PATCH", body: { approvalsRequired: 1, twoPerson: true } });
    assert.equal(policy.status, 200, JSON.stringify(policy.body));
    assert.equal(policy.body.org.approvalsRequired, 1);
    assert.equal(policy.body.org.twoPerson, true);
    const team = await api("/api/team");
    assert.deepEqual(team.body.members.map((m: { role: string }) => m.role), ["owner", "admin", "preparer", "viewer"]);
  });

  await step("a preparer signs in to the company and can prepare, but not approve, send or change the team", async () => {
    await signIn(prep, KEYS.preparer);
    const me = await prep("/api/me");
    assert.equal(me.body.role, "preparer");
    assert.equal(me.body.org.ownerAddress, addr("treasury"));
    assert.equal((await prep("/api/team/policy", { method: "PATCH", body: { approvalsRequired: 0 } })).status, 403);
    assert.equal((await prep("/api/team", { body: { address: addr("otherCompany"), name: "Mallory", role: "admin" } })).status, 403);
    assert.equal((await prep(`/api/team/${addr("admin")}`, { method: "DELETE" })).status, 403);
    assert.equal((await prep("/api/me", { method: "PATCH", body: { name: "Hijacked" } })).status, 403);
    const created = await prep("/api/runs", { body: { chainId: 31337 } });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    ({ run: run2, items: items2 } = created.body);
    // The accounts team must sign what it submits: no signature, someone else's, or a tampered message are refused.
    assert.equal((await prep(`/api/runs/${run2.id}/request`, { body: {} })).status, 400);
    const { body: pm } = await prep(`/api/runs/${run2.id}/request`);
    assert.match(pm.message, /Prepared by: /);
    const wrongKey = await privateKeyToAccount(KEYS.viewer).signMessage({ message: pm.message });
    assert.equal((await prep(`/api/runs/${run2.id}/request`, { body: { signature: wrongKey } })).status, 401);
    const tampered = await privateKeyToAccount(KEYS.preparer).signMessage({ message: pm.message.replace("Pay 3 people", "Pay 2 people") });
    assert.equal((await prep(`/api/runs/${run2.id}/request`, { body: { signature: tampered } })).status, 401);
    const requested = await submitSigned(prep, KEYS.preparer, run2.id, { verifiedWallets: [RECIPIENTS[0], "0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc"] });
    assert.equal(requested.status, 200, JSON.stringify(requested.body));
    assert.equal(requested.body.run.status, "pending");
    assert.match(requested.body.run.preparedSignature, /^0x/);
    assert.equal((await prep(`/api/runs/${run2.id}/approve`)).status, 403);
    assert.equal((await prep(`/api/runs/${run2.id}/submit`, { body: { txHash: `0x${"ab".repeat(32)}` } })).status, 403);
    // Two-person payroll: the treasury can't prepare a run itself.
    assert.equal((await api("/api/runs", { body: { chainId: 31337 } })).status, 403);
  });

  await step("the treasury can't send a payroll that hasn't been approved", async () => {
    const res = await api(`/api/runs/${run2.id}/submit`, { body: { txHash: `0x${"cd".repeat(32)}` } });
    assert.equal(res.status, 409);
    assert.match(res.body.error, /needs 1 sign-off/);
  });

  await step("approvals are wallet signatures the server checks against the exact run", async () => {
    await signIn(admin, KEYS.admin);
    await signIn(viewer, KEYS.viewer);
    assert.equal((await admin("/api/me")).body.role, "admin");
    const { body } = await admin(`/api/runs/${run2.id}/approve`);
    assert.match(body.message, /Pay 3 people/);
    assert.match(body.message, new RegExp(`Approver: ${addr("admin")}`));
    // Signed by the wrong wallet.
    const forged = await privateKeyToAccount(KEYS.viewer).signMessage({ message: body.message });
    assert.equal((await admin(`/api/runs/${run2.id}/approve`, { body: { signature: forged } })).status, 401);
    // Signed by the right wallet, but over different numbers.
    const tampered = await privateKeyToAccount(KEYS.admin).signMessage({ message: body.message.replace("Pay 3 people", "Pay 2 people") });
    assert.equal((await admin(`/api/runs/${run2.id}/approve`, { body: { signature: tampered } })).status, 401);
    assert.equal((await viewer(`/api/runs/${run2.id}/approve`)).status, 403);
    approval2 = { message: body.message, signature: await privateKeyToAccount(KEYS.admin).signMessage({ message: body.message }) };
    const ok = await admin(`/api/runs/${run2.id}/approve`, { body: { signature: approval2.signature } });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.equal(ok.body.run.status, "approved");
    assert.equal(ok.body.run.approvalCount, 1);
    assert.equal((await admin(`/api/runs/${run2.id}/approve`, { body: { signature: approval2.signature } })).body.run.approvalCount, 1);
    assert.equal((await admin(`/api/runs/${run2.id}/submit`, { body: { txHash: `0x${"ef".repeat(32)}` } })).status, 403);
    const detail = await viewer(`/api/runs/${run2.id}`);
    assert.equal(detail.body.approvals[0].approver, addr("admin"));
    assert.equal(detail.body.approvals[0].name, "Dana Okafor");
    assert.deepEqual(detail.body.verifiedWallets, [RECIPIENTS[0]]);
  });

  await step("viewers can read everything and change nothing", async () => {
    assert.equal((await viewer("/api/runs")).status, 200);
    assert.equal((await viewer("/api/invoices")).status, 200);
    assert.equal((await viewer("/api/employees", { body: { name: "X", wallet: RECIPIENTS[0], amount: "1", token: "USDC" } })).status, 403);
    assert.equal((await viewer("/api/runs", { body: { chainId: 31337 } })).status, 403);
    assert.equal((await viewer(`/api/runs/${run2.id}/cancel`, { body: {} })).status, 403);
  });

  await step("the treasury sends the approved payroll; it's verified and invoiced", async () => {
    const before = (await api("/api/invoices")).body.invoices.length;
    const tx = await pay(KEYS.treasury, run2.onchainRef, items2);
    const sent = await api(`/api/runs/${run2.id}/submit`, { body: { txHash: tx } });
    assert.equal(sent.status, 200, JSON.stringify(sent.body));
    const confirmed = await admin(`/api/runs/${run2.id}/confirm`, { body: {} });
    assert.equal(confirmed.body.run.status, "confirmed", JSON.stringify(confirmed.body));
    assert.equal((await api("/api/invoices")).body.invoices.length, before + 3);
  });

  await step("the contract pays a run once: sending the same payroll again reverts", async () => {
    await assert.rejects(pay(KEYS.treasury, run2.onchainRef, items2), /AlreadyPaid/);
  });

  await step("a payment the browser never reported is found on-chain and verified", async () => {
    const r = (await prep("/api/runs", { body: { chainId: 31337 } })).body;
    await submitSigned(prep, KEYS.preparer, r.run.id);
    const { body: m } = await admin(`/api/runs/${r.run.id}/approve`);
    await admin(`/api/runs/${r.run.id}/approve`, { body: { signature: await privateKeyToAccount(KEYS.admin).signMessage({ message: m.message }) } });
    const tx = await pay(KEYS.treasury, r.run.onchainRef, r.items); // paid, but /submit never called
    const confirmed = await viewer(`/api/runs/${r.run.id}/confirm`, { body: {} });
    assert.equal(confirmed.body.run.status, "confirmed", JSON.stringify(confirmed.body));
    assert.equal(confirmed.body.run.txHash, tx);
  });

  await step("only one payroll can wait for approval at a time, even from two drafts", async () => {
    const mine = (await admin("/api/runs", { body: { chainId: 31337 } })).body.run;
    const theirs = (await prep("/api/runs", { body: { chainId: 31337 } })).body.run;
    assert.equal((await submitSigned(prep, KEYS.preparer, theirs.id)).status, 200);
    const second = await submitSigned(admin, KEYS.admin, mine.id);
    assert.equal(second.status, 409);
    assert.match(second.body.error, /Another payroll/);
    assert.equal((await prep(`/api/runs/${theirs.id}/cancel`, { body: {} })).body.run.status, "cancelled");
    assert.equal((await admin(`/api/runs/${mine.id}/cancel`, { body: {} })).body.run.status, "cancelled");
  });

  await step("an approval can't be replayed on another run, and nobody approves their own payroll", async () => {
    const r3 = (await prep("/api/runs", { body: { chainId: 31337 } })).body.run;
    await submitSigned(prep, KEYS.preparer, r3.id, { verifiedWallets: [] });
    assert.equal((await admin(`/api/runs/${r3.id}/approve`, { body: { signature: approval2.signature } })).status, 401);
    const rejected = await admin(`/api/runs/${r3.id}/reject`, { body: { reason: "Wrong month" } });
    assert.equal(rejected.body.run.status, "rejected");
    assert.equal(rejected.body.run.rejection.reason, "Wrong month");
    // Promote the preparer to admin: they still can't approve the run they prepared.
    await api(`/api/team/${addr("preparer")}`, { method: "PATCH", body: { role: "admin" } });
    const r4 = (await prep("/api/runs", { body: { chainId: 31337 } })).body.run;
    await submitSigned(prep, KEYS.preparer, r4.id);
    const own = await prep(`/api/runs/${r4.id}/approve`);
    assert.equal(own.status, 403);
    assert.match(own.body.error, /someone else/);
    assert.equal((await prep(`/api/runs/${r4.id}/cancel`, { body: {} })).body.run.status, "cancelled");
    assert.equal((await api(`/api/team/${addr("treasury")}`, { method: "DELETE" })).status, 404); // the owner can't be removed
  });

  await step("whoever changes a payee's wallet can't approve the payroll that pays it", async () => {
    // The preparer is an admin by now (previous step), so they may edit People and approve.
    const people = (await prep("/api/employees")).body.employees;
    const target = people[0];
    const moved = await prep(`/api/employees/${target.id}`, {
      method: "PATCH",
      body: { name: target.name, role: target.role, amount: target.amount, token: target.token, email: target.email, address: target.address, taxId: target.taxId, wallet: "0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc" },
    });
    assert.equal(moved.status, 200, JSON.stringify(moved.body));
    const r = (await admin("/api/runs", { body: { chainId: 31337 } })).body.run;
    await submitSigned(admin, KEYS.admin, r.id);
    const blocked = await prep(`/api/runs/${r.id}/approve`);
    assert.equal(blocked.status, 403);
    assert.match(blocked.body.error, /changed the wallet/);
    // Someone who didn't touch it can.
    const { body: m } = await api(`/api/runs/${r.id}/approve`);
    const ok = await api(`/api/runs/${r.id}/approve`, { body: { signature: await privateKeyToAccount(KEYS.treasury).signMessage({ message: m.message }) } });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.equal((await api(`/api/runs/${r.id}/cancel`, { body: {} })).body.run.status, "cancelled");
  });

  await step("removing a teammate ends their access, and their approvals stop counting", async () => {
    const r5 = (await prep("/api/runs", { body: { chainId: 31337 } })).body.run;
    await submitSigned(prep, KEYS.preparer, r5.id);
    const { body: m5 } = await admin(`/api/runs/${r5.id}/approve`);
    const sig5 = await privateKeyToAccount(KEYS.admin).signMessage({ message: m5.message });
    assert.equal((await admin(`/api/runs/${r5.id}/approve`, { body: { signature: sig5 } })).body.run.approvalCount, 1);
    assert.equal((await api(`/api/team/${addr("admin")}`, { method: "DELETE" })).status, 200);
    const after = await admin("/api/runs");
    assert.equal(after.status, 401);
    assert.equal((await api(`/api/runs/${r5.id}`)).body.run.approvalCount, 0);
    const send = await api(`/api/runs/${r5.id}/submit`, { body: { txHash: `0x${"12".repeat(32)}` } });
    assert.equal(send.status, 409);
    assert.equal((await prep(`/api/runs/${r5.id}/cancel`, { body: {} })).body.run.status, "cancelled");
    const { body } = await api("/api/activity");
    const actions = body.activity.map((a: { action: string }) => a.action);
    for (const a of ["member_added", "policy_updated", "run_requested", "run_approved", "run_rejected", "run_cancelled", "member_updated", "member_removed"]) {
      assert.ok(actions.includes(a), `missing ${a}`);
    }
  });

  await step("two-person payroll: the accounts team signs, the treasury approves by sending", async () => {
    assert.equal((await api("/api/team/policy", { method: "PATCH", body: { approvalsRequired: 0 } })).status, 200);
    const r = (await prep("/api/runs", { body: { chainId: 31337 } })).body;
    const submitted = await submitSigned(prep, KEYS.preparer, r.run.id);
    assert.equal(submitted.body.run.status, "approved"); // straight to the treasury: no extra sign-offs
    const tx = await pay(KEYS.treasury, r.run.onchainRef, r.items);
    const sent = await api(`/api/runs/${r.run.id}/submit`, { body: { txHash: tx } });
    assert.equal(sent.status, 200, JSON.stringify(sent.body));
    assert.equal((await api(`/api/runs/${r.run.id}/confirm`, { body: {} })).body.run.status, "confirmed");
    const detail = await viewer(`/api/runs/${r.run.id}`);
    assert.equal(detail.body.run.createdBy, addr("preparer"));
    assert.equal(detail.body.run.submittedBy, addr("treasury"));
    assert.match(detail.body.run.preparedSignature, /^0x/);
  });

  await step("another company's wallet can't see this team", async () => {
    const other = client();
    await signIn(other, KEYS.otherCompany);
    const { body } = await other("/api/employees");
    assert.equal(body.employees.length, 0);
    // Trying to write into the first company by passing its id is ignored.
    const me = await api("/api/me");
    await other("/api/employees", { body: { name: "Intruder", wallet: "0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc", amount: "1", token: "USDC", orgId: me.body.org.id } });
    const mine = await api("/api/employees");
    assert.ok(!mine.body.employees.some((e: { name: string }) => e.name === "Intruder"));
    assert.equal((await other(`/api/runs/${run.id}`)).status, 404);
    assert.equal((await other("/api/records")).body.runs.length, 0);
    assert.equal((await other("/api/invoices")).body.invoices.length, 0);
    // Nor approve this company's payroll, or switch into it.
    assert.equal((await other(`/api/runs/${run.id}/approve`)).status, 404);
    assert.equal((await other("/api/session/switch", { body: { orgId: me.body.org.id } })).status, 403);
    const theirs = (await other("/api/activity")).body.activity;
    assert.ok(theirs.every((a: { actor: string }) => a.actor === privateKeyToAccount(KEYS.otherCompany).address));
  });

  await step("signing out ends the session on the server, even for a copied cookie", async () => {
    const copy = client();
    copy.jar.set("wf_session", api.jar.get("wf_session")!);
    assert.equal((await copy("/api/employees")).status, 200);
    await api("/api/auth/logout", { body: {} });
    assert.equal((await api("/api/employees")).status, 401);
    assert.equal((await copy("/api/employees")).status, 401);
  });

  console.log(`\n${passed} end-to-end checks passed`);
}

main().catch((err) => {
  console.error("\nEnd-to-end test FAILED:", err);
  process.exit(1);
});
