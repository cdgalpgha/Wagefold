import { afterEach, describe, expect, it, vi } from "vitest";
import { logError, redact, sentryEnvelope, sentryTarget } from "@/lib/server/log";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("server logs", () => {
  it("never writes an RPC URL's path or query, where providers put API keys", () => {
    expect(redact('HTTP request failed. URL: https://base-mainnet.g.alchemy.com/v2/SECRETKEY123 Status: 429')).toBe(
      "HTTP request failed. URL: https://base-mainnet.g.alchemy.com/… Status: 429",
    );
    expect(redact("wss://user:pass@rpc.example/ws?key=abc")).toBe("wss://rpc.example/…");
    expect(redact("no urls here")).toBe("no urls here");
  });

  it("logs one JSON line per error, with context and without secrets", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    logError("price_feed_read_failed", new Error("call to https://rpc.example/v2/KEY reverted"), { chainId: 8453 });
    const entry = JSON.parse(spy.mock.calls[0][0] as string);
    expect(entry).toMatchObject({ level: "error", event: "price_feed_read_failed", error: "Error", chainId: 8453 });
    expect(entry.message).toBe("call to https://rpc.example/… reverted");
    expect(JSON.stringify(entry)).not.toContain("KEY");
  });

  it("reads a Sentry DSN and builds an envelope, and refuses anything but https", () => {
    const dsn = "https://abc123@o42.ingest.sentry.io/4507";
    expect(sentryTarget(dsn)).toEqual({
      url: "https://o42.ingest.sentry.io/api/4507/envelope/",
      auth: "Sentry sentry_version=7, sentry_key=abc123, sentry_client=wagefold/1",
      dsn,
    });
    expect(sentryTarget("http://abc@sentry.local/1")).toBeNull();
    expect(sentryTarget("https://sentry.io/1")).toBeNull();
    expect(sentryTarget("not a url")).toBeNull();
    expect(sentryTarget(undefined)).toBeNull();
    const lines = sentryEnvelope({ event: "request_error", error: "TypeError", message: "boom", time: "2026-10-28T00:00:00.000Z", path: "/api/runs" }, dsn).split("\n");
    expect(lines).toHaveLength(3);
    expect(JSON.parse(lines[1])).toEqual({ type: "event" });
    const event = JSON.parse(lines[2]);
    expect(event.exception.values[0]).toEqual({ type: "TypeError", value: "boom" });
    expect(event.extra.path).toBe("/api/runs");
  });

  it("sends errors to Sentry only when SENTRY_DSN is set", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null));
    logError("x", new Error("a"));
    expect(fetch).not.toHaveBeenCalled();
    vi.stubEnv("SENTRY_DSN", "https://abc@o1.ingest.sentry.io/2");
    logError("x", new Error("b"));
    await Promise.resolve();
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch.mock.calls[0][0]).toBe("https://o1.ingest.sentry.io/api/2/envelope/");
  });
});
