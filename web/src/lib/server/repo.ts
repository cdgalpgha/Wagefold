import "server-only";
import { formatEther } from "viem";
import type { TokenSymbol } from "../chains";
import { buildInvoice, type Invoice, type InvoiceData } from "../invoices";
import type { Known } from "../lookalike";
import type { AssignableRole, Role } from "../roles";
import type { Approval, Member, Membership, Org, Run as PublicRun, RunStatus as PublicRunStatus } from "../types";
import { canonical } from "../money";
import { onchainRef, type RunItem } from "../payments";
import type { EmployeeInput } from "../validation";
import { getDb } from "./db";

export type Organization = Org;
export type Employee = {
  id: string;
  name: string;
  role: string;
  wallet: string;
  amount: string;
  token: TokenSymbol;
  email: string;
  address: string;
  taxId: string;
};
export type RunStatus = PublicRunStatus;
export type Run = PublicRun;
export type RunRecord = {
  paidAt: Date;
  blockNumber: bigint;
  networkFeeWei: bigint;
  usdRates: Partial<Record<TokenSymbol, { rate: string; source: string }>>;
};

type EmployeeRow = Omit<Employee, "taxId"> & { tax_id: string };
const EMPLOYEE_COLUMNS = `id, name, role, wallet, amount::text as amount, token, email, address, tax_id`;
type RunRow = {
  id: string;
  chain_id: number;
  onchain_ref: string;
  status: RunStatus;
  failure_reason: string | null;
  tx_hash: string | null;
  safe_tx_hash: string | null;
  recipient_count: number;
  totals: Record<string, string> | string;
  created_at: Date | string;
  confirmed_at: Date | string | null;
  paid_at: Date | string | null;
  block_number: string | null;
  network_fee_wei: string | null;
  usd_rates: RunRecord["usdRates"] | string | null;
  created_by: string | null;
  requested_at: Date | string | null;
  submitted_by: string | null;
  rejection: Run["rejection"] | string | null;
  approval_count: number | string;
  prepared_signature: string | null;
};

const json = <T>(v: T | string | null): T | null => (typeof v === "string" ? (JSON.parse(v) as T) : v);

const iso = (d: Date | string | null) => (d === null ? null : new Date(d).toISOString());

const toEmployee = ({ tax_id, ...r }: EmployeeRow): Employee => ({ ...r, taxId: tax_id, amount: canonical(r.amount) });
const toRun = (r: RunRow): Run => ({
  id: r.id,
  chainId: r.chain_id,
  onchainRef: r.onchain_ref as `0x${string}`,
  status: r.status,
  failureReason: r.failure_reason,
  txHash: r.tx_hash as `0x${string}` | null,
  safeTxHash: r.safe_tx_hash,
  recipientCount: r.recipient_count,
  totals: typeof r.totals === "string" ? JSON.parse(r.totals) : r.totals,
  createdAt: iso(r.created_at)!,
  confirmedAt: iso(r.confirmed_at),
  paidAt: iso(r.paid_at),
  blockNumber: r.block_number,
  networkFee: r.network_fee_wei === null ? null : formatEther(BigInt(r.network_fee_wei)),
  usdRates: json(r.usd_rates),
  createdBy: r.created_by,
  requestedAt: iso(r.requested_at),
  submittedBy: r.submitted_by,
  approvalCount: Number(r.approval_count),
  rejection: json(r.rejection),
  preparedSignature: r.prepared_signature,
});

export class DuplicateWalletError extends Error {}
export class OpenRunError extends Error {
  constructor() {
    super("Another payroll is already waiting for approval or being sent. Finish or cancel it first.");
  }
}

/** The company runs payroll alone: two-person payroll is off. */
const SOLO = `not (select two_person from organizations where id = $1)`;

/** No other run of this company is in flight. Also enforced by a unique index (db.ts). */
const NO_OTHER_OPEN_RUN = `not exists (select 1 from payroll_runs o where o.org_id = $1 and o.id <> $2
  and o.status in ('pending', 'approved', 'submitted'))`;

function isUniqueViolation(err: unknown) {
  return typeof err === "object" && err !== null && "code" in err && (err as { code: string }).code === "23505";
}

// Organizations ----------------------------------------------------------------------------------

