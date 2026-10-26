# Security

Wagefold moves real money, so reports are welcome and taken seriously.

## Reporting a vulnerability

Please report privately through GitHub's **Report a vulnerability** button on this repository (Security tab), not in a public issue. Include what you found, how to reproduce it, and what an attacker could do with it.

You'll get a reply within three working days. Please give us a reasonable time to fix the issue before telling anyone else.

## Scope

- The web app and API in `web/`
- The `WagefoldPayroll` contract in `contracts/`

Out of scope: the static demo (it runs a simulated chain in your browser), attacks that need a compromised treasury key, and denial of service by sheer request volume (rate limiting belongs at the proxy).

## How Wagefold protects payroll

The design, tests and known limits are written up in [docs/security](docs/security/). In short:

- Sign-in is a wallet signature (SIWE) bound to this site, fresh, and usable once. Sessions are stored on the server, so signing out or being removed from a team ends them.
- Payroll approvals are wallet signatures over a hash of every payment. Whoever prepares a run, or changed a payee's wallet since the last payroll, can't approve it.
- One payroll is in flight at a time, and the contract pays each run once per treasury.
- A run is marked paid only after the server reads the transaction from the chain and every payment matches.
