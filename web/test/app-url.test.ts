import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("wallet metadata", () => {
  it("uses the configured public URL, without a trailing slash, and its icon", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://wagefold.app/");
    const { walletMetadata } = await import("@/lib/app-url");
    const m = walletMetadata("https://evil.example");
    expect(m.url).toBe("https://wagefold.app");
    expect(m.icons).toEqual(["https://wagefold.app/icon-512.png"]);
  });

  it("falls back to the page's own origin, so the address always matches the page", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    const { walletMetadata } = await import("@/lib/app-url");
    expect(walletMetadata("https://staging.wagefold.app").url).toBe("https://staging.wagefold.app");
  });
});
