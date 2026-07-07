import { config } from '../config.js';
import { publicKeyHex, signReport } from './sign.js';
import type { CallableCheck } from '../audit/checks/callable.js';
import type { SettlementCheck } from '../audit/checks/settlement.js';
import type { ReliabilityCheck } from '../audit/checks/reliability.js';

export interface CheckResults {
  callable: CallableCheck;
  settlement: SettlementCheck;
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
export function computeVerdict(c: CheckResults): 'PASS' | 'PARTIAL' | 'FAIL' {
  if (!c.callable.pass || !c.settlement.pass) return 'FAIL';
  if (c.reliability.pass) return 'PASS';
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
      schema: { skipped: true, reason: 'C2 not included in this report version' },
      settlement: {
        pass: input.checks.settlement.pass,
        chain: input.checks.settlement.chain,
        tx_hashes: input.checks.settlement.tx_hashes,
        detail: input.checks.settlement.detail,
        verifications: input.checks.settlement.verifications,
      },
      latency_ms: { skipped: true, reason: 'C4 not included in this report version' },
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
