import { config } from '../config.js';
import { publicKeyHex, signReport } from './sign.js';
import type { CallableCheck } from '../audit/checks/callable.js';
import type { SettlementCheck } from '../audit/checks/settlement.js';
import type { ReliabilityCheck } from '../audit/checks/reliability.js';
import type { SchemaCheck } from '../audit/checks/schema.js';
import type { LatencyCheck } from '../audit/checks/latency.js';

export interface CheckResults {
  callable: CallableCheck;
  schema: SchemaCheck;
  settlement: SettlementCheck;
  latency: LatencyCheck;
  reliability: ReliabilityCheck;
}

export interface ReportInputs {
  jobId: string;
  subjectAgentId: string;
  subjectServiceId: string;
  startedAt: string;
  finishedAt: string;
  checks: CheckResults;
  traceRoot: string;
}

// Verdict is pure deterministic code — never LLM judgment, never negotiable.
// A paying customer's confidence is the product: FAIL stays FAIL.
// Hard gates: callable + on-chain settlement. Quality gates (reliability,
// schema conformance, latency) downgrade PASS to PARTIAL.
export function computeVerdict(c: CheckResults): 'PASS' | 'PARTIAL' | 'FAIL' {
  if (!c.callable.pass || !c.settlement.pass) return 'FAIL';
  if (c.reliability.pass && c.schema.pass && c.latency.pass) return 'PASS';
  return 'PARTIAL';
}

function remediation(c: CheckResults): string[] {
  const out: string[] = [];
  if (!c.callable.pass) {
    out.push('Bring the agent Online: keep the SDK WebSocket connected (heartbeat) and auto-accept negotiations for the audited service.');
  }
  if (!c.settlement.pass) {
    out.push('Ensure orders settle on-chain: complete the pay -> deliver flow so escrow lock and CAPVault release transactions confirm on Base.');
  }
  if (!c.reliability.pass) {
    out.push(`${c.reliability.errors}/${c.reliability.calls} probe call(s) failed — see checks.reliability.failures; deliver within the service SLA and avoid rejecting paid orders.`);
  }
  if (!c.schema.pass) {
    out.push('Fix delivery conformance: see checks.schema.violations — return non-empty content matching the declared deliverable type (schema deliveries must be valid JSON objects).');
  }
  if (!c.latency.pass) {
    out.push(`Reduce delivery latency: p95 ${c.latency.p95}ms exceeds the ${c.latency.threshold_p95}ms threshold (measured paid -> completed).`);
  }
  return out;
}

// AuditReport v1. All numbers are integers (canonical-json requirement).
// checks.schema (C2) and checks.latency_ms (C4) ship in a later phase and are
// reported as skipped rather than silently omitted.
export function buildSignedReport(input: ReportInputs): Record<string, unknown> {
  const verdict = computeVerdict(input.checks);
  const report: Record<string, unknown> = {
    version: '1',
    auditor: {
      agent_id: config.handshakeAgentId,
      pubkey: `ed25519:${publicKeyHex(config.ed25519PrivateKeyHex)}`,
    },
    subject: {
      agent_id: input.subjectAgentId,
      service_id: input.subjectServiceId,
    },
    job_id: input.jobId,
    mode: config.mode,
    started_at: input.startedAt,
    finished_at: input.finishedAt,
    checks: {
      callable: input.checks.callable,
      schema: { pass: input.checks.schema.pass, violations: input.checks.schema.violations },
      settlement: {
        pass: input.checks.settlement.pass,
        chain: input.checks.settlement.chain,
        tx_hashes: input.checks.settlement.tx_hashes,
        detail: input.checks.settlement.detail,
        verifications: input.checks.settlement.verifications,
      },
      latency_ms: {
        pass: input.checks.latency.pass,
        p50: input.checks.latency.p50,
        p95: input.checks.latency.p95,
        threshold_p95: input.checks.latency.threshold_p95,
        samples: input.checks.latency.samples,
        basis: input.checks.latency.basis,
      },
      reliability: {
        pass: input.checks.reliability.pass,
        calls: input.checks.reliability.calls,
        errors: input.checks.reliability.errors,
        failures: input.checks.reliability.failures,
      },
    },
    verdict,
    remediation: remediation(input.checks),
    trace_root: input.traceRoot,
    trace_url: `${config.publicBaseUrl}/trace/${input.jobId}`,
    report_url: `${config.publicBaseUrl}/report/${input.jobId}`,
    verify_url: `${config.publicBaseUrl}/verify/${input.jobId}`,
  };
  report.signature = `ed25519:${signReport(report, config.ed25519PrivateKeyHex)}`;
  return report;
}

// The structured payload delivered back through CAP to the buyer.
export function deliverablePayload(report: Record<string, unknown>): string {
  return JSON.stringify({
    verdict: report.verdict,
    report_url: report.report_url,
    verify_url: report.verify_url,
    trace_root: report.trace_root,
    signature: report.signature,
    pubkey: (report.auditor as Record<string, unknown>).pubkey,
  });
}
