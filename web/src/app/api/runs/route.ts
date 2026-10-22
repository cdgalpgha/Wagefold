import { NextResponse } from "next/server";
import { formatUnits } from "viem";
import { z } from "zod";
import { MAX_PAYMENTS } from "@/lib/abi";
import { getChainConfig, TOKEN_DECIMALS, TOKEN_SYMBOLS } from "@/lib/chains";
import { sumByToken } from "@/lib/money";
import { fail, json, readJson, requireSession } from "@/lib/server/http";
import { reviewRun } from "@/lib/changes";
import { createRunFromEmployees, lastPaidRunItems, listEmployees, listRuns, paidWallets } from "@/lib/server/repo";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  return json({ runs: await listRuns(session.orgId) });
}

const createInput = z.object({ chainId: z.number().int() });

/** Pulls everyone from People into a new draft run: name, wallet and amount. */
export async function POST(req: Request) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const parsed = createInput.safeParse(await readJson(req));
  if (!parsed.success) return fail("Missing network.");
  const cfg = getChainConfig(parsed.data.chainId);
  if (!cfg) return fail("Payroll isn't available on this network yet.");

  const employees = await listEmployees(session.orgId);
  if (employees.length === 0) return fail("Add people before running payroll.");
  if (employees.length > MAX_PAYMENTS) return fail(`One run can pay up to ${MAX_PAYMENTS} people.`);
  const unsupported = employees.filter((e) => !cfg.tokens[e.token]);
  if (unsupported.length) {
    const names = unsupported.slice(0, 3).map((e) => e.name).join(", ");
    return fail(`${unsupported[0].token} isn't available on ${cfg.chain.name}. Change the token for ${names}.`);
  }

  const sums = sumByToken(employees);
  const totals = Object.fromEntries(
    TOKEN_SYMBOLS.filter((s) => sums[s] > 0n).map((s) => [s, formatUnits(sums[s], TOKEN_DECIMALS)]),
  );
  const [previous, paid] = await Promise.all([lastPaidRunItems(session.orgId), paidWallets(session.orgId)]);
  const { run, items } = await createRunFromEmployees(session.orgId, cfg.chain.id, totals, employees);
  return json({ run, items, review: reviewRun(previous, items, paid) }, 201);
}
