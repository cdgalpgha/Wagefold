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
