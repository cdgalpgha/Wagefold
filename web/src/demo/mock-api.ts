/**
 * In-browser stand-in for the Next.js API routes, so the real UI runs inside a static artifact.
 * It reuses the app's own validation, money, payment-matching, role and approval code, verifies
 * SIWE and approval signatures, and confirms runs by reading the simulated chain's receipts, like
 * the server reads Base.
 */
import { formatEther, formatUnits, getAddress, hexToBigInt, isAddress, isHex, parseEventLogs, verifyMessage, type Hex } from "viem";
import { parseSiweMessage } from "viem/siwe";
import { MAX_PAYMENTS, payrollAbi } from "@/lib/abi";
import { personChanges } from "@/lib/activity";
import { approvalMessage, preparedMessage } from "@/lib/approvals";
import { reviewRun } from "@/lib/changes";
import { getChainConfig, TOKEN_DECIMALS, TOKEN_SYMBOLS, type TokenSymbol } from "@/lib/chains";
import { buildInvoice, DEFAULT_PREFIX, type Invoice } from "@/lib/invoices";
import { sumByToken } from "@/lib/money";
import { buildPayments, onchainRef, samePayments, type RunItem } from "@/lib/payments";
import { PAR } from "@/lib/records";
import { can, type Action, type Role } from "@/lib/roles";
import type { Activity, ActivityAction, Approval, Employee, Member, Org, Run } from "@/lib/types";
import { employeeInput, firstError, memberInput, memberPatchInput, orgPatchInput, policyInput } from "@/lib/validation";
import { APPROVER, freshChain, SimChain, TREASURY, type ChainState } from "./sim-chain";
import * as store from "./store";

type Stored<T> = T & { orgId: string };
type StoredRun = Stored<Run> & { verifiedWallets?: string[] };
type AppState = {
  orgs: Org[];
  members: Stored<Member>[];
  approvals: Record<string, (Approval & { message: string })[]>;
  activity: Stored<Activity>[];
  invoices: Stored<Invoice>[];
  employees: Stored<Employee>[];
  runs: StoredRun[];
  items: Record<string, RunItem[]>;
  session: { address: string; orgId: string; chainId: number } | null;
  nonce: string | null;
};
type DemoState = { version: 2; chain: ChainState; app: AppState };

