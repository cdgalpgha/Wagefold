import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it, vi } from "vitest";
import type { Db } from "@/lib/server/db";
import { MIGRATIONS, migrate, type Migration } from "@/lib/server/migrations";

/** An in-memory Postgres with the same shape the app uses. */
function memoryDb(): Db {
  const lite = new PGlite();
  return {
    query: async (sql, params) => lite.query(sql, params) as never,
    exec: (sql) => lite.exec(sql),
    transaction: (fn) => lite.transaction((tx) => fn({ query: async (sql, params) => tx.query(sql, params) as never, exec: (sql) => tx.exec(sql) })),
  };
}
const versions = async (db: Db) => (await db.query<{ version: number }>("select version from schema_migrations order by version")).rows.map((r) => r.version);

describe("database migrations", () => {
  it("builds a fresh database and records each migration once", async () => {
    const db = memoryDb();
    expect(await migrate(db)).toEqual(MIGRATIONS.map((m) => m.version));
    expect(await versions(db)).toEqual(MIGRATIONS.map((m) => m.version));
    expect(await migrate(db)).toEqual([]); // nothing left to do on the next start
    const { rows } = await db.query("select to_regclass('treasury_transfers') as t");
    expect(rows[0]).toEqual({ t: "treasury_transfers" });
  }, 30_000);

  it("adopts a database created before versioning, keeping its data", async () => {
    const db = memoryDb();
    await db.exec(MIGRATIONS[0].sql); // how the app used to start: the schema, no record of it
    await db.query(`insert into organizations (owner_address, name) values ('0xabc', 'Acme')`);
    expect(await migrate(db)).toEqual(MIGRATIONS.map((m) => m.version));
    const { rows } = await db.query<{ name: string }>(`select name from organizations`);
    expect(rows).toEqual([{ name: "Acme" }]);
  }, 30_000);

  it("applies new migrations in order, and a failing one changes nothing", async () => {
    const db = memoryDb();
    const extra: Migration[] = [
      { version: 3, name: "c", sql: "alter table t add column c int" },
      { version: 2, name: "t", sql: "create table t (id int)" },
    ];
    expect(await migrate(db, extra)).toEqual([2, 3]);
    const broken: Migration[] = [...extra, { version: 4, name: "bad", sql: "alter table t add column d int; select * from nope" }];
    await expect(migrate(db, broken)).rejects.toThrow();
    expect(await versions(db)).toEqual([2, 3]);
    const { rows } = await db.query(`select column_name from information_schema.columns where table_name = 't' and column_name = 'd'`);
    expect(rows).toEqual([]); // rolled back with the failed migration
    await expect(migrate(db, [extra[1], { ...extra[1] }])).rejects.toThrow(/share a version/);
  }, 30_000);

  it("warns when a shipped migration was edited instead of adding a new one", async () => {
    const db = memoryDb();
    await migrate(db, [{ version: 2, name: "t", sql: "create table t (id int)" }]);
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await migrate(db, [{ version: 2, name: "t", sql: "create table t (id bigint)" }]);
    expect(JSON.parse(spy.mock.calls[0][0] as string).event).toBe("migration_changed");
    spy.mockRestore();
  }, 30_000);
});
