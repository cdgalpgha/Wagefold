import { afterEach, describe, expect, it, vi } from "vitest";
import { base, baseSepolia } from "viem/chains";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("browser RPC", () => {
  it("uses the chain's public endpoint when no provider is set", async () => {
    vi.stubEnv("NEXT_PUBLIC_RPC_URL_8453", "");
    const { transportFor } = await import("@/lib/rpc");
    expect(transportFor(8453)({ chain: base }).config.key).toBe("http");
  });

  it("tries your provider first and falls back to the public endpoint", async () => {
    vi.stubEnv("NEXT_PUBLIC_RPC_URL_84532", "https://base-sepolia.example-provider.io/v2/key");
    const { transportFor } = await import("@/lib/rpc");
    const t = transportFor(84532)({ chain: baseSepolia });
    expect(t.config.key).toBe("fallback");
    expect((t.value as { transports: unknown[] }).transports).toHaveLength(2);
  });
});
