import type { ReportRow } from '../db/repo.js';
import { esc } from './html-escape.js';
import { renderPage, verdictChip } from './page-shell.js';

// Server-rendered landing page at "/". Dark-first product page: hero with a
// real attestation card (latest report), live stat tiles from this instance's
// DB, the audit mechanic, and deep links into every report ever issued.

const REPO_URL = 'https://github.com/tang-vu/handshake';

const CHECKS: Array<[string, string, string]> = [
  ['C1 callable', 'Accepts negotiations and produces on-chain orders', 'hard — fail ⇒ FAIL'],
  ['C2 schema', 'Deliveries conform to the CAP deliverable contract', 'quality — fail ⇒ PARTIAL'],
  ['C3 settlement', 'Escrow-lock + release txs re-verified against Base RPC directly', 'hard — fail ⇒ FAIL'],
  ['C4 latency', 'p50/p95 of paid→completed per probe vs threshold', 'quality — fail ⇒ PARTIAL'],
  ['C5 reliability', 'Every probe must complete; errors and timeouts count', 'quality — fail ⇒ PARTIAL'],
];

const STEPS: Array<[string, string]> = [
  ['Hire via CAP', 'An agent negotiates Handshake’s audit service and pays 1 USDC into escrow, passing the <code>target_service_id</code> to audit.'],
  ['Probed as a real customer', 'Handshake calls the target 5 times through full CAP order lifecycles, paying the target’s real USDC price per probe on Base mainnet.'],
  ['Signed, verifiable report', 'Five deterministic checks produce a PASS / PARTIAL / FAIL report — ed25519-signed over canonical JSON with a hash-chained trace, verifiable offline.'],
];

const ENDPOINTS: Array<[string, string]> = [
  ['GET /report/:job_id', 'Signed AuditReport — JSON for agents, HTML view in a browser'],
  ['GET /verify/:job_id', 'Signature + trace-chain re-check, plus the offline verification recipe'],
  ['GET /trace/:job_id', 'Hash-chained reasoning trace (HTML for browsers, JSON for agents)'],
  ['GET /badge/:agent_id.svg', 'Embeddable verdict badge; .json for the machine-readable form'],
  ['GET /job/:job_id', 'Job status and per-probe settlement detail (JSON)'],
  ['GET /healthz', 'Liveness and mode'],
];

const GRID_URI = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='44' height='44'%3E%3Cpath d='M44 0H0v44' fill='none' stroke='%23ffffff' stroke-opacity='.05'/%3E%3C/svg%3E")`;

const CSS = `
  .hero{position:relative;padding:3.6rem 0 1rem;display:grid;gap:2.5rem;
    grid-template-columns:minmax(0,1.2fr) minmax(0,.8fr);align-items:center}
  .hero::before{content:'';position:absolute;inset:-6rem -20rem 0;z-index:-1;pointer-events:none;
    background:radial-gradient(38rem 22rem at 18% 8%,rgba(99,102,241,.22),transparent 65%),
               radial-gradient(30rem 20rem at 85% 30%,rgba(34,211,238,.13),transparent 65%),
               ${GRID_URI}}
  .hero h1{font-size:clamp(2.1rem,5vw,3.1rem);line-height:1.08;font-weight:700}
  .hero h1 em{font-style:normal;background:var(--grad);
    -webkit-background-clip:text;background-clip:text;color:transparent}
  .hero .tag{color:var(--ink2);margin:1.1rem 0 0;font-size:1.05rem;max-width:34rem}
  .cta{display:flex;gap:.8rem;margin:1.7rem 0 0;flex-wrap:wrap;align-items:center}
  .attest .rows{display:grid;gap:.65rem;margin-top:.9rem}
  .attest .row{display:flex;justify-content:space-between;gap:1rem;font-size:.82rem;
    border-top:1px solid var(--line);padding-top:.65rem}
  .attest .row .k{color:var(--ink3)}
  .attest .row .v{font-family:ui-monospace,monospace;font-size:.76rem;text-align:right;word-break:break-all}
  .attest .open{display:block;margin-top:1rem;font-size:.85rem}
  .stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(10rem,1fr));gap:.9rem;margin-top:3rem}
  .stat{background:var(--card);border:1px solid var(--line);border-radius:12px;
    padding:.95rem 1.1rem;position:relative;overflow:hidden}
  .stat::before{content:'';position:absolute;top:0;left:0;right:0;height:2px;background:var(--grad);opacity:.7}
  .stat .label{font-size:.76rem;color:var(--ink2)}
  .stat .value{font-family:'Space Grotesk',sans-serif;font-size:1.9rem;font-weight:700;
    letter-spacing:-.02em;margin-top:.1rem}
  .steps{display:grid;grid-template-columns:repeat(auto-fit,minmax(15rem,1fr));gap:.9rem}
  .step .n{display:inline-flex;width:1.7rem;height:1.7rem;border-radius:99px;background:var(--grad);
    color:#fff;font-weight:700;font-size:.85rem;align-items:center;justify-content:center;margin-bottom:.55rem}
  .step h3{margin:.1rem 0 .35rem;font-size:1rem}
  .step p{margin:0;font-size:.87rem;color:var(--ink2)}
  .integrity{border-left:3px solid;border-image:var(--grad) 1;padding:.2rem 0 .2rem 1.1rem;
    margin:2.6rem 0 0;color:var(--ink2);font-size:.98rem;max-width:46rem}
  .note{font-size:.88rem;color:var(--ink2);margin:.25rem 0 1rem;max-width:46rem}
  .links a{margin-right:.65rem;white-space:nowrap}
  @media(max-width:820px){.hero{grid-template-columns:1fr}.hero .attestwrap{display:none}}
`;

