import { describe, expect, it } from "vitest";
import { chunkAddress, findLookalikes, looksAlike } from "@/lib/lookalike";

const MAYA = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC";

describe("looksAlike", () => {
  it("matches a different address with the same leading and trailing characters", () => {
    expect(looksAlike(MAYA, "0x3C44" + "1".repeat(32) + "93BC")).toBe(true);
    expect(looksAlike(MAYA, "0x3c4" + "1".repeat(33) + "3bc".padStart(4, "9"))).toBe(true); // 3 + 4, case-insensitive
  });

  it("ignores the same address, unrelated addresses and too-short matches", () => {
    expect(looksAlike(MAYA, MAYA.toLowerCase())).toBe(false);
    expect(looksAlike(MAYA, "0x70997970C51812dc3A010C7d01b50e0d17dc79C8")).toBe(false);
    expect(looksAlike(MAYA, "0x3C4" + "1".repeat(34) + "BC")).toBe(false); // 3 + 2
    expect(looksAlike(MAYA, "0x3C44")).toBe(false);
  });
});

describe("findLookalikes", () => {
  it("names the wallet it resembles", () => {
    const fake = "0x3C44" + "0".repeat(32) + "93BC";
    expect(findLookalikes([{ wallet: fake, name: "New" }], [{ wallet: MAYA, name: "Maya" }])).toEqual([
      { wallet: fake, name: "New", resembles: MAYA, resemblesName: "Maya" },
    ]);
  });
});

describe("chunkAddress", () => {
  it("splits into 4-character groups for reading aloud", () => {
    expect(chunkAddress(MAYA)).toEqual(["0x3C44", "CdDd", "B6a9", "00fa", "2b58", "5dd2", "99e0", "3d12", "FA42", "93BC"]);
  });
});
