<picture>
  <source media="(prefers-color-scheme: dark)" srcset="brand/wagefold-logo-dark.svg">
  <img src="brand/wagefold-logo.svg" alt="Wagefold" height="48">
</picture>

Crypto payroll in one transaction. A finance team connects its treasury wallet, keeps its team in Wagefold (name, role, EVM wallet, monthly pay in USDC or USDT), and pays everyone with one signature.

![Wagefold landing page](docs/screenshots/landing-hero.png)

<details>
<summary><b>See the full landing page</b></summary>
<br>
<img src="docs/screenshots/1-landing.png" alt="Full Wagefold landing page: hero, how it works, supported wallets and stablecoins, measured gas infographic, safety, FAQ">
</details>

## Screens

<table>
  <tr>
    <td width="50%"><img src="docs/screenshots/5-review.png" alt="Review payroll with changes since last payroll and wallet check"><br><sub><b>Review</b>: what changed since the last payroll, flagged wallets, one-click send</sub></td>
    <td width="50%"><img src="docs/screenshots/6-done.png" alt="Payroll paid in one transaction"><br><sub><b>Paid</b>: everyone paid in one transaction, verified on-chain</sub></td>
  </tr>
  <tr>
    <td width="50%"><img src="docs/screenshots/4-people-search.png" alt="People list with search"><br><sub><b>People</b>: the team database with search, sorting and CSV import</sub></td>
    <td width="50%"><img src="docs/screenshots/12-history-records.png" alt="History with accountant exports and an expanded run"><br><sub><b>Records</b>: every run with its block, network fee and USD rate, plus exports for your accountant</sub></td>
  </tr>
  <tr>
    <td width="50%"><img src="docs/screenshots/9-review-lookalike.png" alt="Review flagging a lookalike wallet and asking to confirm each new or changed wallet"><br><sub><b>Wallet safety</b>: lookalike addresses flagged, each new or changed wallet confirmed in full</sub></td>
    <td width="50%"><img src="docs/screenshots/10-payslip.png" alt="Payslip with year-to-date total and transaction"><br><sub><b>Payslips</b>: fiat value, year-to-date total and the transaction as proof of payment</sub></td>
  </tr>
  <tr>
    <td width="50%"><img src="docs/screenshots/13-invoices.png" alt="Invoices issued automatically for every payment"><br><sub><b>Invoices</b>: issued automatically per payment, numbered in order, one PDF per invoice or per month</sub></td>
    <td width="50%"><img src="docs/screenshots/17-invoice-pdf.png" alt="Invoice PDF"><br><sub><b>Invoice PDF</b>: supplier, bill-to, amount, USD value and the transaction as proof of payment</sub></td>
  </tr>
  <tr>
    <td width="50%"><img src="docs/screenshots/14-dark-review.png" alt="Review payroll in dark mode"><br><sub><b>Dark mode</b>: follows the system, or pick light or dark</sub></td>
    <td width="50%"><img src="docs/screenshots/16-dark-landing.png" alt="Landing page in dark mode"><br><sub><b>Dark landing</b>: the whole product, landing included, is themed</sub></td>
  </tr>
  <tr>
    <td width="50%"><img src="docs/screenshots/11-activity.png" alt="Append-only activity log"><br><sub><b>Activity</b>: who changed which wallet or amount, and every payroll sent</sub></td>
    <td width="50%"><img src="docs/screenshots/3-pay-home.png" alt="Pay home with the next payday"><br><sub><b>Payday</b>: when payroll is due, and a warning if a payday passes unpaid</sub></td>
  </tr>
</table>

## How it works