type OrgRow = {
  id: string;
  owner_address: string;
  name: string;
  pay_day: number | null;
  legal_name: string | null;
  address: string | null;
  tax_id: string | null;
  invoice_prefix: string;
  invoice_note: string | null;
  approvals_required: number;
  two_person: boolean;
};
const ORG_COLUMNS = `id, owner_address, name, pay_day, legal_name, address, tax_id, invoice_prefix, invoice_note, approvals_required, two_person`;
const toOrg = (r: OrgRow): Organization => ({
  id: r.id,
  ownerAddress: r.owner_address,
  name: r.name,
  payDay: r.pay_day,
  legalName: r.legal_name,
  address: r.address,
  taxId: r.tax_id,
  invoicePrefix: r.invoice_prefix,
  invoiceNote: r.invoice_note,
  approvalsRequired: r.approvals_required,
  twoPerson: r.two_person,
});

/** The company this wallet owns, created on first sign-in, with the wallet as its owner member. */
export async function upsertOrganization(ownerAddress: string): Promise<Organization> {
  const db = await getDb();
  const { rows } = await db.query<OrgRow>(
    `insert into organizations (owner_address) values ($1)
     on conflict (owner_address) do update set owner_address = excluded.owner_address
     returning ${ORG_COLUMNS}`,
    [ownerAddress],
  );
  await db.query(`insert into members (org_id, address, role) values ($1, $2, 'owner') on conflict do nothing`, [rows[0].id, ownerAddress]);
  return toOrg(rows[0]);
}

// Team -------------------------------------------------------------------------------------------

type MemberRow = { address: string; name: string; role: Role; added_by: string | null; created_at: Date | string };
const toMember = (r: MemberRow): Member => ({ address: r.address, name: r.name, role: r.role, addedBy: r.added_by, createdAt: iso(r.created_at)! });

/** Every company this wallet belongs to, with its role there. */
export async function membershipsFor(address: string): Promise<(Membership & { employees: number })[]> {
  const db = await getDb();
  const { rows } = await db.query<{ org_id: string; name: string; role: Role; employees: number | string }>(
    `select m.org_id::text as org_id, o.name, m.role,
       (select count(*) from employees e where e.org_id = m.org_id) as employees
     from members m join organizations o on o.id = m.org_id
     where lower(m.address) = lower($1) order by m.created_at`,
    [address],
  );
  return rows.map((r) => ({ orgId: r.org_id, name: r.name, role: r.role, employees: Number(r.employees) }));
}

/** This wallet's role in this company, or null if it isn't (or is no longer) a member. */
export async function roleOf(orgId: string, address: string): Promise<Role | null> {
  const db = await getDb();
  const { rows } = await db.query<{ role: Role }>(`select role from members where org_id = $1 and lower(address) = lower($2)`, [orgId, address]);
  return rows[0]?.role ?? null;
}

export async function listMembers(orgId: string): Promise<Member[]> {
  const db = await getDb();
  const { rows } = await db.query<MemberRow>(
    `select address, name, role, added_by, created_at from members where org_id = $1
     order by case role when 'owner' then 0 when 'admin' then 1 when 'preparer' then 2 else 3 end, created_at`,
    [orgId],
  );
  return rows.map(toMember);
}

export class MemberExistsError extends Error {}

export async function addMember(orgId: string, input: { address: string; name: string; role: AssignableRole }, addedBy: string): Promise<Member> {
  const db = await getDb();
  try {
    const { rows } = await db.query<MemberRow>(
      `insert into members (org_id, address, name, role, added_by) values ($1, $2, $3, $4, $5)
       returning address, name, role, added_by, created_at`,
      [orgId, input.address, input.name, input.role, addedBy],
    );
    return toMember(rows[0]);
  } catch (err) {
    if (isUniqueViolation(err)) throw new MemberExistsError("That wallet is already on the team.");
    throw err;
  }
}

