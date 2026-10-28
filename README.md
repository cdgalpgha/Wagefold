<picture>
  <source media="(prefers-color-scheme: dark)" srcset="brand/wagefold-logo-dark.svg">
  <img src="brand/wagefold-logo.svg" alt="Wagefold" height="48">
</picture>

Crypto payroll that takes two people and one transaction. A finance team keeps its team in Wagefold (name, role, EVM wallet, monthly pay in USDC or USDT). On payday the accounts team prepares the payroll and signs it with their wallet; the treasury reviews it on its dashboard and approves it by sending, and one transaction pays everyone.

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
    <td width="50%"><img src="docs/screenshots/18-approval-waiting.png" alt="Signed payroll waiting for the treasury"><br><sub><b>Two people</b>: the accounts team signed this payroll; the treasury reviews it and approves it by sending</sub></td>
    <td width="50%"><img src="docs/screenshots/19-approval-signature.png" alt="Accounts team reviewing and signing the payroll"><br><sub><b>Accounts signs</b>: the preparer checks what changed and signs this exact list with their wallet</sub></td>
  </tr>
  <tr>
    <td width="50%"><img src="docs/screenshots/20-team-approvals.png" alt="Team and approval rule in Settings"><br><sub><b>Team</b>: owner, admins, preparers and viewers, each with their own wallet, and the approval rule</sub></td>
    <td width="50%"><img src="docs/screenshots/21-history-approvals.png" alt="History showing who prepared and approved a run"><br><sub><b>Audit trail</b>: who prepared, who approved (with signature) and who sent every run</sub></td>
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
    <td width="50%"><img src="docs/screenshots/3-pay-home.png" alt="Pay home as the treasury sees it"><br><sub><b>The cheque</b>: this month's payroll, who signs it, and when it's due</sub></td>
  </tr>
</table>

## How it works

