import { describe, expect, it } from "vitest";
import { LIVE, LIVE_SLOW } from "@/lib/live";

describe("live updates", () => {
  it("polls shared payroll data every 10 seconds, only while the tab is visible, and on return", () => {
    expect(LIVE.refetchInterval).toBe(10_000);
    expect(LIVE.refetchIntervalInBackground).toBe(false);
    expect(LIVE.refetchOnWindowFocus).toBe(true);
  });

  it("polls slower-changing data less often", () => {
    expect(LIVE_SLOW.refetchInterval).toBeGreaterThan(LIVE.refetchInterval);
    expect(LIVE_SLOW.refetchIntervalInBackground).toBe(false);
  });
});
