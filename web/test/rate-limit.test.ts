import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const session = vi.hoisted(() => ({ key: null as string | null }));
vi.mock("@/lib/server/session", () => ({ sessionKey: async () => session.key }));

const { clientIp, hit, rateLimited } = await import("@/lib/server/rate-limit");

afterEach(() => {
  vi.unstubAllEnvs();
  session.key = null;
});

describe("rate limits", () => {
  it("allows max requests per window, then says how long to wait, then resets", () => {
    const t = 1_000_000;
    for (let i = 0; i < 3; i++) expect(hit("t1", 3, 60_000, t + i)).toBeNull();
    expect(hit("t1", 3, 60_000, t + 10_000)).toBe(50);
    expect(hit("t2", 3, 60_000, t + 10_000)).toBeNull(); // other keys are counted apart
    expect(hit("t1", 3, 60_000, t + 60_000)).toBeNull();
  });

  it("trusts X-Forwarded-For only behind a proxy the operator vouches for, and only a plausible IP", () => {
    const h = (v: string) => new Headers({ "x-forwarded-for": v });
    expect(clientIp(h("203.0.113.9"))).toBeNull();
    vi.stubEnv("TRUST_PROXY", "1");
    expect(clientIp(h("203.0.113.9, 10.0.0.1"))).toBe("203.0.113.9");
    expect(clientIp(h("2001:db8::1"))).toBe("2001:db8::1");
    expect(clientIp(h("<script>"))).toBeNull();
    expect(clientIp(h("1".repeat(100)))).toBeNull();
    expect(clientIp(new Headers())).toBeNull();
  });

  it("answers 429 with Retry-After, keyed by session before IP", async () => {
    vi.stubEnv("TRUST_PROXY", "1");
    const limit = { name: "unit", max: 2, anonMax: 100, windowMs: 60_000 };
    const req = (ip: string) => new Request("http://x/api/auth/verify", { headers: { "x-forwarded-for": ip } });
    expect(await rateLimited(req("198.51.100.1"), limit)).toBeNull();
    expect(await rateLimited(req("198.51.100.1"), limit)).toBeNull();
    const res = await rateLimited(req("198.51.100.1"), limit);
    expect(res?.status).toBe(429);
    expect(Number(res?.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(await rateLimited(req("198.51.100.2"), limit)).toBeNull();
    // A signed-in session has its own allowance, whatever IP it claims.
    session.key = "s1";
    expect(await rateLimited(req("198.51.100.1"), limit)).toBeNull();
  });
});