/** Changes a teammate's name or role. The owner row can't be changed or removed here. */
export async function updateMember(orgId: string, address: string, patch: { name?: string; role?: AssignableRole }): Promise<Member | null> {
  const db = await getDb();
  const { rows } = await db.query<MemberRow>(
    `update members set name = coalesce($3, name), role = coalesce($4, role)
     where org_id = $1 and lower(address) = lower($2) and role <> 'owner'
     returning address, name, role, added_by, created_at`,
    [orgId, address, patch.name ?? null, patch.role ?? null],
  );
  return rows[0] ? toMember(rows[0]) : null;
}

export async function removeMember(orgId: string, address: string): Promise<Member | null> {
  const db = await getDb();
  const { rows } = await db.query<MemberRow>(
    `delete from members where org_id = $1 and lower(address) = lower($2) and role <> 'owner'
     returning address, name, role, added_by, created_at`,
    [orgId, address],
  );
  return rows[0] ? toMember(rows[0]) : null;
}

/** The payroll rule: extra admin sign-offs, and whether two people (accounts and treasury) are required. */
export async function setPolicy(orgId: string, policy: { approvalsRequired?: number; twoPerson?: boolean }): Promise<Organization | null> {
  const db = await getDb();
  const { rows } = await db.query<OrgRow>(
    `update organizations set approvals_required = coalesce($2, approvals_required), two_person = coalesce($3, two_person)
     where id = $1 returning ${ORG_COLUMNS}`,
    [orgId, policy.approvalsRequired ?? null, policy.twoPerson ?? null],
  );
  return rows[0] ? toOrg(rows[0]) : null;
}

export async function getOrganization(orgId: string): Promise<Organization | null> {
  const db = await getDb();
  const { rows } = await db.query<OrgRow>(`select ${ORG_COLUMNS} from organizations where id = $1`, [orgId]);
  return rows[0] ? toOrg(rows[0]) : null;
}

export type OrgPatch = {
  name?: string;
  payDay?: number | null;
  legalName?: string;
  address?: string;
  taxId?: string;
  invoicePrefix?: string;
  invoiceNote?: string;
};

export async function updateOrganization(orgId: string, patch: OrgPatch): Promise<Organization | null> {
  const db = await getDb();
  // Only fields present in the patch change; empty strings clear optional text.
  const text = (v: string | undefined) => (v === undefined ? null : v);
  const { rows } = await db.query<OrgRow>(
    `update organizations set
       name = coalesce($2, name),
       pay_day = case when $3::boolean then $4::smallint else pay_day end,
       legal_name = case when $5::text is null then legal_name else nullif($5, '') end,
       address = case when $6::text is null then address else nullif($6, '') end,
       tax_id = case when $7::text is null then tax_id else nullif($7, '') end,
       invoice_prefix = coalesce($8, invoice_prefix),
       invoice_note = case when $9::text is null then invoice_note else nullif($9, '') end
     where id = $1 returning ${ORG_COLUMNS}`,
    [
      orgId,
      patch.name ?? null,
      patch.payDay !== undefined,
      patch.payDay ?? null,
      text(patch.legalName),
      text(patch.address),
      text(patch.taxId),
      patch.invoicePrefix ?? null,
      text(patch.invoiceNote),
    ],
  );
  return rows[0] ? toOrg(rows[0]) : null;
}

// Employees --------------------------------------------------------------------------------------

export async function listEmployees(orgId: string): Promise<Employee[]> {
  const db = await getDb();
  const { rows } = await db.query<EmployeeRow>(
    `select ${EMPLOYEE_COLUMNS} from employees where org_id = $1 order by created_at, name`,
    [orgId],
  );
  return rows.map(toEmployee);
}

export async function createEmployee(orgId: string, input: EmployeeInput): Promise<Employee> {
  const db = await getDb();
  try {
    const { rows } = await db.query<EmployeeRow>(
      `insert into employees (org_id, name, role, wallet, amount, token, email, address, tax_id)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning ${EMPLOYEE_COLUMNS}`,
      [orgId, input.name, input.role, input.wallet, input.amount, input.token, input.email, input.address, input.taxId],
    );
    return toEmployee(rows[0]);
  } catch (err) {
    if (isUniqueViolation(err)) throw new DuplicateWalletError("Someone on your team already uses that wallet.");
    throw err;
  }
}

