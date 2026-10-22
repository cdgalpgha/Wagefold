<img src="brand/wagefold-logo.svg" alt="Wagefold" height="48">

Crypto payroll in one transaction. A finance team connects its treasury wallet, keeps its team in Wagefold (name, role, EVM wallet, monthly pay in USDC or USDT), and pays everyone with one signature.

![Review payroll](docs/screenshots/5-review.png)

## How it works

1. **Land and connect.** The landing page explains the product; "Connect wallet" opens the wallet picker. Supported: MetaMask or any browser wallet, Coinbase Wallet, Trust Wallet and other phone wallets (WalletConnect), or Safe.
2. **Sign in** by signing a message ([Sign-In with Ethereum](https://eips.ethereum.org/EIPS/eip-4361)). No gas, no funds move. The wallet that signs in owns the company's data.
3. **People** is the employee database. Add people one by one or import a CSV.
4. **Run payroll** snapshots everyone from People into a run and shows what changed since the last paid run (new people, removed people, pay changes, wallet changes). Changed or never-paid wallets are flagged and must be confirmed before sending. It checks the treasury balance and sends every payment in one transaction through `WagefoldPayroll`.
5. **The server verifies** the transaction on-chain: it only marks a run paid if the contract paid exactly the snapshotted wallets and amounts, from this company's wallet.

Wallets that support batched calls ([EIP-5792](https://eips.ethereum.org/EIPS/eip-5792), e.g. Coinbase Smart Wallet) approve and pay with one confirmation. Other wallets first approve each token for exactly this run's total, then confirm the payment.

## Repository

| Path | What it is |
| --- | --- |
| `contracts/` | `WagefoldPayroll.sol` (Solidity 0.8.24, OpenZeppelin SafeERC20), Hardhat tests and deploy scripts |
| `web/` | Next.js 15 app: wagmi + viem for wallets, API routes, Postgres (embedded PGlite locally) |
| `brand/` | Logo, mark, app icon (SVG) and brand sheet |
| `docs/screenshots/` | The app, captured from the end-to-end UI run |

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
- **Headers:** `frame-ancestors 'self' https://app.safe.global` (anti-clickjacking while still allowing the Safe app), `nosniff`, HSTS, and `Cache-Control: no-store` on all API responses.
- **Known items:** no rate limiting yet (add it at the proxy or edge); `ws` inside the WalletConnect SDK has a published advisory that needs a wagmi major upgrade; the contract is unaudited.

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
cd web && npm test               # unit: amounts, validation, CSV, payment building and matching
cd web && npm run typecheck

# End to end, with the local chain running and dev:setup done:
cd web && npm run build && SESSION_SECRET=dev APP_DOMAIN=localhost:3000 npm start
cd web && npm run e2e            # sign-in, People, run, payment, verification, plus attack cases
```

## Deploy

1. **Contract.** Copy `contracts/.env.example` to `contracts/.env` and set `DEPLOYER_PRIVATE_KEY` (a fresh wallet with a little ETH on Base). Then `npm run deploy:base-sepolia` to test, `npm run deploy:base` for production.
2. **App.** Set the variables from `web/.env.example`:
   - `SESSION_SECRET`: a long random string (required in production)
   - `APP_DOMAIN`: the exact host people sign in on, e.g. `wagefold.app` (required in production)
   - `DATABASE_URL`: a hosted Postgres URL. The embedded database only suits a single long-running server, not serverless.
   - `NEXT_PUBLIC_PAYROLL_ADDRESS_8453` (and/or `_84532`): the deployed contract
   - `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`: from WalletConnect Cloud, to enable Trust Wallet and other phone wallets
   - `NEXT_PUBLIC_USDT_ADDRESS_8453`: USDT on Base. Verify the address yourself before setting it; USDC on Base and Base Sepolia are built in.

## Not built yet

- Team roles (approvers other than the treasury owner) and a Safe-native multi-signer flow
- Recurring schedules and reminders
- Accounting exports (QuickBooks, Xero)
- Editing a company name in the UI (the API supports it)
