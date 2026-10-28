/**
 * Branded A4 PDFs for invoices and payslips, generated in the browser with pdf-lib (no server, no
 * upload). Text uses the standard PDF fonts, which cover Western European characters; anything
 * else is reduced to its base letter or replaced, so a name can never break the file.
 */
import type { PDFDocument, PDFFont, PDFPage, RGB } from "pdf-lib";
import { BRAND, W_DARK, W_LIGHT, WORDMARK } from "./brand";
import { periodLabel, type InvoiceData } from "./invoices";
import { formatAmount } from "./money";
import { payslipDate, type Payslip } from "./records";

const A4 = { w: 595.28, h: 841.89 };
const M = 48; // page margin

type Fonts = { regular: PDFFont; bold: PDFFont; mono: PDFFont };
type Kit = { lib: typeof import("pdf-lib"); doc: PDFDocument; fonts: Fonts; color: (hex: string) => RGB };

async function kit(title: string, author: string): Promise<Kit> {
  const lib = await import("pdf-lib");
  const doc = await lib.PDFDocument.create();
  doc.setTitle(title);
  doc.setAuthor(author);
  doc.setCreator("Wagefold");
  doc.setProducer("Wagefold");
  const fonts = {
    regular: await doc.embedFont(lib.StandardFonts.Helvetica),
    bold: await doc.embedFont(lib.StandardFonts.HelveticaBold),
    mono: await doc.embedFont(lib.StandardFonts.Courier),
  };
  const color = (hex: string) => {
    const n = parseInt(hex.slice(1), 16);
    return lib.rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
  };
  return { lib, doc, fonts, color };
}

/** Keeps only characters the font can draw: "Lucía" stays, "Łukasz" becomes "Lukasz", "李" becomes "?". */
export function pdfSafe(font: PDFFont, text: string): string {
  const supported = new Set(font.getCharacterSet());
  let out = "";
  for (const ch of text.normalize("NFC").replace(/[\r\t]/g, " ")) {
    if (ch === "\n" || supported.has(ch.codePointAt(0)!)) {
      out += ch;
      continue;
    }
    const base = ch.normalize("NFD").replace(/[̀-ͯ]/g, "");
    const fallback: Record<string, string> = { "Ł": "L", "ł": "l", "Đ": "D", "đ": "d", "ı": "i", "≈": "~", "→": "->", "·": "-" };
    out += base && [...base].every((c) => supported.has(c.codePointAt(0)!)) ? base : fallback[ch] ?? "?";
  }
  return out;
}

function wrap(font: PDFFont, text: string, size: number, width: number): string[] {
  const lines: string[] = [];
  for (const para of pdfSafe(font, text).split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) <= width) {
        line = next;
        continue;
      }
      if (line) lines.push(line);
      // A single word longer than the line (a hash, an address) is broken by character.
      let rest = word;
      while (font.widthOfTextAtSize(rest, size) > width) {
        let n = rest.length;
        while (n > 1 && font.widthOfTextAtSize(rest.slice(0, n), size) > width) n--;
        lines.push(rest.slice(0, n));
        rest = rest.slice(n);
      }
      line = rest;
    }
    lines.push(line);
  }
  return lines;
}

type TextOpts = { size?: number; font?: PDFFont; color?: string; align?: "left" | "right"; width?: number; lineHeight?: number };

/** Draws wrapped text with its top at `top` (measured from the top of the page). Returns the new top. */
function text(k: Kit, page: PDFPage, value: string, x: number, top: number, o: TextOpts = {}): number {
  const size = o.size ?? 10;
  const font = o.font ?? k.fonts.regular;
  const lh = o.lineHeight ?? size * 1.4;
  const lines = o.width ? wrap(font, value, size, o.width) : [pdfSafe(font, value)];
  lines.forEach((line, i) => {
    const w = font.widthOfTextAtSize(line, size);
    const left = o.align === "right" ? x - w : x;
    page.drawText(line, { x: left, y: A4.h - top - size - i * lh, size, font, color: k.color(o.color ?? BRAND.ink) });
  });
  return top + lines.length * lh;
}