export async function updateEmployee(orgId: string, id: string, input: EmployeeInput): Promise<Employee | null> {
  const db = await getDb();
  try {
    const { rows } = await db.query<EmployeeRow>(
      `update employees set name = $3, role = $4, wallet = $5, amount = $6, token = $7,
         email = $8, address = $9, tax_id = $10, updated_at = now()
       where org_id = $1 and id = $2 returning ${EMPLOYEE_COLUMNS}`,
      [orgId, id, input.name, input.role, input.wallet, input.amount, input.token, input.email, input.address, input.taxId],
    );
    return rows[0] ? toEmployee(rows[0]) : null;
  } catch (err) {
    if (isUniqueViolation(err)) throw new DuplicateWalletError("Someone on your team already uses that wallet.");
    throw err;
  }
}

export async function getEmployee(orgId: string, id: string): Promise<Employee | null> {
  const db = await getDb();
  const { rows } = await db.query<EmployeeRow>(
    `select ${EMPLOYEE_COLUMNS} from employees where org_id = $1 and id = $2`,
    [orgId, id],
  );
  return rows[0] ? toEmployee(rows[0]) : null;
}

export async function deleteEmployee(orgId: string, id: string): Promise<Employee | null> {
  const db = await getDb();
  const { rows } = await db.query<EmployeeRow>(
    `delete from employees where org_id = $1 and id = $2 returning ${EMPLOYEE_COLUMNS}`,
    [orgId, id],
  );
  return rows[0] ? toEmployee(rows[0]) : null;
}

// Payroll runs -----------------------------------------------------------------------------------

/**
 * Approvals that still count: from someone who is on the team now as owner or admin. If an approver
 * is removed or demoted (for example because their wallet was compromised), their approval stops
 * counting immediately and the run needs a new one.
 */
const VALID_APPROVALS = `(select count(*) from run_approvals a join members m on m.org_id = payroll_runs.org_id and lower(m.address) = lower(a.approver)
     and m.role in ('owner', 'admin') where a.run_id = payroll_runs.id)`;

const RUN_COLUMNS = `id, chain_id, onchain_ref, status, failure_reason, tx_hash, safe_tx_hash, recipient_count, totals, created_at, confirmed_at,
  paid_at, block_number::text as block_number, network_fee_wei::text as network_fee_wei, usd_rates,
  created_by, requested_at, submitted_by, rejection, prepared_signature,
  ${VALID_APPROVALS} as approval_count`;

/**
 * Snapshots every employee into a new draft run. The snapshot is what gets paid and later verified
 * on-chain, so editing People after this point cannot change a run in flight.
 */
