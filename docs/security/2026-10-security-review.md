# Security review, October 2026

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
