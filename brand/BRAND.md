# Wagefold brand

Wagefold is payroll for teams that pay in stablecoins. The brand borrows from payroll's own objects, the cheque and the payslip printed on security paper: sage paper, green-black ink, an engraving green, and the fine guilloché lines banknotes use to make copying hard. It should feel exact and trustworthy with real money, and never like a generic fintech.

![Brand guidelines](brand-guidelines.png)

## Logo

| File | Use |
| --- | --- |
| `wagefold-logo.svg` | Primary. On white or light backgrounds. |
| `wagefold-logo-dark.svg` | On dark backgrounds and in dark mode. |
| `wagefold-logo-mono-black.svg` / `-mono-white.svg` | One colour: print, stamps, embossing, partner pages that need a single colour. |
| `wagefold-mark.svg` / `wagefold-mark-dark.svg` | The mark alone, where the name is already present or space is tight. |
| `wagefold-app-icon.svg`, `wagefold-app-icon-512.png` | App and favicon. White and mint mark on engraving green. |

The mark is two interlocking strokes that read as a **W** and as a **folded ribbon** (wage + fold). The wordmark is Geist SemiBold converted to outlines, so the logo never depends on a font being installed.

- **Clear space:** one stroke width of the mark on every side.
- **Minimum size:** mark 16 px; full logo 80 px wide.
- **Don't** recolour the strokes outside the palette, add effects or outlines, rotate it, or set the name in another typeface.

In the app the logo is an inline SVG whose colours are theme tokens (`--c-logo-a`, `--c-logo-b`, `--c-ink`), so it switches with light and dark mode.

## Colour

All colours are CSS variables (`web/src/app/globals.css`) used through Tailwind tokens. Components never use raw hex, so the light and dark themes stay in one place.

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `canvas` | `#EBEFE8` | `#0B110E` | Page background: the security paper |
| `surface` / `surface-2` | `#F8FAF5` / `#F1F4ED` | `#111915` / `#161F1A` | Sheets (cards, inputs, dialogs) and their stubs |
| `ink` / `ink-2` / `ink-3` | `#13211B` / `#42524A` / `#58665F` | `#E4ECE6` / `#A4B2A9` / `#86958C` | Text, secondary text, labels |
| `line` / `line-strong` | `#D2DACF` / `#B7C2B4` | `#233029` / `#34433B` | Hairlines; the amount rule and perforation on a cheque |
| `brand` | `#1D5A44` | `#7FD1AA` | Links, accents, focus rings, guilloché |
| `brand-solid` | `#1D5A44` | `#277656` | Filled buttons under white text |
| `brand-soft` / `brand-dark` | `#DCE9E1` / `#144231` | `#163025` / `#A9E3C6` | Selected states |
| `brass` | `#805816` | `#D6AC64` | Serial and run numbers on a cheque, nothing else |
| `night` | `#13211B` | `#141E19` | Always-dark surfaces (toasts, the gas section) |
| `good` / `warn` / `bad` | `#1C6E48` / `#7A4E00` / `#912819` | `#6ED69E` / `#E8BE6E` / `#F6ACA0` | Paid, needs attention, wrong |

Why there are two greens in dark mode: white text on a light green fails contrast, and a dark green link disappears on a dark sheet. So filled buttons use `brand-solid` (white text 5.5:1) and links use `brand` (9.9:1 on surface). Every text pairing in both themes meets WCAG AA (4.5:1 or better).

Sheets sit flat on the page with a hairline edge, the way paper does. Only menus and dialogs cast a shadow. Corners are tight: 10 px for sheets, 8 px for buttons and inputs, 4 px for badges.

The theme follows the system by default; people can pick Light or Dark in the header or Settings. The choice is stored in the browser and applied before first paint.

## Type

- **Archivo**, set wide (118% width, weight 640), for page titles, the cheque's "Pay" line and its amounts. Wide lettering is what banknotes and cheques use for value; keep it to those places.
- **Geist** for everything you read: Regular for text, SemiBold for section headings and labels.
- **Geist Mono** only for addresses, hashes and serial numbers. Amounts use Geist or Archivo with tabular figures and always show two decimals (`9,400.00 USDC`). When a person must check an address, show it in groups of four (`0x3C44 CdDd B6a9 …`), first and last groups bold.
- Small caps labels (11–12 px, +0.14em tracking) name the fields on a cheque: Pay, The sum of, Signed by, Memo.

## The cheque

The payroll run is drawn as a cheque, because that is what it is: one signed instrument that pays the whole team.

- A guilloché band across the top (`web/src/components/Security.tsx`) with the company on the left and the run number in brass on the right. The pattern is generated from fixed waves, so it is identical everywhere and never animates.
- "Pay N people", "The sum of" with one line per token, and "Signed by" naming the approvers and the treasury.
- A perforated tear line with punched notches, then the stub: the main action and a memo of where the numbers come from.
- Badges read like rubber stamps: small caps in a squared box.

## Documents

Invoices and payment statements are generated as A4 PDFs with one template:

- 6 pt engraving-green rule across the top
- logo top left, document type and number top right, green **PAID** pill
- label-over-value fields in small caps
- the amount is the largest type on the page
- the on-chain transaction is printed as proof of payment
- footer: the mark and "Generated with Wagefold"

PDFs use the standard Helvetica and Courier fonts so they open anywhere; characters outside Western European scripts are reduced to their base letter.

## Voice

| Principle | Write | Not |
| --- | --- | --- |
| **Exact.** Numbers beat adjectives. | Paid 5 people · 43,400.00 USDC | Payroll processed successfully! |
| **Plain.** Finance words, not crypto slang. | Approve USDC for this run only | Grant token allowance to contract |
| **Calm about risk.** Say what can go wrong and what to do. | Confirm the full address with Maya on a call. | WARNING!!! SCAM RISK |
| **Honest.** Never imply custody or guarantees. | Wagefold never holds your money. | Bank-grade, 100% safe |

Sentence case everywhere, including buttons. No exclamation marks in the product.

## Motion

Motion is rare and functional: the treasury signature writing itself once on the landing cheque, and the mark folding in while the app loads. Everything respects `prefers-reduced-motion`; with it on, the signature is simply there.

## Social and app icons

- `social-card.png` (1200×630) is the Open Graph and Twitter image (`web/src/app/opengraph-image.png`).
- `web/src/app/icon.svg` (favicon), `apple-icon.png` (180), and `web/public/icon-192.png`, `icon-512.png`, `icon-maskable-512.png` for the web manifest.

Third-party wallet and token logos are in `third-party/` with their sources and licences. Use them only to say Wagefold works with those products.
