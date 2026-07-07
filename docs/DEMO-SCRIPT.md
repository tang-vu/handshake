# Handshake — Demo Video Script (≤ 5:00)

Preparation before recording (not shown): Handshake deployed in `MODE=real` and Online in the Agent Store; buyer agent funded with ≥2 USDC; a third-party target agent picked from the Store (price ≤0.20 USDC, known Online); browser tabs pre-opened: Agent Store listing, Handshake `/healthz`, BaseScan on Handshake's AA wallet, empty tab for report. Terminal ready with the buyer-side requester script.

---

## 0:00 — The problem (45s)

**Screen:** Agent Store with many listed agents. Then a slide with two words: "Counterparties. Confidence."

> Every team here just shipped a CAP agent. Now two questions: who will actually transact with it — and does the integration really work? Callable service, valid deliveries, real USDC settlement on Base? Today you find out by asking a teammate to poke it. Handshake turns that into a paid, verifiable, on-chain transaction.
>
> Handshake is a CAP Integration Auditor. It's an agent on this Store like yours. You pay it one USDC through CAP itself — and it becomes your agent's paying customer: it calls your agent five times, pays real USDC per call, verifies settlement on-chain, and signs an attestation anyone can check offline.

## 0:45 — Hire Handshake via CAP, show the USDC settlement (45s)

**Screen:** terminal running the buyer requester script: `negotiateOrder` → `order_created` → `payOrder` with tx hash printed. Click the tx hash → BaseScan.

> I'm a second wallet — a customer. I negotiate Handshake's audit service with one JSON field: the target service I want audited. Handshake accepts, an order is created on-chain, I pay — and here is my 1 USDC locked in CAPVault escrow on Base. Handshake only gets paid if it delivers my report within the SLA. The auditor is held to the same rules it audits.

## 1:30 — Live audit of a real third-party agent, trace streaming (90s)

**Screen:** browser at `/trace/<job_id>` (HTML viewer), refreshing as steps land: `intake_accepted` → `payment_received` → `probe_started` → `probe_order_created` → `probe_paid` (tx hash visible in the data column) → `probe_delivery_received` → … → `checks_computed`.

> The moment my payment lands, the audit starts — and every decision is logged in a hash-chained trace. Each row commits to the previous one, sha256 all the way down, so nobody — including Handshake — can rewrite history afterwards.
>
> Watch the probes: Handshake negotiates with the target agent, the target accepts, Handshake pays its real price — that's a real USDC escrow per call — the target delivers, settlement releases. Five times. Latency measured, deliveries validated, every pay and clear transaction independently re-checked against Base RPC — not against CROO's API. Trust, but verify: the chain is the source of truth.

## 3:00 — Signed report, badge, offline verification (75s)

**Screen:** `/report/<job_id>` JSON — scroll `checks` (point at `settlement.tx_hashes`, `latency_ms.p95`), `verdict`, `signature`. Then `/verify/<job_id>`. Then terminal: run the 15-line offline verifier from the README → `true`. Then the badge SVG in a README preview.

> The deliverable: an AuditReport, ed25519-signed over canonical JSON. Verdict is deterministic code — there is no way to pay for a better one; a FAIL ships as FAIL with remediation steps.
>
> And you don't have to trust my server: fifteen lines of code, the report JSON, the public key inside it — signature valid. The trace root is in the signed report, the transactions are public on Base. The whole attestation verifies offline.
>
> Winners get this: a live badge for your README — "CAP audit: PASS" — linking to the signed proof.

## 4:15 — The two-sided economy on-chain (45s)

**Screen:** BaseScan token-transfer view of Handshake's AA wallet: incoming 1 USDC audit fees, outgoing probe payments to multiple distinct agent wallets.

> One address, two directions. Fees flow in from customers; probe payments flow out to their agents. Every audit makes Handshake a counterparty for another team — and makes that team a counterparty for Handshake. That's the flywheel CAP was built for: agents doing real commerce with agents.
>
> Handshake — audits you can verify, from an agent you can hire right now on the CROO Agent Store.

**Screen (final frame, 5s):** repo URL + Agent Store listing + badge.

---

## Fallback plan

If the live third-party target misbehaves on camera, that IS the product — narrate the honest FAIL/PARTIAL verdict and its remediation list. Only if CROO infrastructure itself is down: cut to a pre-recorded take of the same flow (record one full successful run the evening before as insurance).
