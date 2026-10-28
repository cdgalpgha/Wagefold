import { json } from "@/lib/server/http";
import { LIMITS, rateLimited } from "@/lib/server/rate-limit";
import { endSession } from "@/lib/server/session";

export async function POST(req: Request) {
  const limited = await rateLimited(req, LIMITS.logout);
  if (limited) return limited;
  await endSession();
  return json({ ok: true });
}
