# Security review, October 2026

Two passes: an automated review with scanners (22 October, below the first divider) and a manual audit of the code and repository (26 October, first). Each issue found is fixed and covered by an end-to-end test that performs the attack.

## Manual code audit, 26 October 2026

A line-by-line read of sign-in, sessions, permissions, every API route, the payroll and approval state machine, the contract, the browser send flow and the repository setup, looking for what scanners can't see: business-logic flaws, race conditions and trust boundaries.

**Result:** two ways a payroll could be paid twice, a gap in four-eyes control over payee wallets, and two authentication weaknesses. All fixed and tested. The tools found nothing new after the fixes.

| # | Finding | Severity | Fix | Test |
|---|---|---|---|---|
| 1 | **Two payrolls could be open at once.** The one-run-at-a-time rule was only checked when a draft was created. Two people could each prepare a draft, send both for approval, and have both approved and sent: everyone paid twice | High | The check now runs in the same statement that sends a draft for approval (or to the treasury), backed by a unique index on open runs per company, so concurrent requests can't both win | `only one payroll can wait for approval at a time, even from two drafts` |
| 2 | **The contract could pay the same run twice.** A retried transaction, a double click, or a payment the browser never reported (so the run still looked unsent) could pay the same list again | Medium | `WagefoldPayroll` records `paidBlock[payer][runId]` and reverts with `AlreadyPaid` on a second attempt, keyed by payer so nobody else can block a run. The app checks it before sending, and the server uses it to find a payment the browser never reported | Contract: `pays a run once per treasury`, `doesn't let someone else block a run`. End-to-end: `the contract pays a run once`, `a payment the browser never reported is found on-chain and verified` |
| 3 | **An approver could approve paying a wallet they had just changed.** The preparer couldn't approve their own run, but an admin could edit someone's wallet in People and then approve the payroll that pays it: the classic payroll fraud pattern | Medium | Approving is refused if any wallet in the run was added or changed by the approver since the last paid payroll (from the append-only activity log; bulk imports now log every wallet) | `whoever changes a payee's wallet can't approve the payroll that pays it` |
| 4 | **Sign-in messages could be replayed.** The nonce cookie wasn't signed or tracked, and message freshness wasn't enforced. Anyone who obtained a signed sign-in message could set the cookie themselves and sign in as that wallet | Medium | Nonces live in a signed cookie (only server-issued nonces work), are consumed on first use, and the message must be issued in the last ten minutes and expire within ten | `a signed sign-in works once, must be fresh, and only with a nonce this server issued` |
| 5 | **Sessions couldn't be revoked.** Sessions were stateless 7-day tokens: signing out cleared the browser's cookie, but a copied cookie kept working | Medium | Sessions are stored on the server (3 days). Signing out, switching company or being removed from the team revokes them | `signing out ends the session on the server, even for a copied cookie` |
| 6 | **Request bodies were read fully before the 2 MB check** | Low (memory DoS) | Bodies are read in chunks and abandoned past 2 MB | `rejects NUL and control characters...` (2.5 MB body) |
| 7 | **A run could get stuck as "sent" forever** if the wallet replaced the transaction (speed-up) or the browser closed before reporting it. That blocked every future payroll and invited a manual re-send | Low (availability) | The server finds the real transaction through `paidBlock`; the owner can safely send the same run again because it can only be paid once | As 2 |
| 8 | **A run was marked paid on the first receipt** | Low | Waits 3 blocks on Base (1 on Base Sepolia) before recording it as paid and issuing invoices | n/a (local chain uses 0) |
| 9 | **A short `SESSION_SECRET` was accepted in production** | Low | At least 32 characters required | n/a |
| 10 | **New dependency advisories since the first pass:** Next.js remote code execution in the image optimizer (GHSA-2464-fhr4-w9xw, critical) and a Server Actions DoS; zod memory exhaustion (GHSA-mrhx-c7xc-m3w5, high) | Critical / high | Next.js 15.5.28; the app's own validation moved to zod 4.6.7. Wallet SDKs still bundle zod 3 in the browser (accepted, below) | Build and all suites pass |
| 11 | **Repository:** no CI, no vulnerability reporting policy, no dependency updates | Process | GitHub Actions runs typecheck, unit tests, build, contract tests, gitleaks, Semgrep and Slither on every push; Dependabot weekly; `SECURITY.md` | n/a |

### Re-scan after the fixes