function attestCard(r: ReportRow, baseUrl: string): string {
  let txs = 0; let pubkey = '';
  try {
    const j = JSON.parse(r.report_json);
    txs = Array.isArray(j?.checks?.settlement?.tx_hashes) ? j.checks.settlement.tx_hashes.length : 0;
    pubkey = String(j?.auditor?.pubkey ?? '');
  } catch { /* card degrades gracefully on malformed rows */ }
  return `<div class="attestwrap glowwrap"><div class="card attest">
  <div style="display:flex;justify-content:space-between;align-items:center;gap:1rem">
    <strong style="font-family:'Space Grotesk',sans-serif">AuditReport</strong>
    ${verdictChip(r.verdict)}
  </div>
  <div class="rows">
    <div class="row"><span class="k">job</span><span class="v">${esc(r.job_id.slice(0, 18))}…</span></div>
    <div class="row"><span class="k">subject</span><span class="v">${esc(r.subject_agent_id.slice(0, 18))}…</span></div>
    <div class="row"><span class="k">settlement</span><span class="v">${txs} txs verified on Base</span></div>
    <div class="row"><span class="k">signature</span><span class="v">${esc(pubkey.slice(0, 26))}…</span></div>
    <div class="row"><span class="k">trace root</span><span class="v">${esc(r.trace_root.slice(0, 26))}…</span></div>
  </div>
  <a class="open" href="${esc(baseUrl)}/report/${esc(r.job_id)}">Open the signed report →</a>
</div></div>`;
}

function reportRow(r: ReportRow, baseUrl: string): string {
  return `<tr>
  <td class="mono nowrap" title="${esc(r.job_id)}">${esc(r.job_id.slice(0, 8))}…</td>
  <td class="mono nowrap" title="${esc(r.subject_agent_id)}">${esc(r.subject_agent_id.slice(0, 8))}…</td>
  <td>${verdictChip(r.verdict)}</td>
  <td class="mono nowrap dim">${esc(r.created_at.slice(0, 16).replace('T', ' '))}</td>
  <td class="links small">
    <a href="${esc(baseUrl)}/report/${esc(r.job_id)}">report</a>
    <a href="${esc(baseUrl)}/verify/${esc(r.job_id)}">verify</a>
    <a href="${esc(baseUrl)}/trace/${esc(r.job_id)}">trace</a>
  </td>
</tr>`;
}

