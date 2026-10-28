import "server-only";
import fs from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import pg from "pg";

export type Db = {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
  exec(sql: string): Promise<unknown>;
};

const SCHEMA = `
create table if not exists organizations (
  id uuid primary key default gen_random_uuid(),
  owner_address text not null unique,
  name text not null default 'My company',
  created_at timestamptz not null default now()
);

create table if not exists employees (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  role text not null default '',
  wallet text not null,
  amount numeric(24, 6) not null check (amount > 0),
  token text not null check (token in ('USDC', 'USDT')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists employees_org_wallet on employees (org_id, lower(wallet));

create table if not exists payroll_runs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  chain_id integer not null,
  onchain_ref text not null unique,
  status text not null default 'draft' check (status in ('draft', 'submitted', 'confirmed', 'failed')),
  failure_reason text,
  tx_hash text,
  recipient_count integer not null,
  totals jsonb not null,
  created_at timestamptz not null default now(),
  submitted_at timestamptz,
  confirmed_at timestamptz
);
create index if not exists payroll_runs_org on payroll_runs (org_id, created_at desc);

create table if not exists payroll_items (
  run_id uuid not null references payroll_runs(id) on delete cascade,
  position integer not null,
  employee_id uuid,
  name text not null,
  role text not null,
  wallet text not null,
  amount numeric(24, 6) not null,
  token text not null,
  primary key (run_id, position)
);

alter table organizations add column if not exists pay_day smallint check (pay_day between 1 and 28 or pay_day = 31);
alter table payroll_runs add column if not exists paid_at timestamptz;
alter table payroll_runs add column if not exists block_number numeric(30, 0);
alter table payroll_runs add column if not exists network_fee_wei numeric(40, 0);
alter table payroll_runs add column if not exists usd_rates jsonb;

-- Append-only: the app inserts and reads, never updates or deletes, so the trail can't be rewritten.
create table if not exists audit_events (
  id bigserial primary key,
  org_id uuid not null references organizations(id) on delete cascade,
  at timestamptz not null default now(),
  actor text not null,
  action text not null,
  detail jsonb not null default '{}'
);
create index if not exists audit_events_org on audit_events (org_id, id desc);

-- Enforced in the database too, so a bug or a stray query can't rewrite history. Deleting a whole
-- company still cascades: that delete reaches this table at trigger depth 2.
create or replace function audit_events_append_only() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then return old; end if;
  raise exception '% is append-only', tg_table_name;
end $$;
drop trigger if exists audit_events_append_only on audit_events;
create trigger audit_events_append_only before update or delete on audit_events
  for each row execute function audit_events_append_only();

-- Invoice details. Optional: invoices fall back to the company name and leave blanks out.
alter table organizations add column if not exists legal_name text;
alter table organizations add column if not exists address text;
alter table organizations add column if not exists tax_id text;
alter table organizations add column if not exists invoice_prefix text not null default 'INV-';
alter table organizations add column if not exists invoice_note text;
alter table employees add column if not exists email text not null default '';
alter table employees add column if not exists address text not null default '';
alter table employees add column if not exists tax_id text not null default '';

-- One invoice per paid payment, numbered in order per company. Issued invoices never change:
-- the data column is a snapshot, and the trigger below rejects edits (company deletion still cascades).
create table if not exists invoices (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  number integer not null,
  run_id uuid not null references payroll_runs(id) on delete cascade,
  position integer not null,
  issued_at timestamptz not null,
  data jsonb not null,
  created_at timestamptz not null default now(),
  unique (org_id, number),
  unique (run_id, position)
);
drop trigger if exists invoices_immutable on invoices;
create trigger invoices_immutable before update or delete on invoices
  for each row execute function audit_events_append_only();

-- Team: every wallet that can sign in to a company, with one role. The owner row is the treasury.
create table if not exists members (
  org_id uuid not null references organizations(id) on delete cascade,
  address text not null,
  name text not null default '',
  role text not null check (role in ('owner', 'admin', 'preparer', 'viewer')),
  added_by text,
  created_at timestamptz not null default now(),
  primary key (org_id, address)
);
create unique index if not exists members_org_address on members (org_id, lower(address));
create index if not exists members_address on members (lower(address));
create unique index if not exists members_one_owner on members (org_id) where role = 'owner';
insert into members (org_id, address, role) select id, owner_address, 'owner' from organizations on conflict do nothing;

-- Approvals: how many a run needs, who prepared it, and the signed approvals themselves.
alter table organizations add column if not exists approvals_required smallint not null default 0
  check (approvals_required between 0 and 5);
alter table payroll_runs add column if not exists created_by text;
alter table payroll_runs add column if not exists requested_at timestamptz;
alter table payroll_runs add column if not exists submitted_by text;
alter table payroll_runs add column if not exists verified_wallets jsonb;
alter table payroll_runs add column if not exists rejection jsonb;
alter table payroll_runs drop constraint if exists payroll_runs_status_check;
alter table payroll_runs add constraint payroll_runs_status_check check (status in
  ('draft', 'pending', 'approved', 'rejected', 'cancelled', 'submitted', 'confirmed', 'failed'));

create table if not exists run_approvals (
  run_id uuid not null references payroll_runs(id) on delete cascade,
  approver text not null,
  message text not null,
  signature text not null,
  created_at timestamptz not null default now(),
  primary key (run_id, approver)
);
drop trigger if exists run_approvals_append_only on run_approvals;
create trigger run_approvals_append_only before update or delete on run_approvals
  for each row execute function audit_events_append_only();

-- Two-person payroll: the accounts team prepares and signs, the treasury approves by sending.
alter table organizations add column if not exists two_person boolean not null default true;
-- The preparer's signature over the exact run they submitted (written once, when it leaves draft).
alter table payroll_runs add column if not exists prepared_message text;
alter table payroll_runs add column if not exists prepared_signature text;

-- At most one payroll in flight per company (waiting for approval, approved, or sent and not yet
-- verified), enforced by the database so two runs can never both be approved and sent. Skipped,
-- with a warning, if existing data already breaks the rule; the app still checks it before writing.
do $$ begin
  create unique index if not exists payroll_runs_one_open on payroll_runs (org_id)
    where status in ('pending', 'approved', 'submitted');
exception when unique_violation then
  raise warning 'payroll_runs_one_open not created: a company has more than one open run';
end $$;

-- Sessions live on the server too, so signing out (or the owner removing someone) ends them for
-- real. The cookie only names the session; a copied cookie stops working once it's revoked.
create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  address text not null,
  org_id uuid not null references organizations(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz
);
create index if not exists sessions_address on sessions (lower(address));

-- Sign-in nonces that have been used. A signed sign-in message works once, even if someone copies it.
create table if not exists used_nonces (
  nonce text primary key,
  expires_at timestamptz not null
);
`;

async function init(): Promise<Db> {
  const url = process.env.DATABASE_URL;
  let db: Db;
  if (url) {
    const pool = new pg.Pool({ connectionString: url });
    db = {
      query: async (sql, params) => pool.query(sql, params as unknown[]) as never,
      exec: (sql) => pool.query(sql),
    };
  } else {
    // Embedded Postgres for local development and single-server deployments.
    const dir = process.env.PGLITE_DIR ?? ".data/pglite";
    fs.mkdirSync(dir, { recursive: true });
    const lite = new PGlite(dir);
    db = {
      query: async (sql, params) => lite.query(sql, params) as never,
      exec: (sql) => lite.exec(sql),
    };
  }
  await db.exec(SCHEMA);
  return db;
}

const globalForDb = globalThis as unknown as { __wagefoldDb?: Promise<Db> };

export function getDb(): Promise<Db> {
  globalForDb.__wagefoldDb ??= init().catch((err) => {
    globalForDb.__wagefoldDb = undefined; // don't cache a failed start; retry on the next request
    throw err;
  });
  return globalForDb.__wagefoldDb;
}