| Tool | Result |
|---|---|
| End-to-end attack suite | 40/40 (5 new checks) |
| Unit tests / contract tests | 53/53, 9/9 (2 new) |
| OWASP ZAP authenticated API active scan | 113 passed, 0 failed, 0 server errors ([report](reports/zap-api-authenticated.html)) |
| OWASP ZAP baseline (pages) | 58 passed, 0 failed; 3 warnings, all previously accepted: CSP `https:` for wallet relays, no integrity hash on Google Fonts, an informational note ([report](reports/zap-baseline.html)) |
| Semgrep (236 rules) | 0 findings |
| Slither (102 detectors) | 0 findings |
| gitleaks (history and working tree) | No secrets |
| npm audit (production) | Next.js fixed; remaining: zod 3 inside wallet SDKs (browser only) |

### Accepted since this pass

- **zod 3 inside wallet SDKs** (Coinbase CDP SDK, Reown/WalletConnect AppKit). No patched 3.x exists and forcing zod 4 would break those SDKs. They run in the browser and parse wallet data, not requests to the server, which uses zod 4.6.7. Revisit when the SDKs upgrade.
- **Recipients of an approved run aren't re-approved after a wallet change in People**: the run is a snapshot, so changes in People don't affect a run in flight (tested since the first pass).

---

## Automated review, 22 October 2026

Automated and manual testing of Wagefold (web app, API and `WagefoldPayroll` contract) against a local stack: Hardhat chain, production build of the app (`next start`), embedded Postgres, seeded with a company, a team in every role, paid and pending payroll runs, invoices and an activity log.

**Result:** no exploitable vulnerability found. The tools surfaced two real bugs, two hardening gaps and vulnerable dependencies, all fixed and covered by regression tests. Remaining items are listed under accepted risks with the reason.

## Tools

| Tool | What it covered | Result |
| --- | --- | --- |
| **OWASP ZAP 2.x** baseline | Passive scan and spider of the site | 59 passed, 0 failed. Warnings: CSP incomplete (fixed), CSP wildcard for wallet connections (accepted, below) |
| **OWASP ZAP** API active scan | Every API path (19, from an OpenAPI description), signed in as the treasury owner: SQL/NoSQL injection, XSS, command and code injection, path traversal, SSTI, XXE, SSRF/cloud metadata, padding oracle, error disclosure and more | 113 passed, 0 failed. Found two endpoints returning 500 on NUL bytes (fixed). Second run: 0 server errors |
| **Nuclei** (10,688 HTTP templates, 19,743 requests) | Known CVEs, exposures, misconfigurations, default files, tech fingerprints | 0 vulnerabilities; 5 informational missing-header notes (3 added, 2 deliberately absent, below) |
| **Semgrep** 1.182 (253 rules: OWASP Top 10, TypeScript, JavaScript, React, Next.js, JWT, SQL injection, XSS, secrets) | Source code | 2 low findings: Google Fonts stylesheet without integrity (accepted, below) and a non-constant log format (fixed) |
| **Slither** 0.11.6 (102 detectors) | `WagefoldPayroll.sol` and dependencies | 0 findings |
| **gitleaks** 8 | Full git history | No secrets |
| **npm audit** | Dependencies of `web/` and `contracts/` | Production: 4 advisories (2 high) → **0** after pinning patched versions. Contracts: 0 |
| Manual tests | Session forgery (alg=none, swapped payload), oversized bodies, cross-site requests, business logic | See below |