export async function createRunFromEmployees(
  orgId: string,
  chainId: number,
  totals: Record<string, string>,
  employees: Employee[],
  createdBy: string,
): Promise<{ run: Run; items: RunItem[] }> {
  const db = await getDb();
  // A draft is one person's review in progress; replace only their own.
  await db.query(`delete from payroll_runs where org_id = $1 and status = 'draft' and lower(coalesce(created_by, '')) = lower($2)`, [orgId, createdBy]);
  const { rows: idRows } = await db.query<{ id: string }>(`select gen_random_uuid()::text as id`);
  const id = idRows[0].id;
  const { rows } = await db.query<RunRow>(
    `insert into payroll_runs (id, org_id, chain_id, onchain_ref, recipient_count, totals, created_by)
     values ($1, $2, $3, $4, $5, $6, $7) returning ${RUN_COLUMNS}`,
    [id, orgId, chainId, onchainRef(id), employees.length, JSON.stringify(totals), createdBy],
  );
  const items: RunItem[] = [];
  for (const [i, e] of employees.entries()) {
    await db.query(
      `insert into payroll_items (run_id, position, employee_id, name, role, wallet, amount, token)
       values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [id, i, e.id, e.name, e.role, e.wallet, e.amount, e.token],
    );
    items.push({ name: e.name, role: e.role, wallet: e.wallet, amount: e.amount, token: e.token, employeeId: e.id });
  }
  return { run: toRun(rows[0]), items };
}

export async function getRun(orgId: string, id: string): Promise<{ run: Run; items: RunItem[] } | null> {
  const db = await getDb();
  const { rows } = await db.query<RunRow>(`select ${RUN_COLUMNS} from payroll_runs where org_id = $1 and id = $2`, [
    orgId,
    id,
  ]);
  if (!rows[0]) return null;
  return { run: toRun(rows[0]), items: await runItems(id) };
}

type ItemRow = Omit<RunItem, "employeeId"> & { employee_id: string | null };

async function runItems(runId: string): Promise<RunItem[]> {
  const db = await getDb();
  const { rows } = await db.query<ItemRow>(
    `select name, role, wallet, amount::text as amount, token, employee_id::text as employee_id
     from payroll_items where run_id = $1 order by position`,
    [runId],
  );
  return rows.map(({ employee_id, ...r }) => ({ ...r, amount: canonical(r.amount), employeeId: employee_id }));
}

/** Items of the most recent paid run, or null if this organization has never paid a run. */
export async function lastPaidRunItems(orgId: string): Promise<RunItem[] | null> {
  const db = await getDb();
  const { rows } = await db.query<{ id: string }>(
    `select id from payroll_runs where org_id = $1 and status = 'confirmed' order by confirmed_at desc limit 1`,
    [orgId],
  );
  return rows[0] ? runItems(rows[0].id) : null;
}

/** Every wallet this organization has successfully paid at least once, with the name it was paid under. */
export async function paidWallets(orgId: string): Promise<Known[]> {
  const db = await getDb();
  const { rows } = await db.query<Known>(
    `select distinct on (lower(i.wallet)) i.wallet, i.name from payroll_items i
     join payroll_runs r on r.id = i.run_id where r.org_id = $1 and r.status = 'confirmed'
     order by lower(i.wallet), r.confirmed_at desc`,
    [orgId],
  );
  return rows;
}

/** Paid runs with their items, oldest first, optionally for one calendar year (UTC). */
export async function paidRuns(orgId: string, year?: number): Promise<{ run: Run; items: RunItem[] }[]> {
  const db = await getDb();
  const { rows } = await db.query<RunRow>(
    `select ${RUN_COLUMNS} from payroll_runs
     where org_id = $1 and status = 'confirmed'
       and ($2::int is null or extract(year from coalesce(paid_at, confirmed_at) at time zone 'UTC') = $2::int)
     order by coalesce(paid_at, confirmed_at)`,
    [orgId, year ?? null],
  );
  return Promise.all(rows.map(async (r) => ({ run: toRun(r), items: await runItems(r.id) })));
}

export async function listRuns(orgId: string): Promise<Run[]> {
  const db = await getDb();
  const { rows } = await db.query<RunRow>(
    `select ${RUN_COLUMNS} from payroll_runs where org_id = $1 and status <> 'draft' order by created_at desc limit 100`,
    [orgId],
  );
  return rows.map(toRun);
}

/**
 * Records the payroll transaction. Only moves a run that is still sendable, and only with enough
 * approvals for the company's current rule (checked again here, in the same statement, so a
 * rule raised after approval still applies). A sent run can be sent again, e.g. when its first
 * transaction never landed: the contract pays each run once per treasury, so a retry can't pay twice.
 */
export async function markRunSubmitted(
  orgId: string,
  id: string,
  sent: { txHash: string } | { safeTxHash: string },
  submittedBy: string,
  verifiedWallets: string[] | null,
): Promise<Run | null> {
  const db = await getDb();
  const txHash = "txHash" in sent ? sent.txHash : null;
  const safeTxHash = "safeTxHash" in sent ? sent.safeTxHash : null;
  try {
    const { rows } = await db.query<RunRow>(
      `update payroll_runs set status = 'submitted', tx_hash = $3, safe_tx_hash = $6, submitted_at = now(), submitted_by = $4,
         verified_wallets = coalesce(verified_wallets, $5::jsonb)
       where org_id = $1 and id = $2
         and (status in ('pending', 'approved', 'submitted')
              or (status = 'draft' and ${SOLO} and (select approvals_required from organizations where id = $1) = 0 and ${NO_OTHER_OPEN_RUN}))
         and ${VALID_APPROVALS} >= (select approvals_required from organizations where id = $1)
         -- Two-person payroll: the treasury never sends a run it prepared itself, and a run someone
         -- else prepared must carry their signature.
         and (${SOLO} or lower(coalesce(created_by, '')) <> lower($4))
         and (lower(coalesce(created_by, '')) = lower($4) or prepared_signature is not null)
       returning ${RUN_COLUMNS}`,
      [orgId, id, txHash, submittedBy, verifiedWallets ? JSON.stringify(verifiedWallets) : null, safeTxHash],
    );
    return rows[0] ? toRun(rows[0]) : null;
  } catch (err) {
    if (isUniqueViolation(err)) throw new OpenRunError();
    throw err;
  }
}

/**
 * The preparer submits their reviewed, signed draft: to the extra approvers if the company has any,
 * otherwise straight to the treasury. The signature is stored with the run and never changes.
 */
export async function requestApproval(
  orgId: string,
  id: string,
  by: string,
  verifiedWallets: string[],
  signed: { message: string; signature: string } | null,
): Promise<Run | null> {
  const db = await getDb();
  try {
    const { rows } = await db.query<RunRow>(
      `update payroll_runs set requested_at = now(), verified_wallets = $4, prepared_message = $5, prepared_signature = $6,
         status = case when (select approvals_required from organizations where id = $1) = 0 then 'approved' else 'pending' end
       where org_id = $1 and id = $2 and status = 'draft' and lower(created_by) = lower($3) and ${NO_OTHER_OPEN_RUN}
       returning ${RUN_COLUMNS}`,
      [orgId, id, by, JSON.stringify(verifiedWallets), signed?.message ?? null, signed?.signature ?? null],
    );
    return rows[0] ? toRun(rows[0]) : null;
  } catch (err) {
    if (isUniqueViolation(err)) throw new OpenRunError();
    throw err;
  }
}

/** The run that is waiting for approval, approved, or sent and not yet verified. At most one at a time. */
export async function openRun(orgId: string): Promise<Run | null> {
  const db = await getDb();
  const { rows } = await db.query<RunRow>(
    `select ${RUN_COLUMNS} from payroll_runs where org_id = $1 and status in ('pending', 'approved', 'submitted')
     order by created_at desc limit 1`,
    [orgId],
  );
  return rows[0] ? toRun(rows[0]) : null;
}

export async function runVerifiedWallets(id: string): Promise<string[]> {
  const db = await getDb();
  const { rows } = await db.query<{ v: string[] | string | null }>(`select verified_wallets as v from payroll_runs where id = $1`, [id]);
  return json(rows[0]?.v ?? null) ?? [];
}

export async function listApprovals(orgId: string, runId: string): Promise<Approval[]> {
  const db = await getDb();
  const { rows } = await db.query<{ approver: string; name: string | null; created_at: Date | string; signature: string }>(
    `select a.approver, m.name, a.created_at, a.signature from run_approvals a
     join payroll_runs r on r.id = a.run_id
     join members m on m.org_id = r.org_id and lower(m.address) = lower(a.approver) and m.role in ('owner', 'admin')
     where r.org_id = $1 and a.run_id = $2 order by a.created_at`,
    [orgId, runId],
  );
  return rows.map((r) => ({ approver: r.approver, name: r.name ?? "", at: iso(r.created_at)!, signature: r.signature }));
}

/**
 * Stores a verified approval and promotes the run to approved once it has enough. Idempotent for
 * the same approver. Returns null if the run isn't waiting for approval.
 */
export async function addApproval(orgId: string, runId: string, approver: string, message: string, signature: string): Promise<Run | null> {
  const db = await getDb();
  const { rows: ok } = await db.query<{ id: string }>(
    `select id from payroll_runs where org_id = $1 and id = $2 and status in ('pending', 'approved')`,
    [orgId, runId],
  );
  if (!ok[0]) return null;
  await db.query(
    `insert into run_approvals (run_id, approver, message, signature) values ($1, $2, $3, $4) on conflict do nothing`,
    [runId, approver, message, signature],
  );
  const { rows } = await db.query<RunRow>(
    `update payroll_runs set status = case
         when ${VALID_APPROVALS} >= (select approvals_required from organizations where id = $1)
         then 'approved' else status end
     where org_id = $1 and id = $2 and status in ('pending', 'approved')
     returning ${RUN_COLUMNS}`,
    [orgId, runId],
  );
  return rows[0] ? toRun(rows[0]) : null;
}

export async function rejectRun(orgId: string, runId: string, by: string, reason: string): Promise<Run | null> {
  const db = await getDb();
  const { rows } = await db.query<RunRow>(
    `update payroll_runs set status = 'rejected', rejection = $3
     where org_id = $1 and id = $2 and status in ('pending', 'approved') returning ${RUN_COLUMNS}`,
    [orgId, runId, JSON.stringify({ by, reason, at: new Date().toISOString() })],
  );
  return rows[0] ? toRun(rows[0]) : null;
}

export async function cancelRun(orgId: string, runId: string): Promise<Run | null> {
  const db = await getDb();
  const { rows } = await db.query<RunRow>(
    `update payroll_runs set status = 'cancelled' where org_id = $1 and id = $2 and status in ('draft', 'pending', 'approved')
     returning ${RUN_COLUMNS}`,
    [orgId, runId],
  );
  return rows[0] ? toRun(rows[0]) : null;
}

/**
 * Points a run at the transaction that actually paid it, found on-chain. Used when the wallet
 * replaced the transaction (speed-up) or the browser never reported it. The caller has read the
 * contract's paidBlock for this treasury and run; the confirm step still checks every payment.
 */
export async function recordRunTransaction(orgId: string, id: string, txHash: string): Promise<Run | null> {
  const db = await getDb();
  const { rows } = await db.query<RunRow>(
    `update payroll_runs set status = 'submitted', tx_hash = $3, submitted_at = coalesce(submitted_at, now())
     where org_id = $1 and id = $2 and status in ('approved', 'submitted') returning ${RUN_COLUMNS}`,
    [orgId, id, txHash],
  );
  return rows[0] ? toRun(rows[0]) : null;
}

/**
 * Wallets this person added or changed in People since `since` (the last paid run). Whoever
 * changes where money goes must not be the one who approves paying it.
 */
export async function walletsChangedBy(orgId: string, actor: string, since: Date | null): Promise<Set<string>> {
  const db = await getDb();
  const { rows } = await db.query<{ action: string; detail: Record<string, unknown> | string }>(
    `select action, detail from audit_events where org_id = $1 and lower(actor) = lower($2)
       and action in ('person_added', 'person_updated', 'people_imported') and ($3::timestamptz is null or at > $3::timestamptz)`,
    [orgId, actor, since?.toISOString() ?? null],
  );
  const out = new Set<string>();
  const add = (w: unknown) => typeof w === "string" && out.add(w.toLowerCase());
  for (const r of rows) {
    const d = json<Record<string, unknown>>(r.detail) ?? {};
    if (r.action === "person_added") add(d.wallet);
    if (r.action === "person_updated") add((d.changes as { wallet?: unknown[] } | undefined)?.wallet?.[1]);
    if (r.action === "people_imported") {
      if (Array.isArray(d.wallets)) d.wallets.forEach(add);
      if (Array.isArray(d.people)) d.people.forEach((p) => add((p as { wallet?: unknown }).wallet));
    }
  }
  return out;
}

/** When the company's last run was paid, or null if it never was. */
export async function lastPaidAt(orgId: string): Promise<Date | null> {
  const db = await getDb();
  const { rows } = await db.query<{ at: Date | string | null }>(
    `select max(confirmed_at) as at from payroll_runs where org_id = $1 and status = 'confirmed'`,
    [orgId],
  );
  return rows[0]?.at ? new Date(rows[0].at) : null;
}

export async function markRunResult(
  orgId: string,
  id: string,
  result: { status: "confirmed"; record: RunRecord } | { status: "failed"; reason: string },
): Promise<Run | null> {
  const db = await getDb();
  const record = result.status === "confirmed" ? result.record : null;
  const { rows } = await db.query<RunRow>(
    `update payroll_runs
     set status = $3, failure_reason = $4, confirmed_at = case when $3 = 'confirmed' then now() else null end,
         paid_at = $5, block_number = $6, network_fee_wei = $7, usd_rates = $8
     where org_id = $1 and id = $2 and status = 'submitted' returning ${RUN_COLUMNS}`,
    [
      orgId,
      id,
      result.status,
      result.status === "failed" ? result.reason : null,
      record?.paidAt.toISOString() ?? null,
      record?.blockNumber.toString() ?? null,
      record?.networkFeeWei.toString() ?? null,
      record ? JSON.stringify(record.usdRates) : null,
    ],
  );
  return rows[0] ? toRun(rows[0]) : null;
}

// Activity log -----------------------------------------------------------------------------------

export type ActivityRow = { id: string; at: string; actor: string; action: string; detail: Record<string, unknown> };

/** Records who did what. Logging must never block the action it describes, so failures are reported, not thrown. */
export async function logActivity(orgId: string, actor: string, action: string, detail: Record<string, unknown> = {}) {
  try {
    const db = await getDb();
    await db.query(`insert into audit_events (org_id, actor, action, detail) values ($1, $2, $3, $4)`, [
      orgId,
      actor,
      action,
      JSON.stringify(detail),
    ]);
  } catch (err) {
    console.error("activity log write failed", err);
  }
}

export async function listActivity(orgId: string, limit = 200): Promise<ActivityRow[]> {
  const db = await getDb();
  const { rows } = await db.query<{ id: string; at: Date | string; actor: string; action: string; detail: Record<string, unknown> | string }>(
    `select id::text as id, at, actor, action, detail from audit_events where org_id = $1 order by audit_events.id desc limit $2`,
    [orgId, limit],
  );
  return rows.map((r) => ({ ...r, at: iso(r.at)!, detail: typeof r.detail === "string" ? JSON.parse(r.detail) : r.detail }));
}

// Invoices ---------------------------------------------------------------------------------------

/**
 * Issues an invoice for every payment in a paid run that doesn't have one yet, oldest first, with
 * the next numbers in sequence. Safe to call repeatedly: if two calls race, the unique constraints
 * stop duplicates and the loser stops early (the winner issues the rest).
 */
export async function ensureInvoices(orgId: string): Promise<void> {
  const db = await getDb();
  const { rows: missing } = await db.query<{ run_id: string; position: number }>(
    `select r.id::text as run_id, i.position from payroll_runs r
     join payroll_items i on i.run_id = r.id
     left join invoices v on v.run_id = r.id and v.position = i.position
     where r.org_id = $1 and r.status = 'confirmed' and v.id is null
     order by coalesce(r.paid_at, r.confirmed_at), r.id, i.position`,
    [orgId],
  );
  if (!missing.length) return;
  const org = await getOrganization(orgId);
  if (!org) return;
  const people = new Map((await listEmployees(orgId)).map((e) => [e.id, e]));
  const runs = new Map<string, { run: Run; items: RunItem[] }>();
  const { rows: top } = await db.query<{ n: number | null }>(`select max(number) as n from invoices where org_id = $1`, [orgId]);
  let next = (top[0]?.n ?? 0) + 1;
  for (const m of missing) {
    if (!runs.has(m.run_id)) {
      const found = await getRun(orgId, m.run_id);
      if (!found) continue;
      runs.set(m.run_id, found);
    }
    const { run, items } = runs.get(m.run_id)!;
    const item = items[m.position];
    if (!item) continue;
    const person = item.employeeId ? people.get(item.employeeId) : undefined;
    const data = buildInvoice(org, run, item, person, next);
    try {
      await db.query(
        `insert into invoices (org_id, number, run_id, position, issued_at, data) values ($1, $2, $3, $4, $5, $6)`,
        [orgId, next, run.id, m.position, data.issuedAt, JSON.stringify(data)],
      );
      next++;
    } catch (err) {
      if (isUniqueViolation(err)) return; // another request is issuing these right now
      throw err;
    }
  }
}

export async function listInvoices(orgId: string): Promise<Invoice[]> {
  const db = await getDb();
  const { rows } = await db.query<{ id: string; number: number; run_id: string; position: number; issued_at: Date | string; data: InvoiceData | string }>(
    `select id::text as id, number, run_id::text as run_id, position, issued_at, data from invoices
     where org_id = $1 order by number desc limit 5000`,
    [orgId],
  );
  return rows.map((r) => ({
    id: r.id,
    number: r.number,
    runId: r.run_id,
    position: r.position,
    issuedAt: iso(r.issued_at)!,
    data: typeof r.data === "string" ? JSON.parse(r.data) : r.data,
  }));
}
