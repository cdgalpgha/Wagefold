/**
 * In-browser stand-in for the Next.js API routes, so the real UI runs inside a static artifact.
 * It reuses the app's own validation, money and payment-matching code, verifies SIWE signatures,
 * and confirms runs by reading the simulated chain's receipts, like the server reads Base.
 */
import { formatUnits, getAddress, parseEventLogs, verifyMessage, type Hex } from "viem";
import { parseSiweMessage } from "viem/siwe";
import { MAX_PAYMENTS, payrollAbi } from "@/lib/abi";
import { getChainConfig, TOKEN_DECIMALS, TOKEN_SYMBOLS, type TokenSymbol } from "@/lib/chains";
import { sumByToken } from "@/lib/money";
import { buildPayments, onchainRef, samePayments, type RunItem } from "@/lib/payments";
import type { Employee, Run } from "@/lib/types";
import { employeeInput, firstError } from "@/lib/validation";
import { freshChain, SimChain, type ChainState } from "./sim-chain";
import * as store from "./store";

type Org = { id: string; ownerAddress: string; name: string };
type AppState = {
  orgs: Org[];
  employees: (Employee & { orgId: string })[];
  runs: (Run & { orgId: string })[];
  items: Record<string, RunItem[]>;
  session: { address: string; orgId: string; chainId: number } | null;
  nonce: string | null;
};
type DemoState = { version: 1; chain: ChainState; app: AppState };