function rule(k: Kit, page: PDFPage, top: number, x1 = M, x2 = A4.w - M) {
  page.drawLine({ start: { x: x1, y: A4.h - top }, end: { x: x2, y: A4.h - top }, thickness: 0.75, color: k.color(BRAND.line) });
}

/** The Wagefold mark (and optionally the wordmark) with its top-left corner at (x, top). */
function logo(k: Kit, page: PDFPage, x: number, top: number, markSize: number, withWordmark: boolean) {
  const s = markSize / 48;
  page.drawSvgPath(W_DARK, { x, y: A4.h - top, scale: s, color: k.color(BRAND.deep) });
  page.drawSvgPath(W_LIGHT, { x, y: A4.h - top, scale: s, color: k.color(BRAND.green) });
  if (withWordmark) {
    // Wordmark glyphs span y 29.5–116.7 in their own units; scale them to the mark's cap height.
    const ws = (markSize * 0.82) / 87;
    page.drawSvgPath(WORDMARK, { x: x + markSize * 1.25, y: A4.h - top + 29.5 * ws - markSize * 0.12, scale: ws, color: k.color(BRAND.ink) });
  }
}

function money(v: string): string {
  return formatAmount(v);
}

function header(k: Kit, page: PDFPage, title: string, subtitle: string) {
  page.drawRectangle({ x: 0, y: A4.h - 6, width: A4.w, height: 6, color: k.color(BRAND.green) });
  logo(k, page, M, 40, 22, true);
  text(k, page, title, A4.w - M, 38, { size: 20, font: k.fonts.bold, align: "right" });
  text(k, page, subtitle, A4.w - M, 64, { size: 10, color: BRAND.ink2, align: "right" });
}

function pill(k: Kit, page: PDFPage, label: string, right: number, top: number) {
  const size = 8.5;
  const w = k.fonts.bold.widthOfTextAtSize(label, size) + 16;
  page.drawRectangle({ x: right - w, y: A4.h - top - 16, width: w, height: 16, color: k.color(BRAND.goodSoft) });
  text(k, page, label, right - 8, top + 4, { size, font: k.fonts.bold, color: BRAND.good, align: "right" });
}

function footer(k: Kit, page: PDFPage, line: string) {
  rule(k, page, A4.h - 46);
  logo(k, page, M, A4.h - 38, 11, false);
  text(k, page, line, M + 16, A4.h - 36, { size: 7.5, color: BRAND.ink3, width: A4.w - 2 * M - 16 });
}

/** Label above value, the way the meta row and party blocks read. */
function field(k: Kit, page: PDFPage, label: string, value: string, x: number, top: number, width: number, mono = false): number {
  text(k, page, label.toUpperCase(), x, top, { size: 7, font: k.fonts.bold, color: BRAND.ink3 });
  return text(k, page, value || "—", x, top + 12, { size: mono ? 8 : 10, font: mono ? k.fonts.mono : k.fonts.regular, width });
}

function party(k: Kit, page: PDFPage, heading: string, p: InvoiceData["supplier"], x: number, top: number, width: number): number {
  text(k, page, heading.toUpperCase(), x, top, { size: 7, font: k.fonts.bold, color: BRAND.ink3 });
  let y = text(k, page, p.name, x, top + 13, { size: 11.5, font: k.fonts.bold, width });
  if (p.role) y = text(k, page, p.role, x, y + 1, { size: 9.5, color: BRAND.ink2, width });
  if (p.address) y = text(k, page, p.address, x, y + 4, { size: 9.5, width });
  if (p.taxId) y = text(k, page, `Tax ID: ${p.taxId}`, x, y + 4, { size: 9.5, width });
  if (p.email) y = text(k, page, p.email, x, y + 2, { size: 9.5, color: BRAND.ink2, width });
  y = text(k, page, "Wallet", x, y + 6, { size: 7, font: k.fonts.bold, color: BRAND.ink3 });
  return text(k, page, p.wallet, x, y + 1, { size: 8, font: k.fonts.mono, width });
}

