import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { config } from './config.js';
import { repo } from './db/repo.js';
import { verifyReport, publicKeyHex } from './attest/sign.js';
import { verifyTraceChain, traceRoot } from './audit/trace.js';
import { AuditEngine } from './audit/engine.js';
import type { CapClient, ChainVerifier } from './cap/client.js';
import { RealCapClient } from './cap/real-client.js';
import { BaseChainVerifier } from './cap/chain-verifier.js';
import { DryrunCapClient, DryrunChainVerifier } from './cap/dryrun-client.js';
import { badgeData, badgeSvg } from './attest/badge.js';
import { renderTraceHtml } from './views/trace-viewer-html.js';
import { renderLandingHtml } from './views/landing-page-html.js';
import { faviconSvg, logoSvg } from './views/brand-assets.js';

const app = new Hono();

app.get('/', (c) => c.html(renderLandingHtml({
  baseUrl: config.publicBaseUrl,
  mode: config.mode,
  pubkey: publicKeyHex(config.ed25519PrivateKeyHex),
  agentId: config.handshakeAgentId,
  reports: repo.getLatestReports(10),
})));

app.get('/healthz', (c) => c.json({
  ok: true,
  mode: config.mode,
  agent_id: config.handshakeAgentId || 'auto (from SDK key)',
}));

const svgHeaders = { 'content-type': 'image/svg+xml', 'cache-control': 'public, max-age=86400' } as const;
app.get('/favicon.svg', (c) => c.body(faviconSvg, 200, svgHeaders));
app.get('/favicon.ico', (c) => c.body(faviconSvg, 200, svgHeaders));
app.get('/logo.svg', (c) => c.body(logoSvg, 200, svgHeaders));

app.get('/report/:job_id', (c) => {
  const row = repo.getReport(c.req.param('job_id'));
  if (!row) return c.json({ error: 'report not found' }, 404);
  return c.body(row.report_json, 200, { 'content-type': 'application/json' });
});

// Re-checks the ed25519 signature and the trace hash chain server-side, and
// documents how to reproduce the same verification offline.
app.get('/verify/:job_id', (c) => {
  const jobId = c.req.param('job_id');
  const row = repo.getReport(jobId);
  if (!row) return c.json({ error: 'report not found' }, 404);

  const report = JSON.parse(row.report_json) as Record<string, unknown>;
  const pubkey = publicKeyHex(config.ed25519PrivateKeyHex);
  const signature = String(report.signature ?? '').replace(/^ed25519:/, '');
  const signatureValid = verifyReport(report, signature, pubkey);
  const chain = verifyTraceChain(jobId);

  return c.json({
    job_id: jobId,
    verdict: row.verdict,
    signature_valid: signatureValid,
    trace_chain_valid: chain.valid,
    trace_root: row.trace_root,
    auditor_pubkey: `ed25519:${pubkey}`,
    how_to_verify_offline: [
      `1. GET ${config.publicBaseUrl}/report/${jobId} and parse the JSON.`,
      '2. Remove the "signature" field.',
      '3. Canonicalize: recursively sort object keys lexicographically, serialize with JSON.stringify semantics, no whitespace. (All numbers in the report are integers, so this equals RFC 8785 JCS output.)',
      '4. Verify the ed25519 signature over the UTF-8 bytes of that string using the auditor pubkey embedded in the report (auditor.pubkey).',
      `5. Optionally re-derive the trace chain from GET ${config.publicBaseUrl}/trace/${jobId}: each step hash = sha256(canonical({job_id,seq,ts,step,data,prev_hash})). The report's trace_root must appear as one of the step hashes — it commits to the chain prefix at signing time; steps recorded after signing (delivery bookkeeping) extend the chain past it.`,
    ],
  });
});

// Content-negotiated: browsers get the HTML viewer, agents get JSON.
app.get('/trace/:job_id', (c) => {
  const jobId = c.req.param('job_id');
  const steps = repo.getTraceSteps(jobId);
  if (steps.length === 0) return c.json({ error: 'trace not found' }, 404);

  if ((c.req.header('accept') ?? '').includes('text/html')) {
    return c.html(renderTraceHtml({
      jobId,
      traceRoot: traceRoot(jobId),
      chainValid: verifyTraceChain(jobId).valid,
      steps,
      reportUrl: `${config.publicBaseUrl}/report/${jobId}`,
    }));
  }
  return c.json({
    job_id: jobId,
    trace_root: traceRoot(jobId),
    steps: steps.map((s) => ({
      seq: s.seq, ts: s.ts, step: s.step, data: JSON.parse(s.data_json),
      prev_hash: s.prev_hash, hash: s.hash,
    })),
  });
});

// /badge/<agent_id>.svg (embeddable image) or /badge/<agent_id>.json (machine).
app.get('/badge/:file', (c) => {
  const file = c.req.param('file');
  const m = file.match(/^(.+)\.(svg|json)$/);
  if (!m) return c.json({ error: 'use /badge/<agent_id>.svg or /badge/<agent_id>.json' }, 400);
  const data = badgeData(m[1], repo.getLatestReportForSubject(m[1]));
  if (m[2] === 'json') return c.json(data);
  return c.body(badgeSvg(data), 200, {
    'content-type': 'image/svg+xml',
    'cache-control': 'no-cache, max-age=300',
  });
});

app.get('/job/:job_id', (c) => {
  const job = repo.getJob(c.req.param('job_id'));
  if (!job) return c.json({ error: 'job not found' }, 404);
  return c.json({ ...job, probes: repo.getProbes(job.job_id) });
});

// --- Bootstrap ---

const cap: CapClient = config.mode === 'real' ? new RealCapClient() : new DryrunCapClient();
const verifier: ChainVerifier = config.mode === 'real' ? new BaseChainVerifier() : new DryrunChainVerifier();
const engine = new AuditEngine(cap, verifier);

if (config.mode === 'dryrun') {
  // Local-only stand-in for a real CAP negotiation hitting our service.
  app.post('/dev/simulate-intake', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const requirements = JSON.stringify({
      target_service_id: body.target_service_id ?? 'dryrun-target-ok',
      ...(body.target_agent_id ? { target_agent_id: body.target_agent_id } : {}),
      ...(body.sample_inputs ? { sample_inputs: body.sample_inputs } : {}),
      ...(body.callback_url ? { callback_url: body.callback_url } : {}),
    });
    const tier = body.tier === 'deep' ? 'deep' : 'basic';
    const result = (cap as DryrunCapClient).simulateBuyerIntake(requirements, tier);
    return c.json({ simulated: true, tier, ...result, hint: 'watch server logs; then GET /job list via /report/:job_id once delivered' });
  });
}

// Connect to CAP with exponential backoff. Non-fatal: the public report/verify/
// badge routes must stay available even if the CROO WebSocket is unreachable.
async function connectCapWithRetry(): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      await cap.start((e) => engine.handleIntake(e));
      console.log('handshake: CAP connected, listening for audit negotiations');
      return;
    } catch (err: any) {
      const delay = Math.min(30_000, 2 ** attempt * 1000);
      console.error(`handshake: CAP connect failed (retry in ${delay}ms):`, err?.message ?? err);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

async function main(): Promise<void> {
  engine.abortStaleJobs();
  // HTTP first so public routes are up immediately, then CAP in the background.
  serve({ fetch: app.fetch, port: config.port }, (info) => {
    console.log(`handshake: ${config.mode} mode, listening on :${info.port}, public base ${config.publicBaseUrl}`);
  });
  void connectCapWithRetry();
}

main().catch((err) => {
  console.error('handshake: fatal startup error', err);
  process.exit(1);
});