1. **Land and connect.** The landing page explains the product; "Connect wallet" opens the wallet picker. Supported: MetaMask or any browser wallet, Coinbase Wallet, Trust Wallet and other phone wallets (WalletConnect), or Safe.
2. **Sign in** by signing a message ([Sign-In with Ethereum](https://eips.ethereum.org/EIPS/eip-4361)). No gas, no funds move. The wallet that signs in owns the company's data.
3. **People** is the employee database. Add people one by one or import a CSV.
4. **Run payroll** snapshots everyone from People into a run and shows what changed since the last paid run (new people, removed people, pay changes, wallet changes). Each changed or never-paid wallet is shown in full and must be confirmed with its owner before sending. A wallet that shares its first and last characters with a wallet you've paid before is flagged as a likely [address-poisoning](https://www.chainalysis.com/blog/address-poisoning-scam/) lookalike. It checks the treasury balance, the ETH for gas, and estimates the network fee, then sends every payment in one transaction through `WagefoldPayroll`.
5. **The server verifies** the transaction on-chain: it only marks a run paid if the contract paid exactly the snapshotted wallets and amounts, from this company's wallet. It records when the block settled, the network fee, and the USD rate used.
6. **Records** come from verified runs only: a payslip per payment (with year-to-date totals), a per-payment CSV, a journal in QuickBooks' import layout, and yearly totals per person. History also has an activity log of every change, which can't be edited.
7. **Invoices.** When a run is verified, Wagefold issues an invoice for every payment: numbered in order (prefix set in Settings), billed to your company's legal name, address and tax ID, from each person's name, address and tax ID (optional fields in People). Each invoice is a frozen snapshot: later edits never change it, and the database rejects updates. Download any invoice, or a whole month, as a branded A4 PDF generated in the browser.
8. **Payday.** Set a monthly payday in Settings. Pay shows when payroll is due, warns if a payday passed unpaid, and offers a calendar reminder. Wagefold never sends on its own.

Wallets that support batched calls ([EIP-5792](https://eips.ethereum.org/EIPS/eip-5792), e.g. Coinbase Smart Wallet) approve and pay with one confirmation. Other wallets first approve each token for exactly this run's total, then confirm the payment.

## Repository

| Path | What it is |
| --- | --- |
| `contracts/` | `WagefoldPayroll.sol` (Solidity 0.8.24, OpenZeppelin SafeERC20), Hardhat tests and deploy scripts |
| `web/` | Next.js 15 app: wagmi + viem for wallets, API routes, Postgres (embedded PGlite locally) |
| `brand/` | Logo set (light, dark, one-colour), mark, app icon, social card, [brand guidelines](brand/BRAND.md) |
| `docs/screenshots/` | The app, captured from the end-to-end UI run |
| `docs/research/` | What payroll buyers and recipients complain about and ask for, and the build order it led to |

## The contract

`pay(bytes32 runId, Payment[] payments)` transfers each `{token, to, amount}` from `msg.sender`.

- Funds only ever move from the caller. The contract holds nothing, has no owner, admin or upgrade path, so an approval granted to it can't be spent by anyone else.
- All or nothing: if one transfer fails, the whole run reverts.
- Up to 500 payments per run. 100 payments cost about 1.3M gas, which is cents on Base.
- Emits `PayrollPaid(payer, runId, count)` and one `PaymentSent` per transfer, which the app uses for verification.

It has not had an external audit. Get one before handling real payroll.

## Demo build (no server, no wallet needed)

`cd web && npm run build:demo` produces one self-contained HTML file in `web/demo-dist/`. It runs the real UI with an in-browser backend (`src/demo/mock-api.ts`), a simulated chain that executes the same token and payroll rules as the contract (`src/demo/sim-chain.ts`), and a built-in test wallet with approval prompts. Nothing touches a real network. Each viewer's data stays in their own browser; "Reset demo" starts over.

## Security

- **Sign-in** is Sign-In with Ethereum. In production the server only accepts messages for `APP_DOMAIN` and never trusts `Host` or `X-Forwarded-Host`, so a phishing site can't replay a signature it collected for itself.
- **Sessions** are HS256-signed, httpOnly, `SameSite=Lax` cookies (7 days). There is no server-side revocation yet: signing out clears the cookie, but a stolen cookie stays valid until it expires.
- **Access control:** every query is scoped to the signed-in company; unknown fields in requests (such as another company's id) are ignored.
- **Payments** are verified on-chain before a run is marked paid, from the right wallet, with exactly the snapshotted recipients and amounts.
- **Wallet fraud:** lookalike addresses are flagged in People and in the review; every new or changed wallet must be confirmed individually, and the confirmation is logged with the run.
- **Activity log** is append-only in the app and in the database (a trigger rejects updates and deletes), scoped to the company, and records the signer's address for every change.
- **Exports** neutralise spreadsheet formulas in user-typed fields (CSV injection), and payslips escape every value and contain no scripts.
- **Invoices** are scoped to the company, issued once per payment (unique constraints stop duplicates under concurrent requests) and immutable in the database. PDFs are built in the browser from data the server already returned; nothing is uploaded.
- **Headers:** `frame-ancestors 'self' https://app.safe.global` (anti-clickjacking while still allowing the Safe app), `nosniff`, HSTS, and `Cache-Control: no-store` on all API responses.
- **Known items:** no rate limiting yet (add it at the proxy or edge); `ws` inside the WalletConnect SDK has a published advisory that needs a wagmi major upgrade; the contract is unaudited.

## Brand and themes

The product has light and dark themes (system by default, switchable in the header and in Settings). Every colour is a CSS variable token, so the app, landing page and logo switch together. See [brand/BRAND.md](brand/BRAND.md) for the logo set, palette with contrast ratios, type, document template and voice.

![Brand guidelines](brand/brand-guidelines.png)

## Run it locally

Needs Node 20+.

```bash
# 1. Local chain with the contract and mock USDC/USDT
cd contracts
npm install
npx hardhat node                 # keep this running
npm run dev:setup                # in a second terminal; writes web/.env.local

# 2. The app
cd ../web
npm install
npm run dev                      # http://localhost:3000
```

In your wallet, add the network `http://127.0.0.1:8545` (chain id 31337) and import Hardhat account #0 (private key `0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80`). That account holds 500,000 mock USDC and 100,000 mock USDT. It is a public test key: never send real funds to it.

## Tests

```bash
cd contracts && npm test         # contract: payouts, atomicity, allowance safety, limits, gas
cd web && npm test               # unit: amounts, validation, CSV import/export, lookalikes, payslips, schedule
cd web && npm run typecheck

# End to end, with the local chain running and dev:setup done:
cd web && npm run build && SESSION_SECRET=dev APP_DOMAIN=localhost:3000 npm start
cd web && npm run e2e            # sign-in, People, run, payment, verification, records, activity log, attack cases
```

## Deploy

1. **Contract.** Copy `contracts/.env.example` to `contracts/.env` and set `DEPLOYER_PRIVATE_KEY` (a fresh wallet with a little ETH on Base). Then `npm run deploy:base-sepolia` to test, `npm run deploy:base` for production.
2. **App.** Set the variables from `web/.env.example`:
   - `SESSION_SECRET`: a long random string (required in production)
   - `APP_DOMAIN`: the exact host people sign in on, e.g. `wagefold.app` (required in production, and set it at build time too: it makes the social-card URL absolute)
   - `DATABASE_URL`: a hosted Postgres URL. The embedded database only suits a single long-running server, not serverless.
   - `NEXT_PUBLIC_PAYROLL_ADDRESS_8453` (and/or `_84532`): the deployed contract
   - `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`: from WalletConnect Cloud, to enable Trust Wallet and other phone wallets
   - `NEXT_PUBLIC_USDT_ADDRESS_8453`: USDT on Base. Verify the address yourself before setting it; USDC on Base and Base Sepolia are built in.

## USD rates

Exports and payslips show a USD value for every payment. By default that is par (1 token = 1 USD), labelled as such. To record a market rate instead, set a Chainlink-style price feed per token and chain, for example `PRICE_FEED_USDC_8453=0x…`; the server then reads it at the payment's block and names the feed in the export. Verify feed addresses on [data.chain.link](https://data.chain.link) before setting them.

## Next

The [research](docs/research/payroll-buyer-needs.md) ranks these next:

- A Safe-native multi-signer flow: propose the run to the treasury Safe, show signers the decoded payload and the changes, verify the executed result
- Team roles with maker-checker approval: whoever edits wallets or amounts can't approve the run; a cooling-off period on wallet changes
- A recipient view: payment status and payslips without asking the employer
- Xero journal layout and email reminders before payday
- Emailing invoices and payslips to each person
