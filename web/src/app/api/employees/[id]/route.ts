import { NextResponse } from "next/server";
import { fail, json, readJson, requireSession } from "@/lib/server/http";
import { personChanges } from "@/lib/activity";
import { deleteEmployee, DuplicateWalletError, getEmployee, logActivity, updateEmployee } from "@/lib/server/repo";
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
    const before = await getEmployee(session.orgId, params.id);
    const employee = before && (await updateEmployee(session.orgId, params.id, parsed.data));
    if (!before || !employee) return fail("Person not found.", 404);
    const changes = personChanges(before, employee);
    if (Object.keys(changes).length) {
      await logActivity(session.orgId, session.address, "person_updated", { employeeId: employee.id, name: employee.name, changes });
    }
    return json({ employee });
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
  const removed = await deleteEmployee(session.orgId, params.id);
  if (!removed) return fail("Person not found.", 404);
  const { id: employeeId, name, wallet, amount, token } = removed;
  await logActivity(session.orgId, session.address, "person_removed", { employeeId, name, wallet, amount, token });
  return json({ ok: true });
}
