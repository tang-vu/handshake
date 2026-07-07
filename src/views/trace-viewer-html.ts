import type { TraceStepRow } from '../db/repo.js';

// Server-rendered, dependency-free trace viewer. Shows the hash-chained
// reasoning trace of one audit job so anyone can eyeball what Handshake did
// and cross-check each step hash against the documented recipe.

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function renderTraceHtml(args: {
  jobId: string;
  traceRoot: string;
  chainValid: boolean;
  steps: TraceStepRow[];
  reportUrl: string;
}): string {
  const rows = args.steps
    .map((s) => {
      const data = JSON.stringify(JSON.parse(s.data_json), null, 1);
      return `<tr>
  <td class="num">${s.seq}</td>
  <td class="ts">${esc(s.ts)}</td>
  <td class="step">${esc(s.step)}</td>
  <td><pre>${esc(data)}</pre></td>
  <td class="hash" title="${esc(s.hash)}">${esc(s.hash.slice(0, 26))}…</td>
</tr>`;
    })
    .join('\n');

  const banner = args.chainValid
    ? '<div class="ok">✔ hash chain verified server-side — every step commits to its predecessor</div>'
    : '<div class="bad">✘ HASH CHAIN BROKEN — this trace has been tampered with or corrupted</div>';

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Handshake trace ${esc(args.jobId)}</title>
<style>
  body{font-family:ui-sans-serif,system-ui,sans-serif;margin:2rem auto;max-width:70rem;padding:0 1rem;color:#1a1a1a;background:#fafafa}
  h1{font-size:1.2rem} code{background:#eee;padding:.1rem .3rem;border-radius:3px}
  .ok{background:#e6f4ea;color:#137333;padding:.6rem 1rem;border-radius:6px;margin:1rem 0}
  .bad{background:#fce8e6;color:#c5221f;padding:.6rem 1rem;border-radius:6px;margin:1rem 0}
  table{border-collapse:collapse;width:100%;font-size:.85rem;background:#fff}
  th,td{border:1px solid #ddd;padding:.4rem .6rem;text-align:left;vertical-align:top}
  th{background:#f0f0f0} pre{margin:0;white-space:pre-wrap;word-break:break-word;font-size:.78rem}
  .num{text-align:right} .hash,.ts{font-family:ui-monospace,monospace;font-size:.75rem;white-space:nowrap}
  a{color:#1a5fb4}
</style></head><body>
<h1>Handshake — verifiable reasoning trace</h1>
<p>Job <code>${esc(args.jobId)}</code> · trace root <code>${esc(args.traceRoot)}</code> · <a href="${esc(args.reportUrl)}">signed report</a></p>
${banner}
<table>
<thead><tr><th>#</th><th>timestamp</th><th>step</th><th>data</th><th>hash</th></tr></thead>
<tbody>
${rows}
</tbody>
</table>
<p>Recompute offline: <code>hash = sha256(canonical({job_id, seq, ts, step, data, prev_hash}))</code> with lexicographically sorted keys; the last hash must equal the trace root embedded in the signed report.</p>
</body></html>`;
}
