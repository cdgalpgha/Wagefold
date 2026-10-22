import { NextResponse } from "next/server";
import { fail, json, readJson, requireSession } from "@/lib/server/http";
import { deleteEmployee, DuplicateWalletError, updateEmployee } from "@/lib/server/repo";
import { employeeInput, firstError } from "@/lib/validation";

const UUID_RE = /^[0-9a-f-]{36}$/i;
type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const params = await ctx.params;
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  if (!UUID_RE.test(params.id)) return fail("Person not found.", 404);
  const parsed = employeeInput.safeParse(await readJson(req));
  if (!parsed.success) return fail(firstError(parsed.error));
  try {
    const employee = await updateEmployee(session.orgId, params.id, parsed.data);
    return employee ? json({ employee }) : fail("Person not found.", 404);
  } catch (err) {
    if (err instanceof DuplicateWalletError) return fail(err.message, 409);
    throw err;
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const params = await ctx.params;
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  if (!UUID_RE.test(params.id)) return fail("Person not found.", 404);
  return (await deleteEmployee(session.orgId, params.id)) ? json({ ok: true }) : fail("Person not found.", 404);
}
