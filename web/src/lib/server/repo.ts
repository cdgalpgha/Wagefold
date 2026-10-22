import "server-only";
import type { TokenSymbol } from "../chains";
import { canonical } from "../money";
import { onchainRef, type RunItem } from "../payments";
import type { EmployeeInput } from "../validation";
import { getDb } from "./db";

export type Organization = { id: string; ownerAddress: string; name: string };
export type Employee = { id: string; name: string; role: string; wallet: string; amount: string; token: TokenSymbol };
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
};

type EmployeeRow = { id: string; name: string; role: string; wallet: string; amount: string; token: TokenSymbol };
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
};

const iso = (d: Date | string | null) => (d === null ? null : new Date(d).toISOString());

const toEmployee = (r: EmployeeRow): Employee => ({ ...r, amount: canonical(r.amount) });
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
});

export class DuplicateWalletError extends Error {}

function isUniqueViolation(err: unknown) {
  return typeof err === "object" && err !== null && "code" in err && (err as { code: string }).code === "23505";
}

// Organizations ----------------------------------------------------------------------------------

export async function upsertOrganization(ownerAddress: string): Promise<Organization> {
  const db = await getDb();
  const { rows } = await db.query<{ id: string; owner_address: string; name: string }>(
    `insert into organizations (owner_address) values ($1)
     on conflict (owner_address) do update set owner_address = excluded.owner_address
     returning id, owner_address, name`,
    [ownerAddress],
  );
  return { id: rows[0].id, ownerAddress: rows[0].owner_address, name: rows[0].name };
}

export async function getOrganization(orgId: string): Promise<Organization | null> {
  const db = await getDb();
  const { rows } = await db.query<{ id: string; owner_address: string; name: string }>(
    `select id, owner_address, name from organizations where id = $1`,
    [orgId],
  );
  return rows[0] ? { id: rows[0].id, ownerAddress: rows[0].owner_address, name: rows[0].name } : null;
}

export async function renameOrganization(orgId: string, name: string): Promise<void> {
  const db = await getDb();
  await db.query(`update organizations set name = $2 where id = $1`, [orgId, name]);
}

// Employees --------------------------------------------------------------------------------------

export async function listEmployees(orgId: string): Promise<Employee[]> {
  const db = await getDb();
  const { rows } = await db.query<EmployeeRow>(
    `select id, name, role, wallet, amount::text as amount, token from employees
     where org_id = $1 order by created_at, name`,
    [orgId],
  );
  return rows.map(toEmployee);
}

export async function createEmployee(orgId: string, input: EmployeeInput): Promise<Employee> {
  const db = await getDb();
  try {
    const { rows } = await db.query<EmployeeRow>(
      `insert into employees (org_id, name, role, wallet, amount, token) values ($1, $2, $3, $4, $5, $6)
       returning id, name, role, wallet, amount::text as amount, token`,
      [orgId, input.name, input.role, input.wallet, input.amount, input.token],
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
      `update employees set name = $3, role = $4, wallet = $5, amount = $6, token = $7, updated_at = now()
       where org_id = $1 and id = $2
       returning id, name, role, wallet, amount::text as amount, token`,
      [orgId, id, input.name, input.role, input.wallet, input.amount, input.token],
    );
    return rows[0] ? toEmployee(rows[0]) : null;
  } catch (err) {
    if (isUniqueViolation(err)) throw new DuplicateWalletError("Someone on your team already uses that wallet.");
    throw err;
  }
}

export async function deleteEmployee(orgId: string, id: string): Promise<boolean> {
  const db = await getDb();
  const { rows } = await db.query(`delete from employees where org_id = $1 and id = $2 returning id`, [orgId, id]);
  return rows.length > 0;
}

// Payroll runs -----------------------------------------------------------------------------------

const RUN_COLUMNS = `id, chain_id, onchain_ref, status, failure_reason, tx_hash, recipient_count, totals, created_at, confirmed_at`;

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

/** Every wallet this organization has successfully paid at least once. */
export async function paidWallets(orgId: string): Promise<string[]> {
  const db = await getDb();
  const { rows } = await db.query<{ wallet: string }>(
    `select distinct lower(i.wallet) as wallet from payroll_items i
     join payroll_runs r on r.id = i.run_id where r.org_id = $1 and r.status = 'confirmed'`,
    [orgId],
  );
  return rows.map((r) => r.wallet);
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
  result: { status: "confirmed" } | { status: "failed"; reason: string },
): Promise<Run | null> {
  const db = await getDb();
  const { rows } = await db.query<RunRow>(
    `update payroll_runs
     set status = $3, failure_reason = $4, confirmed_at = case when $3 = 'confirmed' then now() else null end
     where org_id = $1 and id = $2 and status = 'submitted' returning ${RUN_COLUMNS}`,
    [orgId, id, result.status, result.status === "failed" ? result.reason : null],
  );
  return rows[0] ? toRun(rows[0]) : null;
}