function drawInvoice(k: Kit, page: PDFPage, inv: InvoiceData) {
  const W = A4.w - 2 * M;
  header(k, page, "INVOICE", inv.label);
  pill(k, page, "PAID", A4.w - M, 84);

  // Meta row
  const col = W / 4;
  const issued = payslipDate(inv.issuedAt);
  field(k, page, "Invoice number", inv.label, M, 124, col - 10);
  field(k, page, "Issue date", issued, M + col, 124, col - 10);
  field(k, page, "Service period", periodLabel(inv.period), M + 2 * col, 124, col - 10);
  field(k, page, "Amount due", `0.00 ${inv.token} (paid)`, M + 3 * col, 124, col - 10);
  rule(k, page, 166);

  // Parties
  const half = W / 2;
  const a = party(k, page, "From", inv.supplier, M, 184, half - 20);
  const b = party(k, page, "Bill to", inv.customer, M + half, 184, half - 20);
  let top = Math.max(a, b) + 26;

  // Line items
  const cDesc = M + 10;
  const cQty = M + W * 0.6;
  const cUnit = M + W * 0.8;
  const cAmt = A4.w - M - 10;
  page.drawRectangle({ x: M, y: A4.h - top - 24, width: W, height: 24, color: k.color(BRAND.canvas) });
  for (const [label, x, align] of [["Description", cDesc, "left"], ["Qty", cQty, "right"], ["Unit price", cUnit, "right"], ["Amount", cAmt, "right"]] as const) {
    text(k, page, label.toUpperCase(), x, top + 8, { size: 7, font: k.fonts.bold, color: BRAND.ink3, align });
  }
  top += 34;
  const amount = `${money(inv.amount)} ${inv.token}`;
  const rowEnd = text(k, page, inv.description, cDesc, top, { size: 10, width: W * 0.5 });
  text(k, page, "1", cQty, top, { size: 10, align: "right" });
  text(k, page, amount, cUnit, top, { size: 10, align: "right" });
  text(k, page, amount, cAmt, top, { size: 10, align: "right" });
  top = rowEnd + 10;
  rule(k, page, top);

  // Totals
  top += 14;
  const labelX = M + W * 0.62;
  text(k, page, "Subtotal", labelX, top, { size: 10, color: BRAND.ink2 });
  text(k, page, amount, cAmt, top, { size: 10, align: "right" });
  top += 22;
  text(k, page, "Total", labelX, top, { size: 12, font: k.fonts.bold });
  text(k, page, amount, cAmt, top - 1, { size: 13, font: k.fonts.bold, align: "right" });
  top += 20;
  const usdNote = inv.rate.source.startsWith("par") ? "at par (1 token = 1 USD)" : `at ${inv.rate.rate} USD per ${inv.token}`;
  top = text(k, page, `~ ${money(inv.usd)} USD ${usdNote}`, cAmt, top, { size: 8.5, color: BRAND.ink2, align: "right" });

  // Payment
  top += 26;
  const boxTop = top;
  const inner = W - 28;
  let y = text(k, page, `Paid in full on ${issued}`, M + 14, boxTop + 14, { size: 10.5, font: k.fonts.bold, color: BRAND.good });
  y = text(k, page, `${amount} sent on ${inv.chain} from the wallet above to the supplier's wallet, in one verified on-chain payroll transaction.`, M + 14, y + 3, { size: 9, color: BRAND.ink2, width: inner });
  if (inv.txHash) {
    y = text(k, page, "TRANSACTION", M + 14, y + 8, { size: 7, font: k.fonts.bold, color: BRAND.ink3 });
    y = text(k, page, inv.txHash, M + 14, y + 1, { size: 8, font: k.fonts.mono, width: inner });
    if (inv.explorer) y = text(k, page, inv.explorer, M + 14, y + 2, { size: 8, color: BRAND.green, width: inner });
  }
  const boxBottom = y + 14;
  page.drawRectangle({ x: M, y: A4.h - boxBottom, width: W, height: boxBottom - boxTop, borderColor: k.color(BRAND.line), borderWidth: 0.75 });

  // Notes
  top = boxBottom + 24;
  if (inv.note) top = text(k, page, inv.note, M, top, { size: 9, width: W }) + 8;
  text(
    k,
    page,
    `Self-billed invoice: issued by ${inv.customer.name} on behalf of ${inv.supplier.name}. Amounts are in ${inv.token}; no tax has been added or withheld by Wagefold.`,
    M,
    top,
    { size: 8, color: BRAND.ink3, width: W },
  );

  footer(k, page, `Generated with Wagefold - payroll run ${inv.runId} - verified on-chain`);
}