const NO_BILLING = { email: "", address: "", taxId: "" };
const SAMPLE_TEAM: Omit<Employee, "id">[] = [
  { name: "Priya Nair", role: "Head of Finance", wallet: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", amount: "9400", token: "USDC", ...NO_BILLING },
  { name: "Maya Chen", role: "Senior Engineer", wallet: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC", amount: "12500", token: "USDC", ...NO_BILLING },
  { name: "Tunde Bakare", role: "Backend Engineer", wallet: "0x90F79bf6EB2c4f870365E785982E1f101E93b906", amount: "9000", token: "USDC", ...NO_BILLING },
  { name: "Lucía Gómez", role: "Product Designer", wallet: "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65", amount: "6900", token: "USDT", ...NO_BILLING },
  { name: "Aisha Rahman", role: "Growth Marketer", wallet: "0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc", amount: "5600", token: "USDT", ...NO_BILLING },
];

const uuid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : "xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx".replace(/x/g, () => Math.floor(Math.random() * 16).toString(16));

/** The example company: the treasury owns it and approves by sending; Dana on the accounts team prepares and signs. */
function fresh(): DemoState {
  const orgId = uuid();
  const now = new Date().toISOString();
  return {
    version: 2,
    chain: freshChain(),
    app: {
      orgs: [
        {
          id: orgId,
          ownerAddress: TREASURY,
          name: "Northwind Labs",
          payDay: 31,
          legalName: "Northwind Labs Ltd",
          address: "14 Harbour Street\nLondon EC2A 4NE\nUnited Kingdom",
          taxId: "GB 123 4567 89",
          invoicePrefix: "NW-",
          invoiceNote: null,
          approvalsRequired: 0,
          twoPerson: true,
        },
      ],
      members: [
        { orgId, address: TREASURY, name: "Treasury", role: "owner", addedBy: null, createdAt: now },
        { orgId, address: APPROVER, name: "Dana Okafor", role: "preparer", addedBy: TREASURY, createdAt: now },
      ],
      employees: SAMPLE_TEAM.map((e) => ({ ...e, id: uuid(), orgId })),
      approvals: {},
      activity: [],
      invoices: [],
      runs: [],
      items: {},
      session: null,
      nonce: null,
    },
  };
}

const state: DemoState = store.load(fresh);
const persist = () => store.save(state);
export const chain = new SimChain(state.chain, persist);

export function resetDemo() {
  store.clear();
}

class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}
const need = <T>(v: T | null | undefined, status: number, message: string): T => {
  if (v === null || v === undefined) throw new HttpError(status, message);
  return v;
};
const same = (a?: string | null, b?: string | null) => !!a && !!b && a.toLowerCase() === b.toLowerCase();
const strip = <T extends { orgId: string }>({ orgId: _o, ...rest }: T): Omit<T, "orgId"> => rest;
const publicRun = (r: StoredRun): Run => {
  const { orgId: _o, verifiedWallets: _v, ...run } = r;
  const valid = (state.app.approvals[r.id] ?? []).filter((x) => can(roleOf(r.orgId, x.approver), "approve"));
  return { ...run, approvalCount: valid.length };
};
const publicEmployee = (e: Stored<Employee>): Employee => ({ ...NO_BILLING, ...strip(e) });
const orgOf = (id: string) => need(state.app.orgs.find((o) => o.id === id), 404, "Organization not found.");
const roleOf = (orgId: string, address: string): Role | null =>
  state.app.members.find((m) => m.orgId === orgId && same(m.address, address))?.role ?? null;

/** Same rule as the server: the role is looked up on every request, never trusted from the session. */
function member(action: Action = "view") {
  const s = need(state.app.session, 401, "Sign in with your wallet to continue.");
  const role = need(roleOf(s.orgId, s.address), 401, "You're no longer on this company's team. Sign in again.");
  if (!can(role, action)) throw new HttpError(403, "Your role can't do that.");
  return { ...s, role };
}

/** Same rule as the server: wallets this person added or changed in People since the last paid run. */
function walletsChangedBy(orgId: string, actor: string): Set<string> {
  const since = state.app.runs
    .filter((r) => r.orgId === orgId && r.status === "confirmed")
    .reduce((max, r) => ((r.confirmedAt ?? "") > max ? r.confirmedAt ?? "" : max), "");
  const out = new Set<string>();
  const add = (w: unknown) => typeof w === "string" && out.add(w.toLowerCase());
  for (const a of state.app.activity) {
    if (a.orgId !== orgId || !same(a.actor, actor) || a.at <= since) continue;
    const d = a.detail;
    if (a.action === "person_added") add(d.wallet);
    if (a.action === "person_updated") add((d.changes as { wallet?: unknown[] } | undefined)?.wallet?.[1]);
    if (a.action === "people_imported" && Array.isArray(d.wallets)) d.wallets.forEach(add);
  }
  return out;
}

function log(orgId: string, actor: string, action: ActivityAction, detail: Record<string, unknown> = {}) {
  state.app.activity.push({ id: String(state.app.activity.length + 1), orgId, at: new Date().toISOString(), actor, action, detail });
}

function employeeBody(body: unknown, orgId: string, exceptId?: string) {
  const parsed = employeeInput.safeParse(body);
  if (!parsed.success) throw new HttpError(400, firstError(parsed.error));
  const clash = state.app.employees.find((e) => e.orgId === orgId && e.id !== exceptId && same(e.wallet, parsed.data.wallet));
  if (clash) throw new HttpError(409, "Someone on your team already uses that wallet.");
  return parsed.data;
}

function verifiedIn(value: unknown, items: RunItem[]): string[] {
  const inRun = new Set(items.map((i) => i.wallet.toLowerCase()));
  return Array.isArray(value)
    ? value.slice(0, MAX_PAYMENTS).filter((w): w is string => typeof w === "string" && isAddress(w, { strict: false }) && inRun.has(w.toLowerCase())).map((w) => getAddress(w))
    : [];
}

function paidHistory(orgId: string) {
  const paid = state.app.runs.filter((r) => r.orgId === orgId && r.status === "confirmed").sort((a, b) => (b.confirmedAt ?? "").localeCompare(a.confirmedAt ?? ""));
  return {
    previous: paid[0] ? state.app.items[paid[0].id] ?? null : null,
    wallets: paid.flatMap((r) => (state.app.items[r.id] ?? []).map((i) => ({ wallet: i.wallet, name: i.name }))),
  };
}

function messageFor(run: StoredRun, approver: string, build = approvalMessage) {
  const org = orgOf(run.orgId);
  return build({
    runId: run.id,
    onchainRef: run.onchainRef,
    items: state.app.items[run.id] ?? [],
    cfg: need(getChainConfig(run.chainId), 500, "Network not configured."),
    company: org.name,
    treasury: org.ownerAddress,
    approver,
  });
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
    // Same choice as the server: the company this wallet is on the team of, or a new one it owns.
    let membership = state.app.members.find((m) => same(m.address, address) && m.role !== "owner") ?? state.app.members.find((m) => same(m.address, address));
    if (!membership) {
      const id = uuid();
      state.app.orgs.push({ id, ownerAddress: address, name: "My company", payDay: null, legalName: null, address: null, taxId: null, invoicePrefix: DEFAULT_PREFIX, invoiceNote: null, approvalsRequired: 0, twoPerson: true });
      membership = { orgId: id, address, name: "", role: "owner", addedBy: null, createdAt: new Date().toISOString() };
      state.app.members.push(membership);
    }
    state.app.session = { address, orgId: membership.orgId, chainId: fields.chainId! };
    state.app.nonce = null;
    log(membership.orgId, address, "signed_in", { chainId: fields.chainId });
    persist();
    return [200, { address, chainId: fields.chainId, org: orgOf(membership.orgId) }];
  }

  if (path === "/api/auth/logout") {
    state.app.session = null;
    persist();
    return [200, { ok: true }];
  }

  if (path === "/api/me") {
    const s = member(method === "PATCH" ? "settings" : "view");
    const org = orgOf(s.orgId);
    if (method === "PATCH") {
      const parsed = orgPatchInput.safeParse(body);
      if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? "Invalid settings.");
      const changes: Record<string, [string, string]> = {};
      for (const [k, raw] of Object.entries(parsed.data) as [keyof typeof parsed.data, string | number | null][]) {
        const value = (k === "name" || k === "payDay" || k === "invoicePrefix" ? raw : raw === "" ? null : raw) as never;
        if (org[k] !== value) changes[k] = [String(org[k] ?? ""), String(value ?? "")];
        org[k] = value;
      }
      if (Object.keys(changes).length) log(s.orgId, s.address, "company_updated", { changes });
      persist();
      return [200, { org }];
    }
    const memberships = state.app.members
      .filter((m) => same(m.address, s.address))
      .map((m) => ({ orgId: m.orgId, name: orgOf(m.orgId).name, role: m.role }));
    return [200, { address: s.address, chainId: s.chainId, org, role: s.role, memberships }];
  }

  if (path === "/api/session/switch") {
    const s = member();
    const orgId = (body as { orgId?: string })?.orgId ?? "";
    if (!roleOf(orgId, s.address)) throw new HttpError(403, "You're not on that company's team.");
    state.app.session = { ...s, orgId };
    persist();
    return [200, { ok: true }];
  }

  if (parts[0] === "team") {
    if (parts.length === 1 && method === "GET") {
      const s = member();
      const order: Record<Role, number> = { owner: 0, admin: 1, preparer: 2, viewer: 3 };
      const members = state.app.members.filter((m) => m.orgId === s.orgId).sort((a, b) => order[a.role] - order[b.role]).map(strip);
      return [200, { members, approvalsRequired: orgOf(s.orgId).approvalsRequired }];
    }
    const s = member("team");
    if (parts[1] === "policy") {
      const parsed = policyInput.safeParse(body);
      if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? "Invalid payroll rule.");
      const { approvalsRequired: n, twoPerson } = parsed.data;
      const approvers = state.app.members.filter((m) => m.orgId === s.orgId && can(m.role, "approve")).length;
      if (n !== undefined && n > 0 && n > approvers - 1) throw new HttpError(400, `You need at least ${n + 1} people who can sign off for ${n} sign-off${n === 1 ? "" : "s"}. Add admins first.`);
      const org = orgOf(s.orgId);
      const changes: Record<string, [string, string]> = {};
      if (n !== undefined && org.approvalsRequired !== n) changes.approvalsRequired = [String(org.approvalsRequired), String(n)];
      if (twoPerson !== undefined && org.twoPerson !== twoPerson) changes.twoPerson = [org.twoPerson ? "on" : "off", twoPerson ? "on" : "off"];
      if (Object.keys(changes).length) log(s.orgId, s.address, "policy_updated", { changes });
      if (n !== undefined) org.approvalsRequired = n;
      if (twoPerson !== undefined) org.twoPerson = twoPerson;
      persist();
      return [200, { org }];
    }
    if (parts.length === 1 && method === "POST") {
      const parsed = memberInput.safeParse(body);
      if (!parsed.success) throw new HttpError(400, firstError(parsed.error));
      if (roleOf(s.orgId, parsed.data.address)) throw new HttpError(409, "That wallet is already on the team.");
      const m = { ...parsed.data, orgId: s.orgId, addedBy: s.address, createdAt: new Date().toISOString() };
      state.app.members.push(m);
      log(s.orgId, s.address, "member_added", { address: m.address, name: m.name, role: m.role });
      persist();
      return [201, { member: strip(m) }];
    }
    const target = need(
      state.app.members.find((m) => m.orgId === s.orgId && same(m.address, parts[1]) && m.role !== "owner"),
      404,
      "Teammate not found, or it's the owner.",
    );
    if (method === "PATCH") {
      const parsed = memberPatchInput.safeParse(body);
      if (!parsed.success) throw new HttpError(400, firstError(parsed.error));
      const before = { ...target };
      Object.assign(target, Object.fromEntries(Object.entries(parsed.data).filter(([, v]) => v !== undefined)));
      log(s.orgId, s.address, "member_updated", {
        address: target.address,
        name: target.name,
        changes: { ...(before.role !== target.role ? { role: [before.role, target.role] } : {}), ...(before.name !== target.name ? { name: [before.name, target.name] } : {}) },
      });
      persist();
      return [200, { member: strip(target) }];
    }
    if (method === "DELETE") {
      state.app.members = state.app.members.filter((m) => m !== target);
      log(s.orgId, s.address, "member_removed", { address: target.address, name: target.name, role: target.role });
      persist();
      return [200, { ok: true }];
    }
  }

  if (path === "/api/activity") {
    const s = member();
    const list = state.app.activity.filter((a) => a.orgId === s.orgId).slice(-200).reverse();
    return [200, { activity: list.map(strip) }];
  }

  if (path === "/api/invoices") {
    const s = member();
    issueInvoices(s.orgId);
    persist();
    const list = state.app.invoices.filter((v) => v.orgId === s.orgId).sort((a, b) => b.number - a.number);
    return [200, { invoices: list.map(strip) }];
  }

  if (path === "/api/records") {
    const s = member();
    const runs = state.app.runs
      .filter((r) => r.orgId === s.orgId && r.status === "confirmed")
      .sort((a, b) => (a.paidAt ?? "").localeCompare(b.paidAt ?? ""))
      .map((r) => ({ run: publicRun(r), items: state.app.items[r.id] ?? [] }));
    return [200, { org: orgOf(s.orgId), runs }];
  }

  if (parts[0] === "employees") {
    const s = member(method === "GET" ? "view" : "editPeople");
    const mine = state.app.employees.filter((e) => e.orgId === s.orgId);
    if (parts.length === 1 && method === "GET") return [200, { employees: mine.map(publicEmployee) }];
    if (parts.length === 1 && method === "POST") {
      const rows = (body as { employees?: unknown[] } | null)?.employees;
      if (mine.length + (Array.isArray(rows) ? rows.length : 1) > 2000) throw new HttpError(400, "A company can have up to 2000 people.");
      if (Array.isArray(rows)) {
        const created: Employee[] = [];
        const errors: { row: number; error: string }[] = [];
        rows.forEach((row, i) => {
          try {
            const e = { ...employeeBody(row, s.orgId), id: uuid(), orgId: s.orgId };
            state.app.employees.push(e);
            created.push(publicEmployee(e));
          } catch (err) {
            errors.push({ row: i + 1, error: (err as Error).message });
          }
        });
        if (created.length) log(s.orgId, s.address, "people_imported", { count: created.length, wallets: created.map((e) => e.wallet) });
        persist();
        return [created.length ? 201 : 400, { created, errors }];
      }
      const e = { ...employeeBody(body, s.orgId), id: uuid(), orgId: s.orgId };
      state.app.employees.push(e);
      log(s.orgId, s.address, "person_added", { employeeId: e.id, name: e.name, wallet: e.wallet, amount: e.amount, token: e.token });
      persist();
      return [201, { employee: publicEmployee(e) }];
    }
    const target = need(mine.find((e) => e.id === parts[1]), 404, "Person not found.");
    if (method === "PATCH") {
      const before = { ...target };
      Object.assign(target, employeeBody(body, s.orgId, target.id));
      const changes = personChanges(before, target);
      if (Object.keys(changes).length) log(s.orgId, s.address, "person_updated", { employeeId: target.id, name: target.name, changes });
      persist();
      return [200, { employee: publicEmployee(target) }];
    }
    if (method === "DELETE") {
      state.app.employees = state.app.employees.filter((e) => e !== target);
      log(s.orgId, s.address, "person_removed", { employeeId: target.id, name: target.name, wallet: target.wallet, amount: target.amount, token: target.token });
      persist();
      return [200, { ok: true }];
    }
  }

  if (parts[0] === "runs") {
    if (parts.length === 1 && method === "GET") {
      const s = member();
      const list = state.app.runs.filter((r) => r.orgId === s.orgId && r.status !== "draft").sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return [200, { runs: list.map(publicRun) }];
    }
    if (parts.length === 1 && method === "POST") {
      const s = member("prepare");
      const owner = orgOf(s.orgId);
      if (owner.twoPerson && same(owner.ownerAddress, s.address)) {
        throw new HttpError(403, "Two-person payroll is on: your accounts team prepares and signs payroll, and you approve it by sending.");
      }
      const open = state.app.runs.find((r) => r.orgId === s.orgId && ["pending", "approved", "submitted"].includes(r.status));
      if (open) return [409, { error: "A payroll is already waiting for approval or being sent. Finish or cancel it first.", openRunId: open.id }];
      const cfg = need(getChainConfig((body as { chainId?: number })?.chainId), 400, "Payroll isn't available on this network.");
      const team = state.app.employees.filter((e) => e.orgId === s.orgId);
      if (!team.length) throw new HttpError(400, "Add people before running payroll.");
      if (team.length > MAX_PAYMENTS) throw new HttpError(400, `One run can pay up to ${MAX_PAYMENTS} people.`);
      state.app.runs = state.app.runs.filter((r) => !(r.orgId === s.orgId && r.status === "draft" && same(r.createdBy, s.address)));
      const sums = sumByToken(team);
      const id = uuid();
      const run: StoredRun = {
        id,
        orgId: s.orgId,
        chainId: cfg.chain.id,
        onchainRef: onchainRef(id),
        status: "draft",
        failureReason: null,
        txHash: null,
        safeTxHash: null,
        recipientCount: team.length,
        totals: Object.fromEntries(TOKEN_SYMBOLS.filter((t) => sums[t] > 0n).map((t) => [t, formatUnits(sums[t], TOKEN_DECIMALS)])),
        createdAt: new Date().toISOString(),
        confirmedAt: null,
        paidAt: null,
        blockNumber: null,
        networkFee: null,
        usdRates: null,
        createdBy: s.address,
        requestedAt: null,
        submittedBy: null,
        approvalCount: 0,
        rejection: null,
        preparedSignature: null,
      };
      const items: RunItem[] = team.map((e) => ({ name: e.name, role: e.role, wallet: e.wallet, amount: e.amount, token: e.token as TokenSymbol, employeeId: e.id }));
      const h = paidHistory(s.orgId);
      state.app.runs.push(run);
      state.app.items[id] = items;
      persist();
      return [201, { run: publicRun(run), items, review: reviewRun(h.previous, items, h.wallets) }];
    }

    const s = member();
    const run = need(state.app.runs.find((r) => r.orgId === s.orgId && r.id === parts[1]), 404, "Payroll run not found.");
    const items = state.app.items[run.id] ?? [];
    const org = orgOf(s.orgId);
    const stored = () => (state.app.approvals[run.id] ??= []);
    // Same rule as the server: only approvals from current owners and admins count.
    const approvals = () => stored().filter((x) => can(roleOf(s.orgId, x.approver), "approve"));

    if (parts.length === 2) {
      const open = ["draft", "pending", "approved"].includes(run.status);
      const h = paidHistory(s.orgId);
      return [
        200,
        {
          run: publicRun(run),
          items,
          approvals: approvals().map(({ message: _m, ...a }) => ({ ...a, name: state.app.members.find((m) => m.orgId === s.orgId && same(m.address, a.approver))?.name ?? "" })),
          approvalsRequired: org.approvalsRequired,
          review: open ? reviewRun(h.previous, items, h.wallets) : { firstRun: false, changes: [], newWallets: [], lookalikes: [] },
          verifiedWallets: run.verifiedWallets ?? [],
        },
      ];
    }

    if (parts[2] === "request") {
      member("prepare");
      if (!same(run.createdBy, s.address)) throw new HttpError(403, "Only the person who prepared this draft can submit it.");
      const isTreasury = same(org.ownerAddress, s.address);
      if (isTreasury && org.twoPerson) throw new HttpError(403, "Two-person payroll is on: your accounts team prepares and signs payroll, and you approve it by sending.");
      const prepared = messageFor(run, s.address, preparedMessage);
      if (method === "GET") return [200, { message: prepared }];
      if (run.status !== "draft") throw new HttpError(409, "This draft was already submitted, or it's no longer a draft.");
      if (!isTreasury) {
        // Same rule as the server: everyone but the treasury signs exactly what they submit.
        const signature = (body as { signature?: string })?.signature;
        if (!signature || !isHex(signature)) throw new HttpError(400, "Sign the payroll with your wallet to submit it.");
        const valid = await verifyMessage({ address: s.address as Hex, message: prepared, signature });
        if (!valid) throw new HttpError(401, "That signature isn't a valid signature of this payroll from your wallet.");
        run.preparedSignature = signature;
      }
      if (state.app.runs.some((r) => r.orgId === s.orgId && r.id !== run.id && ["pending", "approved", "submitted"].includes(r.status))) {
        throw new HttpError(409, "Another payroll is already waiting for approval or being sent. Finish or cancel it first.");
      }
      run.verifiedWallets = verifiedIn((body as { verifiedWallets?: unknown })?.verifiedWallets, items);
      Object.assign(run, { requestedAt: new Date().toISOString(), status: org.approvalsRequired === 0 ? "approved" : "pending" });
      log(s.orgId, s.address, "run_requested", { runId: run.id, recipients: run.recipientCount, totals: run.totals, verifiedWallets: run.verifiedWallets, signed: !!run.preparedSignature, status: run.status });
      persist();
      return [200, { run: publicRun(run) }];
    }

    if (parts[2] === "approve") {
      member("approve");
      if (!["pending", "approved"].includes(run.status)) throw new HttpError(409, "This payroll isn't waiting for approval.");
      if (same(run.createdBy, s.address)) throw new HttpError(403, "You prepared this payroll, so someone else has to approve it.");
      const changed = walletsChangedBy(s.orgId, s.address);
      const touched = items.filter((i) => changed.has(i.wallet.toLowerCase()));
      if (touched.length) {
        throw new HttpError(403, `You added or changed the wallet for ${touched.slice(0, 3).map((i) => i.name).join(", ")} since the last payroll, so someone else has to approve this one.`);
      }
      const message = messageFor(run, s.address);
      if (method === "GET") return [200, { message }];
      const signature = (body as { signature?: string })?.signature;
      if (!signature || !isHex(signature)) throw new HttpError(400, "Missing approval signature.");
      const valid = await verifyMessage({ address: s.address as Hex, message, signature });
      if (!valid) throw new HttpError(401, "That signature isn't a valid approval of this payroll from your wallet.");
      if (!stored().some((a) => same(a.approver, s.address))) stored().push({ approver: s.address, name: "", at: new Date().toISOString(), signature, message });
      if (approvals().length >= org.approvalsRequired) run.status = "approved";
      log(s.orgId, s.address, "run_approved", { runId: run.id, approvals: approvals().length, status: run.status });
      persist();
      return [200, { run: publicRun(run) }];
    }

    if (parts[2] === "reject") {
      member("approve");
      if (same(run.createdBy, s.address)) throw new HttpError(403, "You prepared this payroll. Cancel it instead.");
      if (!["pending", "approved"].includes(run.status)) throw new HttpError(409, "This payroll isn't waiting for approval.");
      const reason = String((body as { reason?: unknown })?.reason ?? "").trim().replace(/\s+/g, " ").slice(0, 300);
      if (!reason) throw new HttpError(400, "Say why, so the preparer knows what to fix.");
      Object.assign(run, { status: "rejected", rejection: { by: s.address, reason, at: new Date().toISOString() } });
      log(s.orgId, s.address, "run_rejected", { runId: run.id, reason });
      persist();
      return [200, { run: publicRun(run) }];
    }

    if (parts[2] === "cancel") {
      member("prepare");
      if (!same(run.createdBy, s.address) && s.role !== "owner") throw new HttpError(403, "Only the person who prepared it, or the owner, can cancel it.");
      if (!["draft", "pending", "approved"].includes(run.status)) throw new HttpError(409, "This payroll can't be cancelled any more.");
      run.status = "cancelled";
      log(s.orgId, s.address, "run_cancelled", { runId: run.id });
      persist();
      return [200, { run: publicRun(run) }];
    }

    if (parts[2] === "submit") {
      member("send");
      if (!same(org.ownerAddress, s.address)) throw new HttpError(403, "Only the treasury wallet can send payroll.");
      const txHash = (body as { txHash?: string })?.txHash;
      if (!txHash || !/^0x[0-9a-fA-F]{64}$/.test(txHash)) throw new HttpError(400, "Missing transaction hash.");
      // Same rules as the server: two-person payroll never lets the treasury send what it prepared.
      if (org.twoPerson && same(run.createdBy, s.address)) throw new HttpError(403, "Two-person payroll is on, so the treasury can't send a payroll it prepared.");
      if (!same(run.createdBy, org.ownerAddress) && !run.preparedSignature) throw new HttpError(409, "Your accounts team has to sign and submit this payroll first.");
      const sendable = ["pending", "approved", "submitted"].includes(run.status) || (run.status === "draft" && !org.twoPerson && org.approvalsRequired === 0);
      if (!sendable || approvals().length < org.approvalsRequired) {
        throw new HttpError(409, `This payroll needs ${org.approvalsRequired} sign-off${org.approvalsRequired === 1 ? "" : "s"} before it can be sent.`);
      }
      if (run.status === "draft") run.verifiedWallets = verifiedIn((body as { verifiedWallets?: unknown })?.verifiedWallets, items);
      Object.assign(run, { status: "submitted", txHash, submittedBy: s.address });
      log(s.orgId, s.address, "run_sent", { runId: run.id, txHash, recipients: run.recipientCount, totals: run.totals, approvals: approvals().length, verifiedWallets: run.verifiedWallets });
      persist();
      return [200, { run: publicRun(run) }];
    }

    if (parts[2] === "confirm") {
      if (run.status === "confirmed" || run.status === "failed") return [200, { run: publicRun(run) }];
      const cfg = need(getChainConfig(run.chainId), 500, "Network not configured.");
      const receipt = chain.getReceipt(run.txHash!);
      if (!receipt) return [202, { run: publicRun(run), pending: true }];
      const settle = (status: "confirmed" | "failed", reason: string | null = null) => {
        const now = new Date().toISOString();
        Object.assign(run, { status, failureReason: reason, confirmedAt: status === "confirmed" ? now : null });
        if (status === "confirmed") {
          const tokens = [...new Set(items.map((i) => i.token))];
          Object.assign(run, {
            paidAt: now,
            blockNumber: hexToBigInt(receipt.blockNumber as Hex).toString(),
            networkFee: formatEther(hexToBigInt(receipt.gasUsed as Hex) * hexToBigInt(receipt.effectiveGasPrice as Hex)),
            usdRates: Object.fromEntries(tokens.map((t) => [t, PAR])),
          });
        }
        log(s.orgId, s.address, status === "confirmed" ? "run_paid" : "run_failed", { runId: run.id, txHash: run.txHash, ...(reason ? { reason } : {}) });
        if (status === "confirmed") issueInvoices(s.orgId);
        persist();
        return [200, { run: publicRun(run) }] as [number, unknown];
      };
      if (receipt.status !== "0x1") return settle("failed", "The transaction reverted. No one was paid.");
      const logs = parseEventLogs({ abi: payrollAbi, logs: receipt.logs as never });
      const ref = run.onchainRef.toLowerCase();
      const paid = logs.find((l) => l.eventName === "PayrollPaid" && l.args.runId.toLowerCase() === ref);
      if (!paid || paid.eventName !== "PayrollPaid") return settle("failed", "That transaction didn't pay this run.");
      if (!same(paid.args.payer, org.ownerAddress)) return settle("failed", "The run was paid from a different wallet than the treasury.");
      const actual = logs.flatMap((l) =>
        l.eventName === "PaymentSent" && l.args.runId.toLowerCase() === ref ? [{ token: l.args.token, to: l.args.to, amount: l.args.amount }] : [],
      );
      if (!samePayments(buildPayments(items, cfg), actual)) return settle("failed", "The on-chain payments don't match this run.");
      return settle("confirmed");
    }
  }

  throw new HttpError(404, "Not found.");
}

/** Same rule as the server: one invoice per paid payment, numbered in order, never edited after issue. */
function issueInvoices(orgId: string) {
  const org = state.app.orgs.find((o) => o.id === orgId);
  if (!org) return;
  const mine = state.app.invoices.filter((v) => v.orgId === orgId);
  const have = new Set(mine.map((v) => `${v.runId}:${v.position}`));
  let next = mine.reduce((n, v) => Math.max(n, v.number), 0) + 1;
  const paid = state.app.runs.filter((r) => r.orgId === orgId && r.status === "confirmed").sort((a, b) => (a.paidAt ?? "").localeCompare(b.paidAt ?? ""));
  for (const run of paid) {
    (state.app.items[run.id] ?? []).forEach((item, position) => {
      if (have.has(`${run.id}:${position}`)) return;
      const person = state.app.employees.find((e) => e.id === item.employeeId);
      const data = buildInvoice(org, run, item, person, next);
      state.app.invoices.push({ id: uuid(), orgId, number: next, runId: run.id, position, issuedAt: data.issuedAt, data });
      next++;
    });
  }
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
