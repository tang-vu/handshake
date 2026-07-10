import type { TraceStepRow } from '../db/repo.js';
import { esc } from './html-escape.js';
import { renderPage } from './page-shell.js';

// Server-rendered, dependency-free trace viewer. Shows the hash-chained
// reasoning trace of one audit job so anyone can eyeball what Handshake did
// and cross-check each step hash against the documented recipe.

const CSS = `
  .chainbar{border-radius:10px;padding:.7rem 1rem;font-weight:600;font-size:.92rem;margin:1rem 0}
  .chainbar.ok{border:1px solid var(--good-line)}
  .chainbar.bad{border:1px solid var(--crit-line)}
  .chainbar.ok{background:var(--good-bg);color:var(--good)}
  .chainbar.bad{background:var(--crit-bg);color:var(--crit)}
  td pre{margin:0;white-space:pre-wrap;word-break:break-word;font-size:.75rem;line-height:1.45}
  .stepname{font-family:ui-monospace,monospace;font-size:.78rem;font-weight:600;white-space:nowrap}
  .hash,.ts{font-family:ui-monospace,monospace;font-size:.72rem;white-space:nowrap;color:var(--ink2)}
  .num{text-align:right;color:var(--ink3)}
  .actions{display:flex;gap:.5rem;flex-wrap:wrap;margin:1.1rem 0 0}
`;

export function renderTraceHtml(args: {
  jobId: string;
  traceRoot: string;
  chainValid: boolean;
  steps: TraceStepRow[];
  reportUrl: string;
}): string {
  const rows = args.steps
    .map((s) => `<tr>
  <td class="num">${s.seq}</td>
  <td class="ts">${esc(s.ts.slice(11, 19))}</td>
  <td class="stepname">${esc(s.step)}</td>
  <td><pre>${esc(JSON.stringify(JSON.parse(s.data_json), null, 1))}</pre></td>
  <td class="hash" title="${esc(s.hash)}">${esc(s.hash.slice(0, 18))}…</td>
</tr>`)
    .join('\n');

  const banner = args.chainValid
    ? '<div class="chainbar ok">✓ Hash chain verified server-side — every step commits to its predecessor</div>'
    : '<div class="chainbar bad">✕ HASH CHAIN BROKEN — this trace has been tampered with or corrupted</div>';

  const content = `
<h1>Verifiable reasoning trace</h1>
<p class="small muted">Job <span class="mono">${esc(args.jobId)}</span>
· trace root <span class="mono">${esc(args.traceRoot.slice(0, 18))}…</span>
· ${args.steps.length} steps</p>
${banner}
<div class="table-wrap"><table>
<thead><tr><th>#</th><th>Time</th><th>Step</th><th>Data</th><th>Hash</th></tr></thead>
<tbody>
${rows}
</tbody>
</table></div>
<p class="small muted">Recompute offline: <code>hash = sha256(canonical({job_id, seq, ts, step, data, prev_hash}))</code>
with lexicographically sorted keys; the signed report’s trace root must appear among the step hashes.</p>
<div class="actions">
  <a class="btn primary" href="${esc(args.reportUrl)}">Signed report</a>
  <a class="btn ghost" href="${esc(args.reportUrl).replace('/report/', '/verify/')}">Verify</a>
</div>`;

  return renderPage({
    title: `Trace ${args.jobId.slice(0, 8)} — Handshake`,
    crumb: `trace · <span class="mono">${esc(args.jobId.slice(0, 8))}…</span>`,
    extraCss: CSS,
    content,
  });
}
