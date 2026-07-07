import { readFileSync, existsSync } from 'node:fs';

// Minimal .env loader (no dependency): only sets vars not already in the environment.
function loadDotEnv(path = '.env'): void {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}
loadDotEnv();

function required(name: string): string {
  const v = process.env[name];
  if (!v || v === 'replace_me' || v === 'croo_sk_replace_me') {
    throw new Error(`config: missing required env var ${name}`);
  }
  return v;
}

const mode = (process.env.MODE ?? 'dryrun') as 'real' | 'dryrun';
if (mode !== 'real' && mode !== 'dryrun') throw new Error(`config: MODE must be "real" or "dryrun", got "${mode}"`);

export const config = {
  mode,
  port: Number(process.env.PORT ?? 8787),
  publicBaseUrl: (process.env.PUBLIC_BASE_URL ?? 'http://localhost:8787').replace(/\/$/, ''),
  dbPath: process.env.DB_PATH ?? './data/handshake.db',

  // CROO / CAP — required only in real mode
  crooApiUrl: mode === 'real' ? required('CROO_API_URL') : (process.env.CROO_API_URL ?? ''),
  crooWsUrl: mode === 'real' ? required('CROO_WS_URL') : (process.env.CROO_WS_URL ?? ''),
  crooSdkKey: mode === 'real' ? required('CROO_SDK_KEY') : (process.env.CROO_SDK_KEY ?? ''),
  // Agent id and service ids are OPTIONAL even in real mode: the WebSocket
  // stream only delivers negotiations targeting this agent's own services, so
  // Handshake can self-configure from just the SDK key. When unset, the agent
  // id is derived from the first negotiation's provider_agent_id, and every
  // incoming negotiation is treated as the basic tier (single-service default).
  handshakeAgentId: process.env.HANDSHAKE_AGENT_ID ?? (mode === 'dryrun' ? 'dryrun-handshake-agent' : ''),
  basicServiceId: process.env.BASIC_SERVICE_ID ?? (mode === 'dryrun' ? 'dryrun-basic-service' : ''),
  // Deep tier is optional: leave DEEP_SERVICE_ID unset until the service is
  // registered in the Dashboard; negotiations for it are simply not matched.
  deepServiceId: process.env.DEEP_SERVICE_ID ?? (mode === 'dryrun' ? 'dryrun-deep-service' : ''),

  baseRpcUrl: process.env.BASE_RPC_URL ?? 'https://mainnet.base.org',
  ed25519PrivateKeyHex: required('ED25519_PRIVATE_KEY_HEX'),

  // Base mainnet protocol constants (docs-cap/smart-contracts.md, docs-cap/faq.md)
  chain: 'base-mainnet',
  chainId: 8453,
  usdcAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  capCoreAddress: '0xaD46f1Eba2fe9cBB689D2874a52039192F2ac821',
  capVaultAddress: '0x33ECdcC8dD32330ec5a62AB1986F25ED5B5D170d',

  // Audit tiers. Price caps are in USDC base units (6 decimals): probes pay the
  // target's full service price, so uncapped targets would drain the wallet.
  tiers: {
    basic: {
      probeCount: 5,
      targetPriceCapBaseUnits: 200_000n, // 0.20 USDC
      slaMs: 2 * 60 * 60 * 1000,
    },
    deep: {
      probeCount: 15,
      targetPriceCapBaseUnits: 500_000n, // 0.50 USDC
      slaMs: 4 * 60 * 60 * 1000,
    },
  },

  // C4: p95 of target's paid→completed latency must stay under this.
  latencyP95ThresholdMs: Number(process.env.LATENCY_P95_THRESHOLD_MS ?? 60_000),

  // Engine timing
  pollIntervalMs: Number(process.env.POLL_INTERVAL_MS ?? 3000),
  probeOrderCreateTimeoutMs: Number(process.env.PROBE_ORDER_CREATE_TIMEOUT_MS ?? 120_000),
  probeCompleteTimeoutMs: Number(process.env.PROBE_COMPLETE_TIMEOUT_MS ?? 600_000),
  buyerPayTimeoutMs: Number(process.env.BUYER_PAY_TIMEOUT_MS ?? 900_000),
  slaSafetyMarginMs: 10 * 60 * 1000,
} as const;

export type Tier = keyof typeof config.tiers;
