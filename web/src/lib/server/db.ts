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
  raise exception 'audit_events is append-only';
end $$;
drop trigger if exists audit_events_append_only on audit_events;
create trigger audit_events_append_only before update or delete on audit_events
  for each row execute function audit_events_append_only();
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
