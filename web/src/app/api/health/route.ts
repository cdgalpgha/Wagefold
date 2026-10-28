import { SUPPORTED } from "@/lib/chains";
import { serverClient } from "@/lib/server/chain";
import { getDb } from "@/lib/server/db";
import { json } from "@/lib/server/http";
import { logError } from "@/lib/server/log";

export const dynamic = "force-dynamic";

const TIMEOUT_MS = 3000;
/** Answers are reused for a few seconds, so polling this can't burn the RPC provider's quota. */
const CACHE_MS = 10_000;
let cached: { at: number; status: number; body: unknown } | null = null;

async function timed<T>(fn: () => Promise<T>): Promise<{ ok: true; value: T; ms: number } | { ok: false; ms: number; error: unknown }> {
  const start = Date.now();
  try {
    const value = await Promise.race([fn(), new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timed out")), TIMEOUT_MS))]);
    return { ok: true, value, ms: Date.now() - start };
  } catch (error) {
    return { ok: false, ms: Date.now() - start, error };
  }
}

/**
 * For uptime monitors: can the server reach its database and each configured network's RPC?
 * 200 when everything answers, 503 when something doesn't. Never includes URLs, keys or error text.
 */
export async function GET() {
  if (cached && Date.now() - cached.at < CACHE_MS) return json(cached.body, cached.status);
  const db = await timed(async () => (await getDb()).query("select 1"));
  if (!db.ok) logError("health_db_failed", db.error);
  const chains = await Promise.all(
    SUPPORTED.map(async (c) => {
      const client = serverClient(c.chain.id);
      const r = client ? await timed(() => client.getBlockNumber()) : null;
      if (r && !r.ok) logError("health_rpc_failed", r.error, { chainId: c.chain.id });
      return { chainId: c.chain.id, name: c.chain.name, ok: !!r?.ok, block: r?.ok ? r.value.toString() : null, ms: r?.ms ?? null };
    }),
  );
  const ok = db.ok && chains.every((c) => c.ok);
  const body = { ok, time: new Date().toISOString(), db: { ok: db.ok, ms: db.ms }, chains };
  cached = { at: Date.now(), status: ok ? 200 : 503, body };
  return json(body, cached.status);
}
