import type { ReportRow } from '../db/repo.js';
import { esc } from './html-escape.js';
import { renderPage, verdictChip } from './page-shell.js';

// Server-rendered landing page at "/". First thing a human sees when they open
// the public URL: what Handshake is, live figures from this instance's own DB,
// how an audit works, and deep links into every real report ever issued.

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
  ['Signed, verifiable report', 'Five deterministic checks produce a PASS/PARTIAL/FAIL report — ed25519-signed over canonical JSON with a hash-chained trace, verifiable offline.'],
];

const ENDPOINTS: Array<[string, string]> = [
  ['GET /report/:job_id', 'Signed AuditReport — JSON for agents, HTML view in a browser'],
  ['GET /verify/:job_id', 'Signature + trace-chain re-check, plus the offline verification recipe'],
  ['GET /trace/:job_id', 'Hash-chained reasoning trace (HTML for browsers, JSON for agents)'],
  ['GET /badge/:agent_id.svg', 'Embeddable verdict badge; .json for the machine-readable form'],
  ['GET /job/:job_id', 'Job status and per-probe settlement detail (JSON)'],
  ['GET /healthz', 'Liveness and mode'],
];

const CSS = `
  .hero{display:flex;gap:1.4rem;align-items:flex-start;margin:1.4rem 0 0}
  .hero img{width:72px;height:72px;border-radius:16px;flex:none}
  .hero h1{font-size:2rem;line-height:1.15}
  .hero .tag{color:var(--ink2);margin:.4rem 0 0;font-size:1.02rem}
  .cta{display:flex;gap:.7rem;margin:1.3rem 0 0;flex-wrap:wrap;align-items:center}
  .stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(9.5rem,1fr));gap:.8rem;margin:2.2rem 0 0}
  .stat{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:.8rem 1rem}
  .stat .label{font-size:.78rem;color:var(--ink2)}
  .stat .value{font-size:1.7rem;font-weight:650;letter-spacing:-.02em;margin-top:.1rem}
  .steps{display:grid;grid-template-columns:repeat(auto-fit,minmax(15rem,1fr));gap:.8rem}
  .step{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:.9rem 1.05rem}
  .step .n{display:inline-flex;width:1.55rem;height:1.55rem;border-radius:99px;background:var(--grad);
    color:#fff;font-weight:650;font-size:.85rem;align-items:center;justify-content:center;margin-bottom:.45rem}
  .step h3{margin:.1rem 0 .3rem;font-size:.98rem}
  .step p{margin:0;font-size:.87rem;color:var(--ink2)}
  .note{font-size:.88rem;color:var(--ink2);margin:.25rem 0 .8rem}
  .links a{margin-right:.6rem;white-space:nowrap}
  .integrity{border-left:3px solid var(--brand);padding:.15rem 0 .15rem .9rem;margin:1.6rem 0;color:var(--ink2)}
`;

function reportRow(r: ReportRow, baseUrl: string): string {
  return `<tr>
  <td class="mono nowrap" title="${esc(r.job_id)}">${esc(r.job_id.slice(0, 8))}…</td>
  <td class="mono nowrap" title="${esc(r.subject_agent_id)}">${esc(r.subject_agent_id.slice(0, 8))}…</td>
  <td>${verdictChip(r.verdict)}</td>
  <td class="mono nowrap">${esc(r.created_at.slice(0, 16).replace('T', ' '))}</td>
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
  <img src="/logo.svg" alt="">
  <div>
    <h1>Audits for the agent economy,<br>signed and settled on Base</h1>
    <p class="tag">A paid, CAP-callable agent that audits other agents’ CAP integrations
    as a <strong>real paying customer</strong> and issues signed, independently verifiable attestations.</p>
    <div class="cta">
      ${storeUrl ? `<a class="btn primary" href="${storeUrl}">Hire it on the Agent Store — 1 USDC</a>` : ''}
      <a class="btn ghost" href="${REPO_URL}">Source on GitHub</a>
      <span class="small muted">mode: ${esc(args.mode)} · Base mainnet (8453)</span>
    </div>
  </div>
</div>

<div class="stats">
  <div class="stat"><div class="label">Audits delivered</div><div class="value">${args.stats.audits}</div></div>
  <div class="stat"><div class="label">PASS verdicts</div><div class="value">${args.stats.passed}</div></div>
  <div class="stat"><div class="label">Probe calls paid</div><div class="value">${args.stats.probes}</div></div>
  <div class="stat"><div class="label">On-chain txs verified</div><div class="value">${args.stats.settlementTxs}</div></div>
</div>

<h2>How an audit works</h2>
<div class="steps">
${STEPS.map(([t, d], i) => `<div class="step"><span class="n">${i + 1}</span><h3>${t}</h3><p>${d}</p></div>`).join('\n')}
</div>

<p class="integrity">Verdicts are computed by deterministic code — no LLM judgment, and no mechanism
exists to pay for a better one. Over-priced targets and internal failures end in automatic full
refunds through CAP’s own escrow-rejection flow.</p>

<h2 id="audits">Recent audits</h2>
${audits}

<h2>The five checks</h2>
<div class="table-wrap"><table>
<thead><tr><th>Check</th><th>What it proves</th><th>Gate</th></tr></thead>
<tbody>${CHECKS.map(([c, w, g]) =>
  `<tr><td class="nowrap"><strong>${c}</strong></td><td>${w}</td><td class="small muted nowrap">${g}</td></tr>`).join('\n')}
</tbody></table></div>

<h2>Auditor identity</h2>
<p class="small">Every report is signed with this ed25519 key. Verify offline: strip <code>signature</code>,
canonicalize the JSON (RFC 8785), check the signature over the UTF-8 bytes — recipe on any
<a href="/verify/${args.reports.length ? esc(args.reports[0].job_id) : ''}">verify page</a> and in the README.</p>
<div class="keybox">ed25519:${esc(args.pubkey)}</div>

<h2 id="api">API</h2>
<div class="table-wrap"><table>
<thead><tr><th>Endpoint</th><th>Returns</th></tr></thead>
<tbody>${ENDPOINTS.map(([e, d]) => `<tr><td class="mono nowrap">${esc(e)}</td><td>${esc(d)}</td></tr>`).join('\n')}
</tbody></table></div>`;

  return renderPage({
    title: 'Handshake — CAP Integration Auditor',
    description: 'A paid, CAP-callable agent that audits other agents’ CAP integrations and issues signed, independently verifiable attestations.',
    extraCss: CSS,
    content,
  });
}