/** One page per invoice; pass several to get a single PDF for a whole run or month. */
export async function invoicesPdf(invoices: InvoiceData[]): Promise<Uint8Array> {
  const first = invoices[0];
  const k = await kit(
    invoices.length === 1 ? `Invoice ${first.label}` : `Invoices ${first.label} to ${invoices[invoices.length - 1].label}`,
    first?.customer.name ?? "Wagefold",
  );
  for (const inv of invoices) drawInvoice(k, k.doc.addPage([A4.w, A4.h]), inv);
  return k.doc.save();
}

export async function payslipPdf(p: Payslip): Promise<Uint8Array> {
  const k = await kit(`Payment statement ${p.name} ${p.paidAt.slice(0, 10)}`, p.employer);
  const page = k.doc.addPage([A4.w, A4.h]);
  const W = A4.w - 2 * M;
  header(k, page, "PAYMENT STATEMENT", p.employer);
  pill(k, page, "PAID", A4.w - M, 84);

  let top = 124;
  text(k, page, "PAID TO", M, top, { size: 7, font: k.fonts.bold, color: BRAND.ink3 });
  top = text(k, page, p.name, M, top + 13, { size: 14, font: k.fonts.bold, width: W });
  if (p.role) top = text(k, page, p.role, M, top + 1, { size: 10, color: BRAND.ink2, width: W });
  top += 18;
  top = text(k, page, `${money(p.amount)} ${p.token}`, M, top, { size: 28, font: k.fonts.bold });
  const usdNote = p.rate.source.startsWith("par") ? "at par (1 token = 1 USD)" : `at ${p.rate.rate} USD per ${p.token} (${p.rate.source})`;
  top = text(k, page, `~ ${money(p.usd)} USD ${usdNote}`, M, top + 2, { size: 9.5, color: BRAND.ink2, width: W });
  top += 18;
  rule(k, page, top);

  const ytdTokens = (["USDC", "USDT"] as const).filter((t) => p.ytd.tokens[t]).map((t) => `${money(p.ytd.tokens[t]!)} ${t}`).join(" + ");
  const rows: [string, string, boolean?][] = [
    ["Paid on", `${payslipDate(p.paidAt)} (UTC)`],
    ["Network", p.chain],
    ["Recipient wallet", p.wallet, true],
    ["Paid from", p.payer, true],
    ["Transaction", p.txHash ?? "—", true],
    [`Year to date (${p.ytd.year})`, `${ytdTokens}  (~ ${money(p.ytd.usd)} USD over ${p.ytd.payments} ${p.ytd.payments === 1 ? "payment" : "payments"})`],
    ["Payroll run", p.runId, true],
  ];
  for (const [label, value, mono] of rows) {
    top += 10;
    text(k, page, label, M, top, { size: 9.5, color: BRAND.ink2 });
    top = text(k, page, value, M + 150, top, { size: mono ? 8.5 : 10, font: mono ? k.fonts.mono : k.fonts.regular, width: W - 150 }) + 8;
    rule(k, page, top);
  }
  if (p.explorer) top = text(k, page, p.explorer, M + 150, top + 8, { size: 8, color: BRAND.green, width: W - 150 });
  top += 24;
  text(
    k,
    page,
    "The transaction above is the proof of payment: anyone can check it on a block explorer. Wagefold does not withhold tax; the amount shown is what was sent. Check how this income is taxed where you live.",
    M,
    top,
    { size: 8.5, color: BRAND.ink3, width: W },
  );
  footer(k, page, "Generated with Wagefold - verified on-chain");
  return k.doc.save();
}
