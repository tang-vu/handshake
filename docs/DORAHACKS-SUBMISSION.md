# DoraHacks Submission — Handshake

Copy-paste blocks for the submission form.

## Project name

Handshake — CAP Integration Auditor

## Tagline (one line)

Pay 1 USDC via CAP, get a signed, offline-verifiable audit of your agent's CAP integration — probed by a real paying customer, settled and verified on Base.

## Tracks

Primary: **Developer Tooling Agents** · Secondary: **Data & Verification Agents**

## Description

Every hackathon team faces the same two gaps after shipping a CAP agent: no counterparties transacting with it, and no proof the integration actually works end-to-end. Handshake closes both with a single CAP transaction.

Handshake is itself a CAP agent listed on the CROO Agent Store. Another agent hires it via `NegotiateOrder`/`PayOrder` (1 USDC basic / 3 USDC deep tier) and passes the `target_service_id` to audit. Handshake then becomes the target's **real paying customer**: it calls the target 5 times (15 on deep) through full CAP order lifecycles, paying the target's real USDC price per probe, and runs five deterministic checks:

- **C1 callable** — does the agent accept negotiations and produce on-chain orders at all?
- **C2 schema** — do deliveries conform to the CAP deliverable contract?
- **C3 settlement** — do escrow-lock and release transactions actually confirm on Base? Verified against Base RPC directly (USDC Transfer logs into/out of CAPVault at exact order prices), not against platform APIs.
- **C4 latency** — p50/p95 of paid→completed per probe against a threshold.
- **C5 reliability** — error rate across all probes.

The output is a signed **AuditReport**: ed25519 over canonical JSON (RFC 8785-compatible), with a sha256 hash-chained reasoning trace whose root is embedded in the signed report, a public `/verify` route, an HTML trace viewer, and an embeddable `CAP audit: PASS` badge (SVG) for the target's README. Anyone can verify the attestation offline with ~15 lines of code and no trust in our server — the recipe and snippet are in the README.

Integrity is the product: verdicts are pure deterministic code (no LLM judgment), a FAIL ships as FAIL with remediation steps, over-priced targets and internal failures end in automatic full refunds through CAP's own escrow rejection flow, and the auditor is bound by the same SLA-escrow rules it audits.

The business model is two-sided by design: every customer becomes a buyer wallet for Handshake, and Handshake becomes a buyer for the customer's agent. One Base address shows audit fees flowing in and probe payments flowing out to many distinct agents — real A2A commerce volume on CAP with every audit.

Built in TypeScript on `@croo-network/sdk`, Hono, SQLite, `@noble/ed25519`, ethers; single Docker deployable. A full dryrun mode simulates the entire CAP lifecycle locally; the demo runs in real mode on Base mainnet.

## Links

- Repo: https://github.com/tang-vu/handshake (MIT)
- Agent Store listing: `<fill after registration>`
- Live instance: https://handshake.tangvu.dev (`/healthz`, `/badge/<agent_id>.svg`)
- Demo video: `<fill after recording>`
- Example signed report: https://handshake.tangvu.dev/report/<job_id> + `/verify/<job_id>`
- Settlement txs on BaseScan: `<fill from checks.settlement.tx_hashes>`

## How it uses CAP (for judges)

Provider side: WebSocket intake → `AcceptNegotiation` → escrow-paid order → `DeliverOrder` with schema deliverable. Requester side: `NegotiateOrder` → `PayOrder` → `GetDelivery` per probe. Settlement verification reads CAPCore/CAPVault transactions on Base (chain id 8453). Exact SDK method → file:line table is in the README.
