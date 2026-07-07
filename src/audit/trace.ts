import { repo } from '../db/repo.js';
import { canonicalJson } from '../attest/canonical-json.js';
import { sha256Hex } from '../attest/sign.js';

// Verifiable reasoning trace: an append-only, sha256 hash-chained log of every
// engine step for a job. Each step's hash commits to its content AND the
// previous hash, so the head hash (trace_root) commits to the entire history.
//
//   hash(step) = sha256( canonical({job_id, seq, ts, step, data, prev_hash}) )

const GENESIS = 'sha256:genesis';

export function appendTrace(jobId: string, step: string, data: Record<string, unknown>): string {
  const last = repo.getLastTraceStep(jobId);
  const seq = last ? last.seq + 1 : 0;
  const prevHash = last ? last.hash : GENESIS;
  const ts = new Date().toISOString();
  const payload = canonicalJson({ job_id: jobId, seq, ts, step, data, prev_hash: prevHash });
  const hash = `sha256:${sha256Hex(payload)}`;
  repo.appendTraceStep({ job_id: jobId, seq, ts, step, data_json: JSON.stringify(data), prev_hash: prevHash, hash });
  return hash;
}

export function traceRoot(jobId: string): string {
  const last = repo.getLastTraceStep(jobId);
  return last ? last.hash : GENESIS;
}

// Recomputes the chain from genesis; returns first broken seq or null if intact.
export function verifyTraceChain(jobId: string): { valid: boolean; brokenAtSeq: number | null } {
  let prevHash = GENESIS;
  for (const s of repo.getTraceSteps(jobId)) {
    const payload = canonicalJson({
      job_id: s.job_id, seq: s.seq, ts: s.ts, step: s.step,
      data: JSON.parse(s.data_json), prev_hash: prevHash,
    });
    if (s.prev_hash !== prevHash || s.hash !== `sha256:${sha256Hex(payload)}`) {
      return { valid: false, brokenAtSeq: s.seq };
    }
    prevHash = s.hash;
  }
  return { valid: true, brokenAtSeq: null };
}
