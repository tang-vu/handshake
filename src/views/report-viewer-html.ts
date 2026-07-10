import { esc } from './html-escape.js';
import { renderPage, verdictChip, passChip } from './page-shell.js';

// Browser rendering of one signed AuditReport. The JSON stays the canonical,
// signed artifact (served to agents/curl); this view only presents it. All
// fields are read defensively — older reports may lack newer fields.

interface SettlementVerification { order_id?: string; escrow_lock?: string; settlement_release?: string }

const CSS = `
  .banner{display:flex;align-items:center;gap:1rem;flex-wrap:wrap;
    background:var(--card);border:1px solid var(--line);border-radius:12px;padding:1.05rem 1.2rem}
  .banner .verdict{font-size:1.02rem;padding:.35rem 1rem}
  .banner .job{font-family:ui-monospace,monospace;font-size:.82rem;color:var(--ink2);word-break:break-all}
  .actions{margin-left:auto;display:flex;gap:.5rem;flex-wrap:wrap}
  .meta{display:grid;grid-template-columns:repeat(auto-fit,minmax(13rem,1fr));gap:.8rem;margin-top:.9rem}
  .meta .card{padding:.7rem .9rem}
  .meta .k{font-size:.74rem;text-transform:uppercase;letter-spacing:.05em;color:var(--ink3)}
  .meta .v{font-family:ui-monospace,monospace;font-size:.8rem;word-break:break-all;margin-top:.15rem}
  .checkgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(16rem,1fr));gap:.8rem}
  .check h3{margin:0 0 .3rem;font-size:.95rem;display:flex;align-items:center;gap:.55rem}
  .check p{margin:.25rem 0 0;font-size:.86rem;color:var(--ink2)}
  .txlist{margin:.4rem 0 0;padding-left:1.2rem;font-size:.8rem}
  .txlist li{margin:.15rem 0;font-family:ui-monospace,monospace;word-break:break-all}
  .remediation li{margin:.35rem 0}
`;

const fmtSec = (ms: unknown): string =>
  typeof ms === 'number' && Number.isFinite(ms) ? `${(ms / 1000).toFixed(1)}s` : '—';

function checkCard(name: string, pass: boolean | undefined, body: string): string {
  return `<div class="card check"><h3>${esc(name)} ${passChip(pass === true)}</h3>${body}</div>`;
}