export function renderLandingHtml(args: {
  baseUrl: string;
  mode: string;
  pubkey: string;
  agentId: string;
  reports: ReportRow[];
  stats: { audits: number; passed: number; probes: number; settlementTxs: number };
}): string {
  const storeUrl = args.agentId ? `https://agent.croo.network/agents/${esc(args.agentId)}` : '';

  const audits = args.reports.length
    ? `<p class="note">Every report this instance has ever issued is listed below, unredacted —
including earlier <strong>FAIL</strong> runs against our own demo target while its integration
was still broken. FAIL ships as FAIL; the report’s credibility is the product.</p>
<div class="table-wrap"><table>
<thead><tr><th>Job</th><th>Subject</th><th>Verdict</th><th>Issued (UTC)</th><th>Links</th></tr></thead>
<tbody>${args.reports.map((r) => reportRow(r, args.baseUrl)).join('\n')}</tbody>
</table></div>`
    : `<p class="card muted">No audits delivered yet on this instance. Buy the audit service on
       <a href="https://agent.croo.network/">agent.croo.network</a> and the report lands here.</p>`;

  const content = `
<div class="hero">
  <div>
    <h1>Audits for the agent economy,<br><em>signed and settled on Base</em></h1>
    <p class="tag">A paid, CAP-callable agent that audits other agents’ CAP integrations as a
    <strong>real paying customer</strong> — and issues signed, independently verifiable attestations.</p>
    <div class="cta">
      ${storeUrl ? `<a class="btn primary" href="${storeUrl}">Hire it on the Agent Store — 1 USDC</a>` : ''}
      <a class="btn ghost" href="${REPO_URL}">Source on GitHub</a>
    </div>
  </div>
  ${args.reports.length ? attestCard(args.reports[0], args.baseUrl) : ''}
</div>

<div class="stats">
  <div class="stat"><div class="label">Audits delivered</div><div class="value">${args.stats.audits}</div></div>
  <div class="stat"><div class="label">PASS verdicts</div><div class="value">${args.stats.passed}</div></div>
  <div class="stat"><div class="label">Probe calls paid</div><div class="value">${args.stats.probes}</div></div>
  <div class="stat"><div class="label">On-chain txs verified</div><div class="value">${args.stats.settlementTxs}</div></div>
</div>

<section>
<span class="eyebrow">The mechanic</span>
<h2>How an audit works</h2>
<div class="steps">
${STEPS.map(([t, d], i) => `<div class="card step"><span class="n">${i + 1}</span><h3>${t}</h3><p>${d}</p></div>`).join('\n')}
</div>
<p class="integrity">Verdicts are computed by deterministic code — no LLM judgment, and no mechanism
exists to pay for a better one. Over-priced targets and internal failures end in automatic full
refunds through CAP’s own escrow-rejection flow.</p>
</section>

<section id="audits">
<span class="eyebrow">Proof</span>
<h2>Recent audits</h2>
${audits}
</section>

<section id="method">
<span class="eyebrow">Method</span>
<h2>The five checks</h2>
<div class="table-wrap"><table>
<thead><tr><th>Check</th><th>What it proves</th><th>Gate</th></tr></thead>
<tbody>${CHECKS.map(([c, w, g]) =>
  `<tr><td class="nowrap"><strong>${c}</strong></td><td>${w}</td><td class="small dim nowrap">${g}</td></tr>`).join('\n')}
</tbody></table></div>
</section>

<section>
<span class="eyebrow">Trust</span>
<h2>Auditor identity</h2>
<p class="small muted" style="max-width:46rem">Every report is signed with this ed25519 key. Verify offline:
strip <code>signature</code>, canonicalize the JSON (RFC 8785), check the signature over the UTF-8 bytes —
recipe on any <a href="/verify/${args.reports.length ? esc(args.reports[0].job_id) : ''}">verify page</a> and in the README.</p>
<div class="keybox">ed25519:${esc(args.pubkey)}</div>
</section>

<section id="api">
<span class="eyebrow">Integrate</span>
<h2>API</h2>
<div class="table-wrap"><table>
<thead><tr><th>Endpoint</th><th>Returns</th></tr></thead>
<tbody>${ENDPOINTS.map(([e, d]) => `<tr><td class="mono nowrap">${esc(e)}</td><td>${esc(d)}</td></tr>`).join('\n')}
</tbody></table></div>
</section>`;

  return renderPage({
    title: 'Handshake — CAP Integration Auditor',
    description: 'A paid, CAP-callable agent that audits other agents’ CAP integrations and issues signed, independently verifiable attestations.',
    extraCss: CSS,
    content,
  });
}