Shannon (KeygraphHQ's autonomous AI pentester) was requested but could not run in this environment: it needs an AI provider API key and refuses to run as root, and creating a non-root Docker user was not permitted here. It can be run locally (see the end).

## Findings and fixes

| # | Finding | Severity | Fix |
| --- | --- | --- | --- |
| 1 | **NUL byte in a text field crashed the request** (ZAP fuzzing): `PATCH /api/me` and `PATCH /api/employees/:id` returned 500 because Postgres refuses `\u0000` | Low (robustness, no data exposed) | Request bodies containing NUL are refused before parsing; every text field now rejects control characters (addresses keep line breaks). Regression tests: unit + end-to-end |
| 2 | **Content-Security-Policy only set `frame-ancestors`** (ZAP) | Medium (hardening) | Nonce-based CSP per request: `script-src 'self' 'nonce-…' 'strict-dynamic'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`; API responses get `default-src 'none'`. Verified in a browser: zero CSP violations through sign-in, every tab and PDF generation |
| 3 | **Cross-site writes relied on one layer** (manual): a form-style `text/plain` POST with a valid cookie was processed. Browsers don't send the `SameSite=Lax` cookie cross-site, so not exploitable, but there was no second layer | Low (defence in depth) | Middleware refuses API writes whose `Origin` isn't this site (production: `APP_DOMAIN` only), anything marked `Sec-Fetch-Site: cross-site`, and non-JSON bodies (415) |
| 4 | **Vulnerable transitive dependencies** (npm audit): `ws` (memory disclosure, DoS), `postcss` (XSS in stringify, file read via sourceMappingURL), `uuid`, `decode-uri-component` | High/moderate, via wallet SDKs and Next.js build | npm `overrides` pin patched releases (`ws ^8.22`, `postcss ^8.5.31`, `uuid ^11.1.1`, `decode-uri-component ^0.4.3`). Production audit: 0. All tests and builds pass |
| 5 | Dev tooling advisories (`tinypool` critical, `esbuild`, `@vitest/mocker`) | Dev only | Upgraded to Vitest 5 and Vite 8; `postcss-selector-parser` pinned to 7 (Tailwind output verified byte-identical) |
| 6 | Unknown API paths answered with the HTML 404 page (ZAP) | Info | JSON 404 for `/api` and everything under it |
| 7 | Missing `Cross-Origin-Opener-Policy`, `Cross-Origin-Resource-Policy`, `X-Permitted-Cross-Domain-Policies` (Nuclei) | Info | Added (`same-origin-allow-popups`, `same-origin`, `none`) |

## Manual checks that passed

- Session cookie with `alg: none` → 401. Payload swapped under the original signature → 401.
- 3 MB request body → 400, no crash.
- Business logic, all in the end-to-end suite (35 checks): forged and tampered approval signatures, replaying an approval on another run, approving your own payroll (even after promotion), sending before approval, sending from a non-treasury wallet, preparer and viewer limits, a removed approver's access and approvals, cross-company reads and writes, switching into a company you're not on, phishing replay of a sign-in with a spoofed Host header, mass assignment (`ownerAddress`, `orgId`), CSV formula injection in exports, script injection in payslips, invoice and approval immutability in the database.

## Accepted risks

- **CSP allows `https:` and `wss:` for connections and `https:` images.** Wallet SDKs talk to their own relays and RPC providers (WalletConnect, Coinbase, the chain's RPC), which vary by wallet; pinning hosts would risk breaking real wallet connections that can't be tested here. Script execution is locked down by the nonce, which is what stops XSS. Revisit with a host allowlist once production wallets are confirmed.
- **No Cross-Origin-Embedder-Policy** (`require-corp` would block wallet icons and SDKs) and **no X-Frame-Options** (it can't allow the Safe app; CSP `frame-ancestors` replaces it).
- **`braces` (high, all versions)**: denial of service from deeply nested glob patterns, reachable only through Tailwind's build-time file watcher. Nothing a visitor sends reaches it. Fixed by moving to Tailwind 4 later.
- **Geist loads from Google Fonts** (app and demo) without an integrity hash: Google serves different CSS per browser, so integrity can't be used. The CSP allows only `fonts.googleapis.com` for stylesheets and `fonts.gstatic.com` for font files, and no scripts. Self-hosting the font files would remove the outside request if that's ever preferred.
- **No rate limiting** in the app: add it at the proxy or edge (sign-in, approvals, imports).
- **Approvals are enforced by Wagefold, not on-chain**: the treasury key can still move its own funds outside Wagefold. Use a Safe treasury for on-chain enforcement.
- **The contract has not had an external audit.**

## Re-running

```bash
# Static
semgrep scan --config p/default --config p/owasp-top-ten --config p/typescript --config p/react --config p/nextjs --config p/secrets .
cd contracts && slither . --exclude-dependencies --filter-paths "node_modules|contracts/test"
gitleaks git .
cd web && npm audit --omit=dev

# Dynamic (app running on :3000)
docker run --rm --network host ghcr.io/zaproxy/zaproxy:stable zap-baseline.py -t http://localhost:3000
docker run --rm --network host projectdiscovery/nuclei -u http://localhost:3000
```

For an authenticated ZAP API scan, sign in with a test wallet, pass the `wf_session` cookie with ZAP's replacer, and describe the API paths in an OpenAPI file (as done for this review).

### Running Shannon

[Shannon](https://github.com/KeygraphHQ/shannon) needs Docker, Node 18+, a non-root user in the `docker` group, and an AI provider key (Anthropic, OpenAI and others). Only point it at a local or staging copy, never production:

```bash
npx @keygraph/shannon@latest setup
npx @keygraph/shannon@latest start -u http://localhost:3000 -r /path/to/wagefold
```

A full run takes roughly 1 to 1.5 hours and uses paid model calls.