export function renderReportHtml(report: Record<string, any>, baseUrl: string): string {
  const jobId = String(report.job_id ?? '');
  const checks = report.checks ?? {};
  const settlement = checks.settlement ?? {};
  const latency = checks.latency_ms ?? {};
  const reliability = checks.reliability ?? {};
  const schema = checks.schema ?? {};
  const verifications: SettlementVerification[] = Array.isArray(settlement.verifications) ? settlement.verifications : [];
  const txHashes: string[] = Array.isArray(settlement.tx_hashes) ? settlement.tx_hashes : [];
  const remediation: string[] = Array.isArray(report.remediation) ? report.remediation : [];
  const violations: string[] = Array.isArray(schema.violations) ? schema.violations : [];
  const failures: string[] = Array.isArray(reliability.failures) ? reliability.failures : [];

  const started = String(report.started_at ?? '');
  const finished = String(report.finished_at ?? '');
  const durationMs = Date.parse(finished) - Date.parse(started);
  const duration = Number.isFinite(durationMs) ? `took ${Math.round(durationMs / 1000)}s` : '';

  const verificationRows = verifications.map((v) => `<tr>
    <td class="mono nowrap" title="${esc(String(v.order_id ?? ''))}">${esc(String(v.order_id ?? '').slice(0, 8))}…</td>
    <td class="small">${esc(String(v.escrow_lock ?? '—'))}</td>
    <td class="small">${esc(String(v.settlement_release ?? '—'))}</td>
  </tr>`).join('\n');

  const content = `
<div class="banner">
  ${verdictChip(String(report.verdict ?? 'UNKNOWN'))}
  <div>
    <div><strong>CAP integration audit</strong> <span class="muted small">· ${esc(String(report.mode ?? ''))} mode ${duration ? `· ${esc(duration)}` : ''}</span></div>
    <div class="job">job ${esc(jobId)}</div>
  </div>
  <div class="actions">
    <a class="btn ghost" href="${esc(baseUrl)}/report/${esc(jobId)}?format=json">Raw JSON</a>
    <a class="btn ghost" href="${esc(baseUrl)}/verify/${esc(jobId)}">Verify</a>
    <a class="btn primary" href="${esc(baseUrl)}/trace/${esc(jobId)}">Trace</a>
  </div>
</div>

<div class="meta">
  <div class="card"><div class="k">Subject agent</div><div class="v">${esc(String(report.subject?.agent_id ?? '—'))}</div></div>
  <div class="card"><div class="k">Subject service</div><div class="v">${esc(String(report.subject?.service_id ?? '—'))}</div></div>
  <div class="card"><div class="k">Auditor</div><div class="v">${esc(String(report.auditor?.agent_id ?? '—'))}</div></div>
  <div class="card"><div class="k">Window (UTC)</div><div class="v nowrap">${esc(started.slice(0, 19).replace('T', ' '))} → ${esc(finished.slice(11, 19))}</div></div>
</div>

<h2>Checks</h2>
<div class="checkgrid">
${checkCard('C1 · Callable', checks.callable?.pass,
    `<p>${esc(String(checks.callable?.detail ?? 'No detail recorded.'))}</p>`)}
${checkCard('C2 · Schema', schema.pass,
    violations.length
      ? `<p>Violations:</p><ul class="txlist">${violations.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`
      : '<p>All deliveries conform to the CAP deliverable contract.</p>')}
${checkCard('C3 · Settlement', settlement.pass,
    `<p>${esc(String(settlement.detail ?? `Escrow-lock and release verified against ${settlement.chain ?? 'Base'} RPC.`))}</p>
     <p>${txHashes.length} settlement transaction(s) verified on-chain.</p>`)}
${checkCard('C4 · Latency', latency.pass,
    `<p>p50 ${fmtSec(latency.p50)} · p95 ${fmtSec(latency.p95)} · threshold ${fmtSec(latency.threshold_p95)}
     · ${esc(String(latency.samples ?? 0))} samples</p>
     <p class="small muted">${esc(String(latency.basis ?? ''))}</p>`)}
${checkCard('C5 · Reliability', reliability.pass,
    `<p>${esc(String(reliability.errors ?? '—'))} error(s) across ${esc(String(reliability.calls ?? '—'))} probe call(s).</p>
     ${failures.length ? `<ul class="txlist">${failures.map((x) => `<li>${esc(String(x))}</li>`).join('')}</ul>` : ''}`)}
</div>

${verifications.length ? `<h2>Per-probe settlement verification</h2>
<div class="table-wrap"><table>
<thead><tr><th>Order</th><th>Escrow lock</th><th>Release</th></tr></thead>
<tbody>${verificationRows}</tbody></table></div>` : ''}

${txHashes.length ? `<h2>On-chain transactions</h2>
<p class="small muted">Each hash is a public Base transaction — no trust in this server required.</p>
<ul class="txlist">${txHashes.map((h) =>
  `<li><a href="https://basescan.org/tx/${esc(h)}">${esc(h)}</a></li>`).join('\n')}</ul>` : ''}

${remediation.length ? `<h2>Remediation</h2>
<ul class="remediation">${remediation.map((r) => `<li>${esc(String(r))}</li>`).join('\n')}</ul>` : ''}

<h2>Attestation</h2>
<div class="meta">
  <div class="card"><div class="k">Auditor pubkey</div><div class="v">${esc(String(report.auditor?.pubkey ?? '—'))}</div></div>
  <div class="card"><div class="k">Trace root</div><div class="v">${esc(String(report.trace_root ?? '—'))}</div></div>
  <div class="card"><div class="k">Signature (ed25519 over RFC 8785 canonical JSON)</div><div class="v">${esc(String(report.signature ?? '—'))}</div></div>
</div>
<p class="small muted">Verify offline via <a href="${esc(baseUrl)}/verify/${esc(jobId)}">/verify/${esc(jobId.slice(0, 8))}…</a>
or <code>npx tsx scripts/verify-report-offline.ts ${esc(baseUrl)}/report/${esc(jobId.slice(0, 8))}…</code></p>`;

  return renderPage({
    title: `Audit ${String(report.verdict ?? '')} — ${jobId.slice(0, 8)} · Handshake`,
    crumb: `report · <span class="mono">${esc(jobId.slice(0, 8))}…</span>`,
    extraCss: CSS,
    content,
  });
}
