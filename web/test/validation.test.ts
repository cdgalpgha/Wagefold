import { describe, expect, it } from "vitest";
import { orgPatchInput, employeeInput, parseEmployeesCsv } from "@/lib/validation";

const wallet = "0xdc582558deb4e0ee768ba37968af85af7b0639a8";

describe("employeeInput", () => {
  it("normalizes a valid employee", () => {
    const r = employeeInput.parse({ name: "  Priya Nair ", role: "Head of Finance", wallet, amount: "9,400", token: "USDC" });
    expect(r).toEqual({
      name: "Priya Nair",
      role: "Head of Finance",
      wallet: "0xDC582558dEb4E0Ee768bA37968Af85af7b0639a8", // EIP-55 checksummed
      amount: "9400",
      token: "USDC",
      email: "",
      address: "",
      taxId: "",
    });
  });

  it("accepts optional invoice details and rejects a malformed email", () => {
    const base = { name: "A", wallet, amount: "1", token: "USDC" };
    expect(employeeInput.parse({ ...base, email: " a@b.co ", address: "1 Road\nTown", taxId: " X1 " })).toMatchObject({ email: "a@b.co", address: "1 Road\nTown", taxId: "X1" });
    expect(employeeInput.safeParse({ ...base, email: "not-an-email" }).success).toBe(false);
    expect(employeeInput.safeParse({ ...base, email: "<a@b.co>" }).success).toBe(false);
    expect(employeeInput.safeParse({ ...base, taxId: "x".repeat(51) }).success).toBe(false);
  });

  it("rejects bad wallets, the zero address, bad amounts and unknown tokens", () => {
    const base = { name: "A", role: "", wallet, amount: "1", token: "USDC" };
    expect(employeeInput.safeParse({ ...base, wallet: "0x123" }).success).toBe(false);
    expect(employeeInput.safeParse({ ...base, wallet: "dc582558deb4e0ee768ba37968af85af7b0639a8" }).success).toBe(false);
    expect(employeeInput.safeParse({ ...base, wallet: "0x0000000000000000000000000000000000000000" }).success).toBe(false);
    expect(employeeInput.safeParse({ ...base, amount: "0" }).success).toBe(false);
    expect(employeeInput.safeParse({ ...base, amount: "-1" }).success).toBe(false);
    expect(employeeInput.safeParse({ ...base, token: "DAI" }).success).toBe(false);
    expect(employeeInput.safeParse({ ...base, name: "   " }).success).toBe(false);
  });

  it("rejects a mixed-case address with a wrong checksum", () => {
    const badChecksum = "0xDC582558dEb4E0eE768ba37968aF85Af7B0639a8";
    expect(employeeInput.safeParse({ name: "A", role: "", wallet: badChecksum, amount: "1", token: "USDC" }).success).toBe(false);
  });
});

describe("parseEmployeesCsv", () => {
  it("parses rows, quoted fields and defaults the token to USDC", () => {
    const csv = `Name,Role,Wallet,Amount,Token\n"Gómez, Lucía",Designer,${wallet},"6,900",usdt\nAda,Engineer,${wallet},5000,\n`;
    const { rows, error } = parseEmployeesCsv(csv);
    expect(error).toBeUndefined();
    expect(rows).toEqual([
      { name: "Gómez, Lucía", role: "Designer", wallet, amount: "6,900", token: "USDT" },
      { name: "Ada", role: "Engineer", wallet, amount: "5000", token: "USDC" },
    ]);
  });

  it("reports missing columns", () => {
    expect(parseEmployeesCsv("name,role\nA,B").error).toBe("Missing columns: wallet, amount.");
    expect(parseEmployeesCsv("").error).toBe("The file is empty.");
  });
});

describe("orgPatchInput", () => {
  it("accepts invoice settings and rejects unknown fields and bad prefixes", () => {
    expect(orgPatchInput.parse({ legalName: " Acme Ltd ", invoicePrefix: "AC-2026/" })).toEqual({ legalName: "Acme Ltd", invoicePrefix: "AC-2026/" });
    expect(orgPatchInput.safeParse({ invoicePrefix: "<script>" }).success).toBe(false);
    expect(orgPatchInput.safeParse({ invoicePrefix: "x".repeat(13) }).success).toBe(false);
    expect(orgPatchInput.safeParse({ ownerAddress: "0x1" }).success).toBe(false);
  });
});

describe("addresses", () => {
  it("allow up to 6 lines so invoices stay on one page", () => {
    const base = { name: "A", wallet: "0xdc582558deb4e0ee768ba37968af85af7b0639a8", amount: "1", token: "USDC" };
    expect(employeeInput.safeParse({ ...base, address: "1\n2\n3\n4\n5\n6" }).success).toBe(true);
    expect(employeeInput.safeParse({ ...base, address: "1\n2\n3\n4\n5\n6\n7" }).success).toBe(false);
    expect(orgPatchInput.safeParse({ address: "a\n".repeat(50) + "x" }).success).toBe(false);
  });
});

describe("control characters", () => {
  const base = { name: "A", wallet: "0xdc582558deb4e0ee768ba37968af85af7b0639a8", amount: "1", token: "USDC" };
  it("rejects NUL and other control characters, but keeps line breaks in addresses", () => {
    expect(employeeInput.safeParse({ ...base, address: "1 Road\nTown" }).success).toBe(true);
    expect(employeeInput.safeParse({ ...base, address: "a\u0000b" }).success).toBe(false);
    expect(employeeInput.safeParse({ ...base, address: "a\u001bb" }).success).toBe(false);
    expect(employeeInput.safeParse({ ...base, taxId: "X\u0000" }).success).toBe(false);
    expect(employeeInput.safeParse({ ...base, email: "a\u0000@b.co" }).success).toBe(false);
    expect(orgPatchInput.safeParse({ invoiceNote: "thanks\u0000" }).success).toBe(false);
    expect(orgPatchInput.safeParse({ invoiceNote: "line\nbreak" }).success).toBe(false);
  });
});
