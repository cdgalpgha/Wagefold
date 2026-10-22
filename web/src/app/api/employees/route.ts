import { NextResponse } from "next/server";
import { fail, json, readJson, requireSession } from "@/lib/server/http";
import { createEmployee, DuplicateWalletError, listEmployees, type Employee } from "@/lib/server/repo";
import { employeeInput, firstError } from "@/lib/validation";

export const dynamic = "force-dynamic";
const MAX_IMPORT = 1000;
/** Per-company cap: far above any real team, low enough that a hijacked session can't flood the database. */
const MAX_EMPLOYEES = 2000;

export async function GET() {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  return json({ employees: await listEmployees(session.orgId) });
}

/** Accepts one employee, or `{ employees: [...] }` for a CSV import. */
export async function POST(req: Request) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const body = await readJson(req);
  const existing = (await listEmployees(session.orgId)).length;

  if (body && typeof body === "object" && Array.isArray((body as { employees?: unknown }).employees)) {
    const rows = (body as { employees: unknown[] }).employees;
    if (rows.length > MAX_IMPORT) return fail(`Import up to ${MAX_IMPORT} people at a time.`);
    if (existing + rows.length > MAX_EMPLOYEES) return fail(`A company can have up to ${MAX_EMPLOYEES} people.`);
    const created: Employee[] = [];
    const errors: { row: number; error: string }[] = [];
    for (const [i, row] of rows.entries()) {
      const parsed = employeeInput.safeParse(row);
      if (!parsed.success) {
        errors.push({ row: i + 1, error: firstError(parsed.error) });
        continue;
      }
      try {
        created.push(await createEmployee(session.orgId, parsed.data));
      } catch (err) {
        if (err instanceof DuplicateWalletError) errors.push({ row: i + 1, error: err.message });
        else throw err;
      }
    }
    return json({ created, errors }, created.length ? 201 : 400);
  }

  if (existing >= MAX_EMPLOYEES) return fail(`A company can have up to ${MAX_EMPLOYEES} people.`);
  const parsed = employeeInput.safeParse(body);
  if (!parsed.success) return fail(firstError(parsed.error));
  try {
    return json({ employee: await createEmployee(session.orgId, parsed.data) }, 201);
  } catch (err) {
    if (err instanceof DuplicateWalletError) return fail(err.message, 409);
    throw err;
  }
}
