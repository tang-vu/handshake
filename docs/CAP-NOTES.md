# CAP-NOTES — Ground Truth for Handshake

Sources: `./docs-cap/*.md` (mirrored 2026-07-07 from docs.croo.network) + `./docs-cap/node-sdk-src/*` (mirrored from github.com/CROO-Network/node-sdk@main, SDK v0.2.0). Nothing below is guessed; every method/field verified against SDK source.

## 1. How an agent registers

- **Dashboard-only, not SDK.** Register at [agent.croo.network](https://agent.croo.network/) → My Agents → Register Agent. System creates ERC-4337 AA wallet (Biconomy Nexus, CREATE2), mints Agent DID, issues API Key (`croo_sk_...`, shown once). Source: `quick-start.md` Step 1, `faq.md`.
- Then Configure page: description, 1–5 skill tags, **+ Add Service** wizard → name, price (USDC per call), SLA (h+m, min 300s), deliverable type (`text`/`schema`), requirements type (`text`/`schema`/none). Source: `service-registration.md`.
- Agent status `draft` → `online` automatically when SDK WebSocket handshake completes. Only `online` agents visible in Store. Source: `account-and-wallet-architecture.md`.
- **Handshake needs 2 registered agents minimum**: (a) Handshake itself (provider+prober), (b) a second "customer" agent for the demo. Both manual dashboard steps + USDC deposits to their **AA wallet addresses** (NOT Controller/Executor address).
- No protocol private keys held locally: SDK sends intent, platform Executor signs UserOp, gas sponsored by CROO Paymaster. We only hold the API Key.

## 2. How an agent exposes a callable endpoint

**Correction to master-prompt architecture: CAP agents have no inbound HTTP endpoint.** Providers connect *outbound* via WebSocket and react to events:

```
Buyer: negotiateOrder(serviceId) → we get WS `order_negotiation_created`
We:    acceptNegotiation(negId)  → platform submits dual-sig createOrder on-chain
Buyer: payOrder(orderId)         → USDC escrow locked in CAPVault → WS `order_paid` (SLA starts)
We:    [run audit] → deliverOrder(orderId, {deliverableType, ...}) → keccak256 hash on-chain → settlement
Buyer: WS `order_completed` → getDelivery(orderId)
```

Implication for `src/server.ts`: Hono serves **only public routes** (`/report`, `/verify`, `/badge`, `/trace`, health). The "CAP-callable endpoint" is a WS consumer loop (`src/cap/`) inside the same process. Intake payload (`target_service_id`, sample inputs, callback) arrives as the negotiation's `requirements` string (free-form; we define JSON schema for it).

Constraints (verified in SDK source `ws.ts`, `faq.md`):
- **1 WS connection per API key** (code 1008 on duplicates) → single shared `EventStream` per process; no horizontal scaling per key.
- WS auto-reconnects (backoff 1s→30s) except on 1008.
- Events carry only ids/status; fetch full state via `getOrder`/`getNegotiation`.
- Real event type strings differ from docs prose: negotiation events are `order_negotiation_created` etc. — always use `EventType` constants.

## 3. How payment (USDC) is requested/settled

- Price is fixed on the **Service** definition; requester never sends an amount for normal services. Token: USDC on Base mainnet only (`0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`, 6 decimals; `Order.price` is base-units decimal string).
- Flow: `payOrder` → SDK pre-checks ERC-20 balance via RPC → backend auto-approves USDC + submits `payOrder` UserOp → CAPVault pulls USDC from requester AA wallet, locks as escrow → `order_paid`.
- Settlement: `deliverOrder` writes deliverable keccak256 hash on-chain → CAPVault splits: platform fee → Treasury, remainder → provider AA wallet. Order `completed`.
- Refunds: provider reject after paid, or SLA timeout ⇒ automatic full refund to requester. **Handshake is paid only if it delivers the report within its own SLA.**
- Requester cannot reject after paying. `payOrder`/`deliverOrder` idempotent-retryable on revert.
- **No concurrent `payOrder` from one wallet** (AA nonce collision → `NONCE_ERROR`) → probe calls must be sequential.

## 4. How to verify a settlement tx on-chain (check C3)

`Order` (SDK `types.ts`) carries all tx refs directly — no extra API needed:

| Field | Meaning |
|---|---|
| `createTxHash` | on-chain createOrder (dual-sig) |
| `payTxHash` | escrow lock (USDC → CAPVault) |
| `deliverTxHash` | delivery hash + settlement |
| `clearTxHash` | funds released to provider |
| `rejectTxHash` | rejection/refund |

Also `PayOrderResult = {order, txHash}`, `DeliverOrderResult = {order, delivery, txHash}`.

Verification procedure (real mode, via Base RPC `eth_getTransactionReceipt` using ethers v6 — already an SDK dependency):
1. Receipt exists and `status === 1`.
2. Receipt `to`/logs involve known protocol contracts: CAPCore `0xaD46f1Eba2fe9cBB689D2874a52039192F2ac821`, CAPVault `0x33ECdcC8dD32330ec5a62AB1986F25ED5B5D170d` (Base 8453, contracts v2, EntryPoint v0.7). Note: txs are ERC-4337 UserOps, so receipt `to` is the EntryPoint/bundler — match on **log addresses**, not `tx.to`.
3. For `payTxHash`: USDC `Transfer` log, `to == CAPVault`, `value == order.price`, `from == order.requesterWalletAddress`.
4. For clear/settlement: USDC `Transfer` log from CAPVault to `order.providerWalletAddress`.
5. Cross-check `order.status` transitions via `getOrder` polling + WS events.

RPC: `https://mainnet.base.org` default; `BASE_RPC_URL` overridable.

## 5. SDK methods Handshake will use

Package: `@croo-network/sdk` v0.2.0 (deps: `ethers@^6`, `ws@^8`). Node ≥18. Env: `CROO_API_URL=https://api.croo.network`, `CROO_WS_URL=wss://api.croo.network/ws`, `CROO_SDK_KEY`.

| Method | Role | Used for |
|---|---|---|
| `new AgentClient(config, sdkKey)` | both | client init |
| `connectWebSocket()` → `EventStream.on/onAny/close` | both | intake events + probe lifecycle events |
| `acceptNegotiation(negId)` | provider | accept a paid audit job |
| `rejectNegotiation(negId, reason)` | provider | malformed intake payloads |
| `getNegotiation(negId)` | both | read intake `requirements` |
| `deliverOrder(orderId, {deliverableType, deliverableText/Schema})` | provider | deliver signed report (URL + verdict + signature) |
| `negotiateOrder({serviceId, requirements})` | prober (C1) | initiate probe call to target |
| `payOrder(orderId)` | prober (C3) | pay probe, returns `txHash` |
| `getOrder(orderId)` | prober (C3/C5) | tx hashes, status, wallets, deadlines |
| `getDelivery(orderId)` | prober (C2) | target's deliverable for schema check |
| `listOrders/listNegotiations(opts)` | ops | reconciliation on restart |
| `APIError` + `isNotFound/isInsufficientBalance/...` helpers | both | C5 error classification |

Not used: `uploadFile`/`getDownloadURL` (reports served from our own HTTP routes), `acceptNegotiationWithFundAddress` (no fund-transfer services), `rejectOrder` (only as safety path).

## 6. Design consequences for Handshake (from ground truth, need confirmation)

1. **Intake must include `target_service_id`** — `negotiateOrder` requires a serviceId; SDK has no service discovery/search by agent id. (`target_agent_id` kept for report metadata only, cross-checked against `Order.providerAgentId`.)
2. **Probe economics**: every probe pays the target's full service price. Basic tier (N=5) against a 1-USDC service costs Handshake 5 USDC while earning ~1 USDC. Options: cap allowed target price per tier / fewer probes / accept loss for hackathon demo. **User decision needed.**
3. **SLA budget**: audit duration ≈ Σ(negotiation accept wait + pay + target SLA) × N, sequential. Handshake's own Service SLA must exceed worst case, else escrow auto-refunds and we work for free. Engine needs per-probe timeout ≪ target SLA and a global deadline = our SLA − safety margin.
4. **C4 latency semantics**: measure per-probe (a) `order_paid`→`order_completed` (target work time, fair) and report both p50/p95; full negotiate→delivery includes chain+platform overhead outside target's control.
5. **Two-sided mechanic confirmed by protocol**: Handshake-as-provider earns into its AA wallet; Handshake-as-requester spends from the same AA wallet. On-chain explorer shows both directions on one address — matches demo script beat at 4:15.
6. **Dryrun mode**: mock at our `cap/client.ts` wrapper boundary (fake orders/tx hashes clearly marked `dryrun:`), since platform has no testnet (Base mainnet only).
7. Handshake deliverable type: propose `schema` with fields `{verdict, report_url, badge_url, trace_root, signature}` — machine-readable for agent buyers. Service registration wizard must match this exactly.

## Unresolved questions

1. **Deadline conflict**: DoraHacks search results say hackathon runs Jun 9 – Jul 11 with submissions closing **Jul 9**; master prompt says **Jul 12 16:00**. If Jul 9 is real, Phase 1 must compress. Please confirm from the DoraHacks page (fetch blocked, HTTP 405).
2. Probe economics (see §6.2): cap target price, or eat the cost for demo?
3. Handshake Service SLA value (proposal: 2h basic tier) and price tiers (1 USDC basic / 3 USDC deep) — confirm before dashboard registration since SLA/price live in the Service config.
4. `docs-cap/` was missing from the repo (only `.gitattributes` existed). I mirrored it from docs.croo.network + the node-sdk GitHub repo. If your original folder had extra material (e.g. a separate Agent Store listing guide PDF), please add it — the only listing guidance found is quick-start Steps 1–2.
5. Confirm dependency set: `@croo-network/sdk`, `hono`, `@hono/node-server`, `better-sqlite3`, `@noble/ed25519` + explicit `ethers@^6` (already required by the SDK) for receipt verification. Anything else I'll ask first.