const SAMPLE_TEAM: Omit<Employee, "id">[] = [
  { name: "Priya Nair", role: "Head of Finance", wallet: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", amount: "9400", token: "USDC" },
  { name: "Maya Chen", role: "Senior Engineer", wallet: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC", amount: "12500", token: "USDC" },
  { name: "Tunde Bakare", role: "Backend Engineer", wallet: "0x90F79bf6EB2c4f870365E785982E1f101E93b906", amount: "9000", token: "USDC" },
  { name: "Lucía Gómez", role: "Product Designer", wallet: "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65", amount: "6900", token: "USDT" },
  { name: "Aisha Rahman", role: "Growth Marketer", wallet: "0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc", amount: "5600", token: "USDT" },
];

const fresh = (): DemoState => ({
  version: 1,
  chain: freshChain(),
  app: { orgs: [], employees: [], runs: [], items: {}, session: null, nonce: null },
});

const state: DemoState = store.load(fresh);
const persist = () => store.save(state);
export const chain = new SimChain(state.chain, persist);

export function resetDemo() {
  store.clear();
}

const uuid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : "xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx".replace(/x/g, () => Math.floor(Math.random() * 16).toString(16));

class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}
const need = <T>(v: T | null | undefined, status: number, message: string): T => {
  if (v === null || v === undefined) throw new HttpError(status, message);
  return v;
};
const session = () => need(state.app.session, 401, "Sign in with your wallet to continue.");
const publicRun = ({ orgId: _o, ...run }: Run & { orgId: string }): Run => run;
const publicEmployee = ({ orgId: _o, ...e }: Employee & { orgId: string }): Employee => e;

function employeeBody(body: unknown, orgId: string, exceptId?: string) {
  const parsed = employeeInput.safeParse(body);
  if (!parsed.success) throw new HttpError(400, firstError(parsed.error));
  const clash = state.app.employees.find(
    (e) => e.orgId === orgId && e.id !== exceptId && e.wallet.toLowerCase() === parsed.data.wallet.toLowerCase(),
  );
  if (clash) throw new HttpError(409, "Someone on your team already uses that wallet.");
  return parsed.data;
}

async function route(method: string, path: string, body: unknown): Promise<[number, unknown]> {
  const parts = path.replace(/^\/api\//, "").split("/");

  if (path === "/api/auth/nonce") {
    state.app.nonce = uuid().replace(/-/g, "");
    persist();
    return [200, { nonce: state.app.nonce }];
  }

  if (path === "/api/auth/verify" && method === "POST") {
    const { message, signature } = (body ?? {}) as { message?: string; signature?: Hex };
    if (!message || !signature) throw new HttpError(400, "Missing sign-in message or signature.");
    const nonce = need(state.app.nonce, 401, "Sign-in expired. Please try again.");
    const fields = parseSiweMessage(message);
    if (fields.nonce !== nonce) throw new HttpError(401, "Sign-in expired. Please try again.");
    if (fields.domain !== window.location.host) throw new HttpError(401, "This sign-in was made for a different site.");
    if (fields.expirationTime && fields.expirationTime.getTime() < Date.now()) throw new HttpError(401, "Sign-in expired. Please try again.");
    if (!fields.address || !getChainConfig(fields.chainId)) throw new HttpError(400, "Unsupported network.");
    const valid = await verifyMessage({ address: fields.address, message, signature });
    if (!valid) throw new HttpError(401, "We couldn't verify that signature.");
    const address = getAddress(fields.address);
    let org = state.app.orgs.find((o) => o.ownerAddress.toLowerCase() === address.toLowerCase());
    if (!org) {
      org = { id: uuid(), ownerAddress: address, name: "Northwind Labs" };
      state.app.orgs.push(org);
      // Example team so the demo opens in a working state. Edit or remove them freely.
      for (const e of SAMPLE_TEAM) state.app.employees.push({ ...e, id: uuid(), orgId: org.id });
    }
    state.app.session = { address, orgId: org.id, chainId: fields.chainId! };
    state.app.nonce = null;
    persist();
    return [200, { address, chainId: fields.chainId, org }];
  }

  if (path === "/api/auth/logout") {
    state.app.session = null;
    persist();
    return [200, { ok: true }];
  }

  const s = session();

  if (path === "/api/me") {
    const org = need(state.app.orgs.find((o) => o.id === s.orgId), 404, "Organization not found.");
    return [200, { address: s.address, chainId: s.chainId, org }];
  }

  if (parts[0] === "employees") {
    const mine = state.app.employees.filter((e) => e.orgId === s.orgId);
    if (parts.length === 1 && method === "GET") return [200, { employees: mine.map(publicEmployee) }];
    if (parts.length === 1 && method === "POST") {
      const rows = (body as { employees?: unknown[] } | null)?.employees;
      if (Array.isArray(rows)) {
        const created: Employee[] = [];
        const errors: { row: number; error: string }[] = [];
        rows.forEach((row, i) => {
          try {
            const data = employeeBody(row, s.orgId);
            const e = { ...data, id: uuid(), orgId: s.orgId };
            state.app.employees.push(e);
            created.push(publicEmployee(e));
          } catch (err) {
            errors.push({ row: i + 1, error: (err as Error).message });
          }
        });
        persist();
        return [created.length ? 201 : 400, { created, errors }];
      }
      const e = { ...employeeBody(body, s.orgId), id: uuid(), orgId: s.orgId };
      state.app.employees.push(e);
      persist();
      return [201, { employee: publicEmployee(e) }];
    }
    const target = need(mine.find((e) => e.id === parts[1]), 404, "Person not found.");
    if (method === "PATCH") {
      Object.assign(target, employeeBody(body, s.orgId, target.id));
      persist();
      return [200, { employee: publicEmployee(target) }];
    }
    if (method === "DELETE") {
      state.app.employees = state.app.employees.filter((e) => e !== target);
      persist();
      return [200, { ok: true }];
    }
  }

  if (parts[0] === "runs") {
    const mine = state.app.runs.filter((r) => r.orgId === s.orgId);
    if (parts.length === 1 && method === "GET") {
      const list = mine.filter((r) => r.status !== "draft").sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return [200, { runs: list.map(publicRun) }];
    }
    if (parts.length === 1 && method === "POST") {
      const cfg = need(getChainConfig((body as { chainId?: number })?.chainId), 400, "Payroll isn't available on this network.");
      const team = state.app.employees.filter((e) => e.orgId === s.orgId);
      if (!team.length) throw new HttpError(400, "Add people before running payroll.");
      if (team.length > MAX_PAYMENTS) throw new HttpError(400, `One run can pay up to ${MAX_PAYMENTS} people.`);
      state.app.runs = state.app.runs.filter((r) => !(r.orgId === s.orgId && r.status === "draft"));
      const sums = sumByToken(team);
      const id = uuid();
      const run: Run & { orgId: string } = {
        id,
        orgId: s.orgId,
        chainId: cfg.chain.id,
        onchainRef: onchainRef(id),
        status: "draft",
        failureReason: null,
        txHash: null,
        recipientCount: team.length,
        totals: Object.fromEntries(TOKEN_SYMBOLS.filter((t) => sums[t] > 0n).map((t) => [t, formatUnits(sums[t], TOKEN_DECIMALS)])),
        createdAt: new Date().toISOString(),
        confirmedAt: null,
      };
      const items: RunItem[] = team.map((e) => ({ name: e.name, role: e.role, wallet: e.wallet, amount: e.amount, token: e.token as TokenSymbol }));
      state.app.runs.push(run);
      state.app.items[id] = items;
      persist();
      return [201, { run: publicRun(run), items }];
    }
    const run = need(mine.find((r) => r.id === parts[1]), 404, "Payroll run not found.");
    const items = state.app.items[run.id] ?? [];
    if (parts.length === 2) return [200, { run: publicRun(run), items }];
    if (parts[2] === "submit") {
      const txHash = (body as { txHash?: string })?.txHash;
      if (!txHash || !/^0x[0-9a-fA-F]{64}$/.test(txHash)) throw new HttpError(400, "Missing transaction hash.");
      if (run.status !== "draft") throw new HttpError(409, "This run was already submitted.");
      Object.assign(run, { status: "submitted", txHash });
      persist();
      return [200, { run: publicRun(run) }];
    }
    if (parts[2] === "confirm") {
      if (run.status === "confirmed" || run.status === "failed") return [200, { run: publicRun(run) }];
      const cfg = need(getChainConfig(run.chainId), 500, "Network not configured.");
      const receipt = chain.getReceipt(run.txHash!);
      if (!receipt) return [202, { run: publicRun(run), pending: true }];
      const settle = (status: "confirmed" | "failed", reason: string | null = null) => {
        Object.assign(run, { status, failureReason: reason, confirmedAt: status === "confirmed" ? new Date().toISOString() : null });
        persist();
        return [200, { run: publicRun(run) }] as [number, unknown];
      };
      if (receipt.status !== "0x1") return settle("failed", "The transaction reverted. No one was paid.");
      const logs = parseEventLogs({ abi: payrollAbi, logs: receipt.logs as never });
      const ref = run.onchainRef.toLowerCase();
      const paid = logs.find((l) => l.eventName === "PayrollPaid" && l.args.runId.toLowerCase() === ref);
      if (!paid || paid.eventName !== "PayrollPaid") return settle("failed", "That transaction didn't pay this run.");
      if (paid.args.payer.toLowerCase() !== s.address.toLowerCase()) return settle("failed", "The run was paid from a different wallet.");
      const actual = logs.flatMap((l) =>
        l.eventName === "PaymentSent" && l.args.runId.toLowerCase() === ref ? [{ token: l.args.token, to: l.args.to, amount: l.args.amount }] : [],
      );
      if (!samePayments(buildPayments(items, cfg), actual)) return settle("failed", "The on-chain payments don't match this run.");
      return settle("confirmed");
    }
  }

  throw new HttpError(404, "Not found.");
}

/** Routes the app's `/api/*` fetches to the in-browser backend. Everything else goes to the network. */
export function installMockApi() {
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.pathname : input.url;
    const path = url.startsWith("/api/") ? url : null;
    if (!path) return realFetch(input, init);
    const method = (init?.method ?? "GET").toUpperCase();
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : null;
    await new Promise((r) => setTimeout(r, 120)); // network-ish latency
    try {
      const [status, payload] = await route(method, path.split("?")[0], body);
      return new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json" } });
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 500;
      return new Response(JSON.stringify({ error: (err as Error).message }), { status, headers: { "content-type": "application/json" } });
    }
  };
}