1. **Land and connect.** The landing page explains the product; "Connect wallet" opens the wallet picker. Supported: MetaMask or any browser wallet, Coinbase Wallet, Trust Wallet and other phone wallets (WalletConnect), or Safe.
2. **Sign in** by signing a message ([Sign-In with Ethereum](https://eips.ethereum.org/EIPS/eip-4361)). No gas, no funds move. A wallet signing in for the first time becomes the owner of a new company: its treasury. Teammates sign in with their own wallets and land in the company they were added to (a switcher appears if a wallet belongs to several).
3. **People** is the employee database. Add people one by one or import a CSV.
4. **The accounts team prepares payroll.** Preparing snapshots everyone from People into a run and shows what changed since the last paid run (new people, removed people, pay changes, wallet changes). Each changed or never-paid wallet is shown in full and must be confirmed with its owner before sending. A wallet that shares its first and last characters with a wallet you've paid before is flagged as a likely [address-poisoning](https://www.chainalysis.com/blog/address-poisoning-scam/) lookalike. It checks the treasury balance and the ETH for gas. The preparer then **signs the run with their wallet** (a message naming the run, the totals, the treasury and a hash of every payment) and submits it.
5. **The treasury approves by sending.** The treasury wallet sees the signed payroll on its Pay page, reviews the same screen and sends it: every payment in one transaction through `WagefoldPayroll`. With two-person payroll on (the default), the treasury can't prepare a payroll itself and can never send one it prepared; a solo owner can switch this off in Settings.
6. **The server verifies** the transaction on-chain: it only marks a run paid if the contract paid exactly the snapshotted wallets and amounts, from this company's wallet. It records when the block settled, the network fee, and the USD rate used.
7. **Records** come from verified runs only: a payslip per payment (with year-to-date totals), a per-payment CSV, a journal in QuickBooks' import layout, and yearly totals per person. History also has an activity log of every change, which can't be edited.
8. **Team and sign-offs.** The owner (the treasury wallet, the higher authority) adds teammates by wallet address as **Preparer** (accounts team: keeps People up to date, prepares and signs payroll), **Admin** (can prepare, and can sign off others' payroll) or **Viewer** (read-only, for an accountant). Optionally, up to five extra admin **sign-offs** can be required between the accounts team and the treasury: each reviews the same screen and signs off with their own wallet. Whoever prepared a payroll can never sign it off or send it. Sign-offs can reject with a reason; the preparer or owner can cancel.
9. **Invoices.** When a run is verified, Wagefold issues an invoice for every payment: numbered in order (prefix set in Settings), billed to your company's legal name, address and tax ID, from each person's name, address and tax ID (optional fields in People). Each invoice is a frozen snapshot: later edits never change it, and the database rejects updates. Download any invoice, or a whole month, as a branded A4 PDF generated in the browser.
10. **Payday.** Set a monthly payday in Settings. Pay shows when payroll is due, warns if a payday passed unpaid, and offers a calendar reminder. Wagefold never sends on its own.

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
- Each treasury can pay a run once. `paidBlock(payer, runId)` records the block it was paid in, and a second attempt reverts with `AlreadyPaid`, so a retried, replayed or double-clicked payment can't pay anyone twice. It's keyed by payer, so nobody else can block a run by paying its id first.
- Up to 500 payments per run. 100 payments cost about 1.3M gas, which is cents on Base.
- Emits `PayrollPaid(payer, runId, count)` and one `PaymentSent` per transfer, which the app uses for verification.

It has not had an external audit. Get one before handling real payroll.

## Demo build (no server, no wallet needed)

`cd web && npm run build:demo` produces one self-contained HTML file in `web/demo-dist/`. The test wallet has two accounts, the treasury and an approver (Dana, CFO), and the example company needs one approval, so you can prepare a payroll as the treasury, switch accounts in the demo banner to approve it as Dana, and switch back to send it. It runs the real UI with an in-browser backend (`src/demo/mock-api.ts`), a simulated chain that executes the same token and payroll rules as the contract (`src/demo/sim-chain.ts`), and a built-in test wallet with approval prompts. Nothing touches a real network. Each viewer's data stays in their own browser; "Reset demo" starts over.

## Security

- **Sign-in** is Sign-In with Ethereum. In production the server only accepts messages for `APP_DOMAIN` and never trusts `Host` or `X-Forwarded-Host`, so a phishing site can't replay a signature it collected for itself. The nonce must be one this server issued (signed cookie), the message must be fresh and expire within ten minutes, and each signed message signs in once.
- **Sessions** are stored on the server and named by an HS256-signed, httpOnly, `SameSite=Lax` cookie (3 days). Signing out, switching company or being removed from the team ends the session on the server, so a copied cookie stops working too. `SESSION_SECRET` must be at least 32 characters in production.
- **Access control:** every query is scoped to the signed-in company; unknown fields in requests (such as another company's id) are ignored.
- **Payments** are verified on-chain before a run is marked paid, from the right wallet, with exactly the snapshotted recipients and amounts, after 3 blocks on Base so a reorg can't undo a "paid" record. If the wallet replaced the transaction or the browser closed before reporting it, the server finds the payment through the contract's `paidBlock` and verifies that instead.
- **One payroll in flight:** a company can have only one run waiting for approval, approved or sent, enforced by a unique index in the database, so two runs can never both be approved and sent.
- **Wallet fraud:** lookalike addresses are flagged in People and in the review; every new or changed wallet must be confirmed individually, and the confirmation is logged with the run.
- **Two-person payroll** is enforced by the server and the database, not just the UI. The accounts team's submission must carry a wallet signature over a message the server rebuilds from its own snapshot (run, totals, treasury, a hash of every payment); unsigned, forged and tampered submissions are refused. The send step only records a run prepared by someone other than the treasury and carrying that signature, checked in the same statement that records the transaction. Owners can turn this off for solo use; the change is logged.
- **Extra sign-offs** are enforced by the server, not just the UI. The send step is refused unless the run has enough approvals under the company's current rule, counted in the same database statement that records the transaction. Each approval is a wallet signature over a message the server rebuilds from its own snapshot (so a stolen session can't approve, and a signature can't be replayed on another run or with different amounts), verified with ERC-1271 support so Safe and other smart-wallet approvers work. Approvals only count while the approver is still an owner or admin: remove a compromised approver and their approvals stop counting at once. The preparer can't approve their own run, even after being promoted, and nobody can approve a run that pays a wallet they added or changed since the last payroll. Approvals are append-only in the database.
- **Roles** are read from the database on every request, never from the session cookie, so removing someone or changing their role takes effect on their next request. Only the owner can change the team or the approval rule; there is exactly one owner and it can't be removed or reassigned through the API. Company and people names are single-line so they can't fake lines inside a message an approver signs.
- **What approvals can't do:** they control what Wagefold will send and record. The treasury wallet's key can still move its own funds outside Wagefold. For approvals enforced on-chain as well, keep the treasury in a Safe with its own signing threshold (a Safe-native flow is next).
- **Activity log** is append-only in the app and in the database (a trigger rejects updates and deletes), scoped to the company, and records the signer's address for every change.
- **Exports** neutralise spreadsheet formulas in user-typed fields (CSV injection), and payslips escape every value and contain no scripts.
- **Invoices** are scoped to the company, issued once per payment (unique constraints stop duplicates under concurrent requests) and immutable in the database. PDFs are built in the browser from data the server already returned; nothing is uploaded.
- **Headers:** `frame-ancestors 'self' https://app.safe.global` (anti-clickjacking while still allowing the Safe app), `nosniff`, HSTS, and `Cache-Control: no-store` on all API responses.
- **Headers and CSRF:** a nonce-based Content-Security-Policy on every page (only scripts carrying the per-request nonce run), deny-all CSP on API responses, and API writes refused unless they come from this site with a JSON body (on top of the `SameSite=Lax` cookie). The only outside origins allowed for styles and fonts are Google Fonts, for Geist and Archivo.
- **Tested with:** a manual code audit, OWASP ZAP (passive baseline and an authenticated active scan of every API path), Nuclei (10,688 templates), Semgrep (OWASP Top 10, React, Next.js, secrets), Slither, gitleaks and npm audit, plus the end-to-end attack suite (40 checks). Every issue found is fixed and covered by a test. CI runs the tests, Semgrep, Slither and gitleaks on every push. Full reports: [docs/security](docs/security/). To report a vulnerability, see [SECURITY.md](SECURITY.md).
- **Known items:** no rate limiting yet (add it at the proxy or edge); connections in the CSP stay open to `https:`/`wss:` for wallet relays; wallet SDKs bundle an older `zod` in the browser (the server uses a patched version); the contract is unaudited.

## Brand and themes

The product has light and dark themes (system by default, switchable in the header and in Settings). Every colour is a CSS variable token, so the app, landing page and logo switch together. The design is "security paper": payroll's own objects, the cheque and the payslip, with sage paper, an engraving green, wide Archivo lettering for value and a guilloché band on every payroll run. See [brand/BRAND.md](brand/BRAND.md) for the logo set, palette with contrast ratios, type, the cheque, document template and voice.

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
   - `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`: from WalletConnect Cloud, to enable Trust Wallet and other phone wallets (add your domain to the project's allowed list)
   - `NEXT_PUBLIC_APP_URL`: the app's public address, e.g. `https://wagefold.app`. Wallets show it with the Wagefold icon when connecting; without it the page's own address is used
   - `RPC_URL_8453` (and/or `_84532`): your RPC provider's URL for the server, which verifies sign-ins and payments
   - `NEXT_PUBLIC_RPC_URL_8453` (and/or `_84532`): optional browser RPC. The browser tries it first and falls back to Base's public endpoint. Every visitor can see it, so use a separate key restricted to your domain
   - `NEXT_PUBLIC_USDT_ADDRESS_8453`: USDT on Base. Verify the address yourself before setting it; USDC on Base and Base Sepolia are built in.
   - `TRUST_PROXY=1`: set this only when the app runs behind a proxy that sets `X-Forwarded-For` itself and overwrites what the client sent (Vercel, Cloudflare, most load balancers). Sign-in is then rate-limited per client IP. Without it, anonymous sign-in attempts share one allowance, because anyone can write that header.

Rate limits (sign-in and payment checks) are counted in each server's memory and answer `429` with `Retry-After`. That is enough for one server. With several instances, also turn on your host's or proxy's rate limiting, since each instance counts on its own.

## USD rates

Exports and payslips show a USD value for every payment. By default that is par (1 token = 1 USD), labelled as such. To record a market rate instead, set a Chainlink-style price feed per token and chain, for example `PRICE_FEED_USDC_8453=0x…`; the server then reads it at the payment's block and names the feed in the export. Verify feed addresses on [data.chain.link](https://data.chain.link) before setting them.

## Next

The [research](docs/research/payroll-buyer-needs.md) ranks these next:

- A Safe-native multi-signer flow: propose the approved run to the treasury Safe, so the approval threshold is also enforced on-chain
- A cooling-off period on wallet changes, and approval expiry
- A recipient view: payment status and payslips without asking the employer
- Xero journal layout and email reminders before payday
- Emailing invoices and payslips to each person
