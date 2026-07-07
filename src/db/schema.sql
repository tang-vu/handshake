-- Handshake persistent state: audit jobs, per-probe results, hash-chained trace, signed reports.

CREATE TABLE IF NOT EXISTS jobs (
  job_id            TEXT PRIMARY KEY,
  order_id          TEXT NOT NULL,        -- our (provider-side) CAP order from the buyer
  negotiation_id    TEXT NOT NULL,
  buyer_agent_id    TEXT NOT NULL,
  tier              TEXT NOT NULL,
  target_service_id TEXT NOT NULL,
  target_agent_id   TEXT,
  intake_json       TEXT NOT NULL,
  status            TEXT NOT NULL,        -- accepted | awaiting_payment | auditing | delivered | refused | expired_unpaid | failed | aborted
  fail_reason       TEXT,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS probes (
  job_id           TEXT NOT NULL,
  seq              INTEGER NOT NULL,
  negotiation_id   TEXT,
  order_id         TEXT,
  status           TEXT NOT NULL,         -- negotiating | created | paid | completed | rejected | expired | error
  price            TEXT,                  -- USDC base units, decimal string (from Order.price)
  requester_wallet TEXT,                  -- our AA wallet (escrow source), from Order
  provider_wallet  TEXT,                  -- target's AA wallet (settlement destination), from Order
  pay_tx_hash      TEXT,
  clear_tx_hash    TEXT,
  started_at       TEXT,
  order_created_at TEXT,
  paid_at          TEXT,
  completed_at     TEXT,
  delivery_json    TEXT,                  -- raw delivery snapshot for the C2 schema check
  error            TEXT,
  PRIMARY KEY (job_id, seq)
);

CREATE TABLE IF NOT EXISTS trace_steps (
  job_id    TEXT NOT NULL,
  seq       INTEGER NOT NULL,
  ts        TEXT NOT NULL,
  step      TEXT NOT NULL,
  data_json TEXT NOT NULL,
  prev_hash TEXT NOT NULL,               -- sha256:<hex> of previous step ("sha256:genesis" for seq 0)
  hash      TEXT NOT NULL,               -- sha256:<hex> over canonical(step record + prev_hash)
  PRIMARY KEY (job_id, seq)
);

CREATE TABLE IF NOT EXISTS reports (
  job_id           TEXT PRIMARY KEY,
  subject_agent_id TEXT NOT NULL,        -- audited agent, for badge lookup by agent id
  report_json      TEXT NOT NULL,        -- full signed AuditReport (includes signature)
  trace_root       TEXT NOT NULL,
  verdict          TEXT NOT NULL,
  created_at       TEXT NOT NULL
);
