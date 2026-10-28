import { describe, expect, it } from "vitest";
import { awaitingSafe, isSafeTreasury } from "@/lib/safe";

const addr = "0x1111111111111111111111111111111111111111" as const;
const reader = (code: `0x${string}` | undefined, threshold: bigint | Error) => ({
  getCode: async () => code,
  readContract: async () => {
    if (threshold instanceof Error) throw threshold;
    return threshold;
  },
});

describe("Safe treasury", () => {
  it("treats the Safe app connector as a Safe without asking the chain", async () => {
    expect(await isSafeTreasury(reader(undefined, new Error("unused")), addr, "safe")).toBe(true);
  });

  it("recognises a Safe by its threshold, and nothing else", async () => {
    expect(await isSafeTreasury(reader("0x6080", 2n), addr)).toBe(true);
    expect(await isSafeTreasury(reader("0x", 2n), addr)).toBe(false); // a plain wallet has no code
    expect(await isSafeTreasury(reader(undefined, 2n), addr)).toBe(false);
    expect(await isSafeTreasury(reader("0x6080", new Error("reverted")), addr)).toBe(false); // another smart wallet
    expect(await isSafeTreasury(reader("0x6080", 0n), addr)).toBe(false);
  });

  it("is waiting on signers only while there is a proposal and no transaction yet", () => {
    expect(awaitingSafe({ status: "submitted", txHash: null, safeTxHash: "0xab" })).toBe(true);
    expect(awaitingSafe({ status: "submitted", txHash: `0x${"1".repeat(64)}`, safeTxHash: "0xab" })).toBe(false);
    expect(awaitingSafe({ status: "submitted", txHash: null, safeTxHash: null })).toBe(false);
    expect(awaitingSafe({ status: "confirmed", txHash: null, safeTxHash: "0xab" })).toBe(false);
  });
});
