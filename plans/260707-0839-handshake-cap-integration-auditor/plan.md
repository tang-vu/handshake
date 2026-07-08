# Handshake — CAP Integration Auditor — Plan

Ground truth: `docs/CAP-NOTES.md` (confirmed 2026-07-07). Deadline: **2026-07-12 09:00 UTC (16:00 VN)** — resolved 2026-07-07 via targeted DoraHacks search; earlier "Jul 9" result was a different (Qwen) hackathon. Everything shipped early against the precautionary Jul 9 pacing anyway.

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
- [x] Smoke test P2 pass (basic PASS 0/5; deep PARTIAL 5/15 đúng nhịp flaky; badge SVG/JSON + UNAUDITED; trace HTML; sig+chain valid) — commit 4359bac

## Phase 3 — submission assets (code-side done 2026-07-07)
- [x] README.md: two-sided mermaid diagram, setup, SDK method file:line table (verified against real-client.ts), integration examples, offline verify snippet, MIT
- [x] docs/DEMO-SCRIPT.md (≤5 min, đúng cấu trúc master prompt, có fallback plan)
- [x] docs/DORAHACKS-SUBMISSION.md (tagline, description, tracks, links placeholder)
- [x] scripts/hire-handshake.ts — buyer-side demo script (typecheck sạch)
- [x] scripts/deploy.sh — one-shot Linux deploy (docker/node fallback)
- [x] DEPLOYED dryrun lên server LAN hanhgia2212@192.168.1.19:8787 (Docker, restart unless-stopped). Fix Dockerfile: build+prune better-sqlite3 trong node:20-bookworm rồi copy sang slim. E2E verified qua LAN: audit PASS, badge, offline sig VALID.
- [x] Public URL: Cloudflare named tunnel `handshake` → https://handshake.tangvu.dev (systemd handshake-tunnel.service riêng, không đụng tunnel conzit/xacecalls cũ). E2E verified qua domain: health + audit + offline sig VALID. PUBLIC_BASE_URL đã set trong container.
- [x] REAL MODE LIVE (2026-07-08): agent "Handshake" đăng ký, SDK key set, MODE=real deploy trên server. WS connected tới wss://api.croo.network, "CAP connected, listening". Self-config: chỉ cần SDK key (agent id/service id optional; WS chỉ đẩy negotiation của chính agent → accept-all = basic tier; auditor id lấy từ order). HTTP-first startup + CAP retry non-fatal. Fix: 'replace_me' coi như unset.
## Real end-to-end audit (2026-07-08)
- [x] EchoBot (agent 2) đăng ký, service Echo (0.10 USDC). scripts/demo-echobot.ts (poll-driven, buyer+target 1 kết nối).
- [x] **Settlement USDC THẬT nhiều lần** trên Base (hire 1 USDC: tx 0x7e01fc89, 0x4ee18b49, 0x39edd066). Hackathon requirement ✅.
- [x] Full pipeline chạy trọn: hire→accept→pay→5 probe→echo→deliver→signed report. Reliability/schema/callable PASS.
- [x] Bugs fixed dọc đường (đều verified): reject-on-accept-fail; serialize chỉ audit-run; probe chờ status 'created' trước khi pay (INVALID_STATUS); WS watchdog tự reconnect sau 1008; **C3 settlement: getOrder full order để có requester_wallet/price (list view thiếu)**; latency threshold 60s→180s (CROO baseline ~90s).
- [x] Settlement verifier VALIDATED offline trên tx thật: escrow-lock 0.10 khoá CAPVault ✅, release 0.09 (−0.01 fee) tới EchoBot ✅. → lượt tới sẽ PASS.
- [x] **PASS report THẬT (2026-07-08):** report f4cb65bd-38af-454d-a57d-d046f880f607, đủ 5 check xanh (callable/schema/settlement/latency/reliability), settlement_tx_count=10 verify on-chain, offline sig VALID, trace chain VALID, badge PASS. Hire tx 0x61ce8504. https://handshake.tangvu.dev/report/f4cb65bd-38af-454d-a57d-d046f880f607
- [ ] USER: revoke Cloudflare token; quay video (dùng report PASS trên + tx BaseScan); điền Agent Store listing URL vào docs/DORAHACKS-SUBMISSION.md; submit trước 12/7 16:00 VN

## Risks
- Handshake SLA (2h) vs sequential probes against slow targets → per-probe timeout (default 600s) + global deadline = paid_at + SLA − 10min margin; on breach deliver PARTIAL with completed probes rather than lose escrow.
- One WS per API key → single process, single EventStream.
- Restart mid-audit: P1 marks in-flight jobs `aborted` (SLA refund protects buyer); reconciliation is out of scope (no-retry-queue non-goal).
