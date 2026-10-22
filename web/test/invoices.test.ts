import { PDFDocument, StandardFonts } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { buildInvoice, invoiceFilename, invoiceLabel, periodLabel } from "@/lib/invoices";
import { invoicesPdf, payslipPdf, pdfSafe } from "@/lib/pdf";
import { payslip } from "@/lib/records";
import type { Org, Run } from "@/lib/types";

const org: Org = {
  id: "o1", name: "Northwind", ownerAddress: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266", payDay: null,
  legalName: "Northwind Labs Ltd", address: "1 Harbour St\nLondon", taxId: "GB1", invoicePrefix: "NW-", invoiceNote: "Thanks",
};
const run: Run = {
  id: "r1", chainId: 8453, onchainRef: "0x01", status: "confirmed", failureReason: null, txHash: `0x${"ab".repeat(32)}`,
  recipientCount: 1, totals: {}, createdAt: "2026-10-31T10:00:00Z", confirmedAt: "2026-10-31T10:00:00Z", paidAt: "2026-10-31T10:00:02Z",
  blockNumber: "1", networkFee: "0.00001", usdRates: { USDC: { rate: "0.9998", source: "Chainlink USDC/USD" } },
};
const item = { employeeId: "e1", name: "Lucía Gómez", role: "Designer", wallet: "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65", amount: "6900", token: "USDC" as const };

describe("buildInvoice", () => {
  it("snapshots supplier, customer, amount, rate and payment proof", () => {
    const inv = buildInvoice(org, run, item, { email: "l@x.es", address: "Madrid", taxId: "ES1" }, 12);
    expect(inv.label).toBe("NW-0012");
    expect(inv.period).toBe("2026-10");
    expect(inv.description).toBe("Designer services, October 2026");
    expect(inv.supplier).toMatchObject({ name: "Lucía Gómez", address: "Madrid", taxId: "ES1", email: "l@x.es", wallet: item.wallet });
    expect(inv.customer).toMatchObject({ name: "Northwind Labs Ltd", taxId: "GB1", wallet: org.ownerAddress });
    expect(inv.usd).toBe("6898.62");
    expect(inv.txHash).toBe(run.txHash);
    expect(inv.note).toBe("Thanks");
  });

  it("falls back to the company name and plain services when details are missing", () => {
    const inv = buildInvoice({ ...org, legalName: null, address: null, taxId: null }, run, { ...item, role: "" }, undefined, 1);
    expect(inv.customer.name).toBe("Northwind");
    expect(inv.description).toBe("Services, October 2026");
    expect(inv.supplier.address).toBe("");
  });

  it("formats labels, periods and safe file names", () => {
    expect(invoiceLabel("", 7)).toBe("0007");
    expect(periodLabel("2026-02")).toBe("February 2026");
    expect(invoiceFilename({ label: "NW/2026-0001", supplier: { name: "../../etc/passwd" } as never })).toBe("invoice-NW-2026-0001-etc-passwd.pdf");
  });
});

describe("pdf", () => {
  it("writes one A4 page per invoice with readable metadata", async () => {
    const a = buildInvoice(org, run, item, undefined, 1);
    const b = buildInvoice(org, run, { ...item, name: "李 Wei" }, undefined, 2);
    const bytes = await invoicesPdf([a, b]);
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(2);
    expect(doc.getTitle()).toBe("Invoices NW-0001 to NW-0002");
    expect(Math.round(doc.getPage(0).getWidth())).toBe(595);
  });

  it("makes a one-page payslip", async () => {
    const slip = payslip([{ run, items: [item] }], "Northwind", org.ownerAddress, "r1", 0)!;
    const doc = await PDFDocument.load(await payslipPdf(slip));
    expect(doc.getPageCount()).toBe(1);
  });

  it("keeps characters the font can draw and replaces the rest", async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    expect(pdfSafe(font, "Lucía Gómez")).toBe("Lucía Gómez");
    expect(pdfSafe(font, "Łukasz Dvořák")).toBe("Lukasz Dvorák"); // á is in the font, ř is not
    expect(pdfSafe(font, "李")).toBe("?");
    expect(pdfSafe(font, "a\tb\r")).toBe("a b ");
  });
});
