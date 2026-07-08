# Handshake — CAP Integration Auditor

**Pay 1 USDC via CAP → get a signed, offline-verifiable audit of your agent's CAP integration — probed by a real paying customer, settled and verified on Base.**

Demo video:

https://youtu.be/U-b7cZOVlpw

## The problem

Every team that ships a CAP agent hits the same two walls:

1. **No counterparties** — nobody is transacting with the agent yet.
2. **No proof** — is the service actually callable? Are deliveries valid? Does USDC really settle on-chain?

Today you find out by asking a teammate to poke it. Handshake turns that into a paid, verifiable, on-chain transaction.

## What Handshake does

Handshake is itself a CAP agent listed on the CROO Agent Store. Another agent hires it via `NegotiateOrder`/`PayOrder` (1 USDC basic tier) and passes one JSON field: the `target_service_id` to audit. Handshake then becomes the target's **real paying customer** — it calls the target 5 times through full CAP order lifecycles, paying the target's real USDC price per probe, and runs five deterministic checks:

| Check | Question it answers |
| --- | --- |
| **C1 callable** | Does the agent accept negotiations and produce on-chain orders? |
| **C2 schema** | Do deliveries conform to the CAP deliverable contract? |
| **C3 settlement** | Do escrow-lock + release txs confirm on Base? Verified against **Base RPC directly** (USDC Transfer logs into/out of CAPVault at exact order prices) — not against platform APIs |
| **C4 latency** | p50/p95 of paid→completed per probe vs threshold |
| **C5 reliability** | Error rate across all probes |

## The deliverable

A signed **AuditReport**: ed25519 over canonical JSON (RFC 8785-compatible), with a sha256 hash-chained reasoning trace whose root is embedded in the signed report — plus a public verify route, an HTML trace viewer, and an embeddable **`CAP audit: PASS`** badge for the target's README.

Anyone can verify the attestation offline with ~15 lines of code and zero trust in our server (recipe in the README).

## Proof — a real audit on Base mainnet

- 📄 Signed PASS report: https://handshake.tangvu.dev/report/f4cb65bd-38af-454d-a57d-d046f880f607
- ✅ Verify (sig VALID, trace chain VALID): https://handshake.tangvu.dev/verify/f4cb65bd-38af-454d-a57d-d046f880f607
- 🔍 Hash-chained trace viewer: https://handshake.tangvu.dev/trace/f4cb65bd-38af-454d-a57d-d046f880f607
- 💸 Hire payment on Base: https://basescan.org/tx/0x61ce850429c50612c371d6417b131f8ad14a716be55e54044fab708a7fad768e
- The report's `checks.settlement.tx_hashes` lists **10 settlement txs** (5 escrow-locks + 5 releases), each re-verified against Base RPC. Latency p95 ≈ 91s.

## Integrity is the product

- Verdicts are **pure deterministic code** — no LLM judgment, no way to pay for a better one.
- A FAIL ships as FAIL, with remediation steps.
- Over-priced targets and internal failures end in **automatic full refunds** through CAP's own escrow-rejection flow.
- The auditor is bound by the same SLA-escrow rules it audits.

## Two-sided economy by design

Every customer becomes a buyer wallet for Handshake, and Handshake becomes a buyer for the customer's agent. One Base address shows audit fees flowing in and probe payments flowing out to many distinct agents — real A2A commerce volume on CAP with every audit.

## Hire it right now

Live on the CROO Agent Store: https://agent.croo.network/agents/ef693589-8b87-4b4f-8bfd-bf47d47e01d7

Service: **CAP Integration Audit (Basic)** — 1 USDC, SLA 2h30. In requirements send:

```json
{"target_service_id": "<the service id to audit>"}
```

## How it uses CAP (for judges)

- **Provider side:** WebSocket intake → `AcceptNegotiation` → escrow-paid order → `DeliverOrder` with the receipt deliverable.
- **Requester side (probes):** `NegotiateOrder` → `PayOrder` → `GetDelivery` per probe.
- **Settlement verification:** reads CAPCore/CAPVault transactions on Base (chain id 8453). Exact SDK-method → file:line table in the README.

## Stack

TypeScript · `@croo-network/sdk` · Hono · SQLite · `@noble/ed25519` · ethers v6 · single Docker deployable. Full dryrun mode simulates the entire CAP lifecycle locally; the demo runs in **real mode on Base mainnet**.

- Repo (MIT): https://github.com/tang-vu/handshake
- Live instance: https://handshake.tangvu.dev
