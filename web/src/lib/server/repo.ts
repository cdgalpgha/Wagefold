import "server-only";
import { formatEther } from "viem";
import type { TokenSymbol } from "../chains";
import { buildInvoice, type Invoice, type InvoiceData } from "../invoices";
import type { Known } from "../lookalike";
import { canonical } from "../money";
import { onchainRef, type RunItem } from "../payments";
import type { EmployeeInput } from "../validation";
import { getDb } from "./db";

export type Organization = {
  id: string;
  ownerAddress: string;
  name: string;
  payDay: number | null;
  legalName: string | null;
  address: string | null;
  taxId: string | null;
  invoicePrefix: string;
  invoiceNote: string | null;
};
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
export type RunStatus = "draft" | "submitted" | "confirmed" | "failed";
export type Run = {
  id: string;
  chainId: number;
  onchainRef: string;
  status: RunStatus;
  failureReason: string | null;
  txHash: string | null;
  recipientCount: number;
  totals: Record<string, string>;
  createdAt: string;
  confirmedAt: string | null;
  paidAt: string | null;
  blockNumber: string | null;
  networkFee: string | null;
  usdRates: Partial<Record<TokenSymbol, { rate: string; source: string }>> | null;
};
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
  recipient_count: number;
  totals: Record<string, string> | string;
  created_at: Date | string;
  confirmed_at: Date | string | null;
  paid_at: Date | string | null;
  block_number: string | null;
  network_fee_wei: string | null;
  usd_rates: RunRecord["usdRates"] | string | null;
};

const iso = (d: Date | string | null) => (d === null ? null : new Date(d).toISOString());

const toEmployee = ({ tax_id, ...r }: EmployeeRow): Employee => ({ ...r, taxId: tax_id, amount: canonical(r.amount) });
const toRun = (r: RunRow): Run => ({
  id: r.id,
  chainId: r.chain_id,
  onchainRef: r.onchain_ref,
  status: r.status,
  failureReason: r.failure_reason,
  txHash: r.tx_hash,
  recipientCount: r.recipient_count,
  totals: typeof r.totals === "string" ? JSON.parse(r.totals) : r.totals,
  createdAt: iso(r.created_at)!,
  confirmedAt: iso(r.confirmed_at),
  paidAt: iso(r.paid_at),
  blockNumber: r.block_number,
  networkFee: r.network_fee_wei === null ? null : formatEther(BigInt(r.network_fee_wei)),
  usdRates: typeof r.usd_rates === "string" ? JSON.parse(r.usd_rates) : r.usd_rates,
});

export class DuplicateWalletError extends Error {}

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
};
const ORG_COLUMNS = `id, owner_address, name, pay_day, legal_name, address, tax_id, invoice_prefix, invoice_note`;
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
});

export async function upsertOrganization(ownerAddress: string): Promise<Organization> {
  const db = await getDb();
  const { rows } = await db.query<OrgRow>(
    `insert into organizations (owner_address) values ($1)
     on conflict (owner_address) do update set owner_address = excluded.owner_address
     returning ${ORG_COLUMNS}`,
    [ownerAddress],
  );
  return toOrg(rows[0]);
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

const RUN_COLUMNS = `id, chain_id, onchain_ref, status, failure_reason, tx_hash, recipient_count, totals, created_at, confirmed_at,
  paid_at, block_number::text as block_number, network_fee_wei::text as network_fee_wei, usd_rates`;

/**
 * Snapshots every employee into a new draft run. The snapshot is what gets paid and later verified
 * on-chain, so editing People after this point cannot change a run in flight.
 */
export async function createRunFromEmployees(
  orgId: string,
  chainId: number,
  totals: Record<string, string>,
  employees: Employee[],
): Promise<{ run: Run; items: RunItem[] }> {
  const db = await getDb();
  await db.query(`delete from payroll_runs where org_id = $1 and status = 'draft'`, [orgId]);
  const { rows: idRows } = await db.query<{ id: string }>(`select gen_random_uuid()::text as id`);
  const id = idRows[0].id;
  const { rows } = await db.query<RunRow>(
    `insert into payroll_runs (id, org_id, chain_id, onchain_ref, recipient_count, totals)
     values ($1, $2, $3, $4, $5, $6) returning ${RUN_COLUMNS}`,
    [id, orgId, chainId, onchainRef(id), employees.length, JSON.stringify(totals)],
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

export async function markRunSubmitted(orgId: string, id: string, txHash: string): Promise<Run | null> {
  const db = await getDb();
  const { rows } = await db.query<RunRow>(
    `update payroll_runs set status = 'submitted', tx_hash = $3, submitted_at = now()
     where org_id = $1 and id = $2 and status = 'draft' returning ${RUN_COLUMNS}`,
    [orgId, id, txHash],
  );
  return rows[0] ? toRun(rows[0]) : null;
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
