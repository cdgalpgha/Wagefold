import "server-only";
import fs from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import pg from "pg";
import { migrate } from "./migrations";

export type Tx = {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
  exec(sql: string): Promise<unknown>;
};
export type Db = Tx & {
  /** Runs `fn` in one transaction: every statement commits together, or none do. */
  transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T>;
};

async function init(): Promise<Db> {
  const url = process.env.DATABASE_URL;
  let db: Db;
  if (url) {
    const pool = new pg.Pool({ connectionString: url });
    db = {
      query: async (sql, params) => pool.query(sql, params as unknown[]) as never,
      exec: (sql) => pool.query(sql),
      transaction: async (fn) => {
        const client = await pool.connect();
        try {
          await client.query("begin");
          const result = await fn({ query: async (sql, params) => client.query(sql, params as unknown[]) as never, exec: (sql) => client.query(sql) });
          await client.query("commit");
          return result;
        } catch (err) {
          await client.query("rollback").catch(() => undefined);
          throw err;
        } finally {
          client.release();
        }
      },
    };
  } else {
    // Embedded Postgres for local development and single-server deployments.
    const dir = process.env.PGLITE_DIR ?? ".data/pglite";
    fs.mkdirSync(dir, { recursive: true });
    const lite = new PGlite(dir);
    db = {
      query: async (sql, params) => lite.query(sql, params) as never,
      exec: (sql) => lite.exec(sql),
      // PGlite holds other queries back until the transaction ends.
      transaction: (fn) => lite.transaction((tx) => fn({ query: async (sql, params) => tx.query(sql, params) as never, exec: (sql) => tx.exec(sql) })),
    };
  }
  await migrate(db);
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
