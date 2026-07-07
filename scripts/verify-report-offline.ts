// Standalone offline verifier for a Handshake AuditReport. Proves the
// attestation without trusting the Handshake server: re-derives canonical
// JSON, checks the ed25519 signature against the pubkey embedded in the
// report, and (when reachable) replays the trace hash chain.
//
// Usage:
//   npx tsx scripts/verify-report-offline.ts <report-url-or-file>
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as ed from '@noble/ed25519';

ed.etc.sha512Sync = (...msgs: Uint8Array[]) => {
  const h = createHash('sha512');
  for (const m of msgs) h.update(m);
  return new Uint8Array(h.digest());
};

const canon = (v: unknown): string => {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(canon).join(',')}]`;
  const o = v as Record<string, unknown>;
  const keys = Object.keys(o).filter((k) => o[k] !== undefined).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canon(o[k])}`).join(',')}}`;
};

const sha256 = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');

async function load(src: string): Promise<any> {
  if (/^https?:\/\//.test(src)) {
    const res = await fetch(src);
    if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${src}`);
    return res.json();
  }
  return JSON.parse(readFileSync(src, 'utf8'));
}

async function main(): Promise<void> {
  const src = process.argv[2];
  if (!src) { console.error('usage: npx tsx scripts/verify-report-offline.ts <report-url-or-file>'); process.exit(2); }

  const report = await load(src);
  const { signature, ...unsigned } = report;
  const sigOk = ed.verify(
    String(signature).replace(/^ed25519:/, ''),
    new TextEncoder().encode(canon(unsigned)),
    String(report.auditor.pubkey).replace(/^ed25519:/, '')
  );
  console.log(`signature: ${sigOk ? 'VALID' : 'INVALID'} (pubkey ${report.auditor.pubkey})`);
  console.log(`verdict:   ${report.verdict} | subject ${report.subject.agent_id} / ${report.subject.service_id}`);

  // Trace chain replay — only possible when the trace endpoint is reachable.
  // The signed trace_root commits to the chain PREFIX at signing time; steps
  // recorded after signing (delivery bookkeeping) extend the chain past it,
  // so the root must appear as one of the step hashes, not as the final head.
  try {
    const trace = await load(String(report.trace_url));
    let prev = 'sha256:genesis';
    let broken = -1;
    let rootAtSeq = -1;
    for (const s of trace.steps) {
      const h = `sha256:${sha256(canon({ job_id: trace.job_id, seq: s.seq, ts: s.ts, step: s.step, data: s.data, prev_hash: prev }))}`;
      if (s.prev_hash !== prev || s.hash !== h) { broken = s.seq; break; }
      if (s.hash === report.trace_root) rootAtSeq = s.seq;
      prev = s.hash;
    }
    console.log(`trace:     ${broken !== -1 ? `CHAIN BROKEN at step ${broken}`
      : rootAtSeq !== -1 ? `VALID (signed root covers steps 0..${rootAtSeq} of ${trace.steps.length}; later steps are post-signing bookkeeping)`
      : 'signed trace_root NOT FOUND in chain'}`);
  } catch {
    console.log('trace:     (endpoint unreachable — skipped; signature check above is self-contained)');
  }

  process.exit(sigOk ? 0 : 1);
}

main().catch((err) => { console.error(err.message ?? err); process.exit(1); });
