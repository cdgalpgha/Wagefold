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
  return async function call<T = any>(p: string, init: { method?: string; body?: unknown; headers?: Record<string, string> } = {}) {
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
  };
}

async function signIn(call: ReturnType<typeof client>, key: Hex) {
  const account = privateKeyToAccount(key);
  const { body } = await call<{ nonce: string }>("/api/auth/nonce");
  const message = createSiweMessage({
    address: account.address,
    chainId: hardhat.id,
    domain: new URL(BASE).host,
    uri: BASE,
    nonce: body.nonce,
    version: "1",
  });
  const signature = await account.signMessage({ message });
  const res = await call("/api/auth/verify", { body: { message, signature } });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return account;
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
    const message = createSiweMessage({ address: victim.address, chainId: 31337, domain: new URL(BASE).host, uri: BASE, nonce: body.nonce, version: "1" });
    const res = await forger("/api/auth/verify", { body: { message, signature: await attacker.signMessage({ message }) } });
    assert.equal(res.status, 401);
  });

  await step("rejects a signature collected by a phishing site and replayed with a spoofed host header", async () => {
    const attacker = client();
    const { body } = await attacker<{ nonce: string }>("/api/auth/nonce");
    const victim = privateKeyToAccount(KEYS.treasury);
    // The victim signs a normal-looking sign-in on evil.example; the wallet shows no warning because the domain matches.
    const message = createSiweMessage({ address: victim.address, chainId: 31337, domain: "evil.example", uri: "https://evil.example", nonce: body.nonce, version: "1" });
    const signature = await victim.signMessage({ message });
    const res = await attacker("/api/auth/verify", { body: { message, signature }, headers: { "x-forwarded-host": "evil.example" } });
    assert.equal(res.status, 401, JSON.stringify(res.body));
  });

  await step("sends anti-clickjacking and no-cache headers", async () => {
    const page = await fetch(BASE + "/");
    assert.match(page.headers.get("content-security-policy") ?? "", /frame-ancestors 'self' https:\/\/app\.safe\.global/);
    assert.equal(page.headers.get("x-content-type-options"), "nosniff");
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
          { name: "Priya Nair", role: "Head of Finance", wallet: RECIPIENTS[0], amount: "9,400", token: "USDC" },
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
    const theirs = (await other("/api/activity")).body.activity;
    assert.ok(theirs.every((a: { actor: string }) => a.actor === privateKeyToAccount(KEYS.otherCompany).address));
  });

  await step("signing out ends the session", async () => {
    await api("/api/auth/logout", { body: {} });
    assert.equal((await api("/api/employees")).status, 401);
  });

  console.log(`\n${passed} end-to-end checks passed`);
}

main().catch((err) => {
  console.error("\nEnd-to-end test FAILED:", err);
  process.exit(1);
});
