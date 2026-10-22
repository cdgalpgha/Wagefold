# Wagefold brand

Wagefold is payroll for teams that pay in stablecoins. The brand should feel like a good finance tool: calm, exact, and trustworthy with real money. One confident blue, precise numbers, plain words.

![Brand guidelines](brand-guidelines.png)

## Logo

| File | Use |
| --- | --- |
| `wagefold-logo.svg` | Primary. On white or light backgrounds. |
| `wagefold-logo-dark.svg` | On dark backgrounds and in dark mode. |
| `wagefold-logo-mono-black.svg` / `-mono-white.svg` | One colour: print, stamps, embossing, partner pages that need a single colour. |
| `wagefold-mark.svg` / `wagefold-mark-dark.svg` | The mark alone, where the name is already present or space is tight. |
| `wagefold-app-icon.svg`, `wagefold-app-icon-512.png` | App and favicon. White mark on brand blue. |

The mark is two interlocking strokes that read as a **W** and as a **folded ribbon** (wage + fold). The wordmark is Geist SemiBold converted to outlines, so the logo never depends on a font being installed.

- **Clear space:** one stroke width of the mark on every side.
- **Minimum size:** mark 16 px; full logo 80 px wide.
- **Don't** recolour the strokes outside the palette, add effects or outlines, rotate it, or set the name in another typeface.

In the app the logo is an inline SVG whose colours are theme tokens (`--c-logo-a`, `--c-logo-b`, `--c-ink`), so it switches with light and dark mode.

## Colour

All colours are CSS variables (`web/src/app/globals.css`) used through Tailwind tokens. Components never use raw hex, so the light and dark themes stay in one place.

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `canvas` | `#F5F6F8` | `#0A0D14` | Page background |
| `surface` | `#FFFFFF` | `#121722` | Cards, inputs, dialogs |
| `ink` / `ink-2` / `ink-3` | `#0E1420` / `#4A5363` / `#5B6472` | `#E8ECF3` / `#A3ACBC` / `#8A93A3` | Text, secondary text, hints |
| `line` | `#E3E6EB` | `#272E3D` | Borders, dividers |
| `brand` | `#2647D9` | `#7C95FF` | Links, accents, focus rings |
| `brand-solid` | `#2647D9` | `#3B5BE6` | Filled buttons and bands under white text |
| `brand-soft` / `brand-dark` | `#EBEFFD` / `#1A35B0` | `#1B2348` / `#A9BAFF` | Selected states and badges |
| `night` | `#0E1420` | `#1F2636` | Always-dark surfaces (toasts, the gas section) |
| `good` / `warn` / `bad` | `#0B6B42` / `#7A4700` / `#B42318` | `#4ADE9A` / `#F5C26B` / `#F87171` | Paid, needs attention, wrong |

Why there are two blues in dark mode: white text on a bright blue fails contrast, and a dark blue link disappears on a dark card. So filled buttons use `brand-solid` (white text 5.5:1) and links use `brand` (6.5:1 on surface). Every text pairing in both themes meets WCAG AA (4.5:1 or better).

The theme follows the system by default; people can pick Light or Dark in the header or Settings. The choice is stored in the browser and applied before first paint.

## Type

- **Geist** for everything you read. SemiBold for headings with tight tracking (−0.03em at display sizes), Regular for text.
- **Geist Mono** for amounts, addresses and hashes. Tabular figures. Amounts always show two decimals (`9,400.00 USDC`). When a person must check an address, show it in groups of four (`0x3C44 CdDd B6a9 …`), first and last groups bold.

## Documents

Invoices and payment statements are generated as A4 PDFs with one template:

- 6 pt brand-blue rule across the top
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

Motion is rare and functional: the landing hero, and the mark folding in while the app loads. Everything respects `prefers-reduced-motion`.

## Social and app icons

- `social-card.png` (1200×630) is the Open Graph and Twitter image (`web/src/app/opengraph-image.png`).
- `web/src/app/icon.svg` (favicon), `apple-icon.png` (180), and `web/public/icon-192.png`, `icon-512.png`, `icon-maskable-512.png` for the web manifest.

Third-party wallet and token logos are in `third-party/` with their sources and licences. Use them only to say Wagefold works with those products.
