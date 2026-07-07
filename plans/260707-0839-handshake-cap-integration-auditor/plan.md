# Handshake — CAP Integration Auditor — Plan

Ground truth: `docs/CAP-NOTES.md` (confirmed 2026-07-07). Deadline: submissions close **2026-07-09** (confirmed plan basis).

## Decisions (user-confirmed, sticky)
- Deadline Jul 9 → Phase 1 by EOD Jul 8, assets Jul 9 AM
- Probe price cap: basic ≤0.2 USDC/call, deep ≤0.5; enforced at probe #1 order (price first knowable there); over-cap ⇒ reject probe order (unpaid, free) + reject buyer's paid order (auto-refund)
- Tiers: Basic 1 USDC N=5 SLA 2h (P1); Deep 3 USDC N=15 SLA 4h (P2)
- Deps: @croo-network/sdk, hono, @hono/node-server, better-sqlite3, @noble/ed25519, ethers@^6

## Architecture (corrected from master prompt)
- No inbound CAP HTTP endpoint. Intake = WS `order_negotiation_created` for our service ids → `acceptNegotiation` → poll `getOrder` until `paid` → run audit → `deliverOrder` (schema deliverable: verdict, report_url, verify_url, trace_root, signature, pubkey).
- Probes (sequential, one AA wallet): `negotiateOrder(target_service_id, sample_input)` → poll until order created (C1) → price-cap gate → `payOrder` (tx hash) → poll until `completed` → `getDelivery`. WS used ONLY for intake; engine polls.
- C3: verify `payTxHash`/`clearTxHash` receipts via Base RPC — status==1, USDC Transfer logs (→CAPVault amount==price; CAPVault→provider). ERC-4337: match log addresses, not tx.to.
- Trace: sha256 hash chain over canonical JSON steps, persisted; `trace_root` = head.
- Sign: ed25519 over canonical JSON (key-sorted stable stringify) of report sans `signature`.
- MODE=dryrun: fake CapClient behind interface + `POST /dev/simulate-intake`; real mode = Base mainnet.

## Phase 1 — MVP (status: code complete 2026-07-07; pending user manual test + registration + deploy)
- [x] Scaffold: package.json, tsconfig (ESM), .env.example, LICENSE (MIT), .gitignore
- [x] src/config.ts, src/db/{schema.sql,repo.ts}
- [x] src/audit/trace.ts, src/attest/{canonical-json.ts,sign.ts,report.ts}
- [x] src/cap/{client.ts,real-client.ts,chain-verifier.ts,dryrun-client.ts,intake.ts}
- [x] src/audit/checks/{callable.ts,settlement.ts,reliability.ts}
- [x] src/audit/engine.ts (job state machine; serial jobs — AA nonce constraint)
- [x] src/server.ts (GET /report/:job_id, /verify/:job_id, /trace/:job_id, /job/:job_id, /healthz; POST /dev/simulate-intake in dryrun)
- [x] scripts/keygen.ts
- [x] Dockerfile + docker-compose.yml (+ .dockerignore; build copies schema.sql to dist)
- [x] tsc clean + dryrun smoke test: PASS/FAIL/PARTIAL/refused all verified; offline sig verification VALID; trace chain valid
- [x] Bugs fixed during smoke: SLA margin consumed whole budget on short SLAs; reliability passed with 0 calls; zero-probe audit now refunds instead of blaming target; better-sqlite3 ^12 for Node 24 prebuilds
- [ ] USER: dashboard registration (agent + basic service), fund AA wallet, VPS deploy, real-mode test

## Phase 2 — polish (started early 2026-07-07, user said continue)
- [x] C2 schema check (delivery contract: type known, content non-empty, schema = valid JSON object, content hash present; C2/C4 = quality gates → PARTIAL, not FAIL)
- [x] C4 latency: p50/p95 paid_at→completed_at, nearest-rank, threshold p95 default 60s (LATENCY_P95_THRESHOLD_MS)
- [x] Badge: GET /badge/:agent_id.svg + .json (shields-style, latest report by subject_agent_id, grey UNAUDITED)
- [x] Trace viewer HTML: content-negotiated at /trace/:job_id (Accept: text/html)
- [x] Buyer sample_inputs (đã có từ P1 trong intake schema)
- [x] Deep tier: 3 USDC N=15 SLA 4h cap 0.5 USDC; DEEP_SERVICE_ID optional env; dryrun hỗ trợ tier=deep
- [ ] Smoke test P2 (đang chạy) + commit

## Phase 3 — submission (Jul 8 PM / Jul 9 AM)
README (SDK method file:line table, mermaid two-sided diagram, offline verify guide), docs/DEMO-SCRIPT.md, DoraHacks text.

## Risks
- Handshake SLA (2h) vs sequential probes against slow targets → per-probe timeout (default 600s) + global deadline = paid_at + SLA − 10min margin; on breach deliver PARTIAL with completed probes rather than lose escrow.
- One WS per API key → single process, single EventStream.
- Restart mid-audit: P1 marks in-flight jobs `aborted` (SLA refund protects buyer); reconciliation is out of scope (no-retry-queue non-goal).
