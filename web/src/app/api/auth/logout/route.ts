import { json } from "@/lib/server/http";
import { clearSessionCookie } from "@/lib/server/session";

export async function POST() {
  clearSessionCookie();
  return json({ ok: true });
}
