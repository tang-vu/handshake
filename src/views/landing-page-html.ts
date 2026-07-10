import type { ReportRow } from '../db/repo.js';
import { esc } from './html-escape.js';

// Server-rendered landing page at "/". First thing a human sees when they open
// the public URL: what Handshake is, the auditor identity they can verify
// signatures against, and deep links into the most recent real audits.

const VERDICT_CLASS: Record<string, string> = { PASS: 'pass', PARTIAL: 'partial', FAIL: 'fail' };

const REPO_URL = 'https://github.com/tang-vu/handshake';

const ENDPOINTS: Array<[string, string]> = [
  ['GET /report/:job_id', 'Signed AuditReport (JSON), ed25519 over RFC 8785 canonical form'],
  ['GET /verify/:job_id', 'Server-side signature + trace-chain re-check, plus the offline recipe'],
  ['GET /trace/:job_id', 'Hash-chained reasoning trace (HTML for browsers, JSON for agents)'],
  ['GET /badge/:agent_id.svg', 'Embeddable verdict badge; .json for the machine-readable form'],
  ['GET /job/:job_id', 'Job status and per-probe settlement detail'],
  ['GET /healthz', 'Liveness and mode'],
];

function reportRow(r: ReportRow, baseUrl: string): string {
  const cls = VERDICT_CLASS[r.verdict] ?? 'partial';
  const shortJob = r.job_id.slice(0, 8);
  return `<tr>
  <td class="mono" title="${esc(r.job_id)}">${esc(shortJob)}…</td>
  <td class="mono" title="${esc(r.subject_agent_id)}">${esc(r.subject_agent_id.slice(0, 8))}…</td>
  <td><span class="verdict ${cls}">${esc(r.verdict)}</span></td>
  <td class="ts">${esc(r.created_at)}</td>
  <td class="links">
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
}): string {
  const audits = args.reports.length
    ? `<p class="note">Every report this instance has ever issued is listed below, unredacted —
including earlier <strong>FAIL</strong> runs against our own demo target while its integration
was still broken. FAIL ships as FAIL; the report's credibility is the product.</p>
<table>
<thead><tr><th>job</th><th>subject agent</th><th>verdict</th><th>issued</th><th></th></tr></thead>
<tbody>
${args.reports.map((r) => reportRow(r, args.baseUrl)).join('\n')}
</tbody>
</table>`
    : `<p class="empty">No audits delivered yet on this instance. Buy the audit service on
       <a href="https://agent.croo.network/">agent.croo.network</a> and the report lands here.</p>`;

  const storeLink = args.agentId
    ? `<a href="https://agent.croo.network/agents/${esc(args.agentId)}">Agent Store listing</a> · `
    : '';

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<title>Handshake — CAP Integration Auditor</title>
<meta name="description" content="A paid, CAP-callable agent that audits other agents' CAP integrations and issues signed, independently verifiable attestations.">
<style>
  :root{color-scheme:light}
  body{font-family:ui-sans-serif,system-ui,sans-serif;margin:0;color:#1a1a1a;background:#fafafa;line-height:1.55}
  main{max-width:60rem;margin:0 auto;padding:2.5rem 1rem 4rem}
  header{display:flex;align-items:center;gap:1rem;margin-bottom:.5rem}
  header img{width:56px;height:56px;border-radius:13px}
  h1{font-size:1.6rem;margin:0}
  h2{font-size:1.05rem;margin:2.5rem 0 .75rem;border-bottom:1px solid #e2e2e2;padding-bottom:.35rem}
  .tagline{color:#555;margin:.15rem 0 0;font-size:.95rem}
  .lede{font-size:1.02rem;margin:1.5rem 0}
  code{background:#eee;padding:.1rem .3rem;border-radius:3px;font-size:.85em}
  a{color:#1a5fb4}
  .meta{display:flex;flex-wrap:wrap;gap:.5rem;margin:1.25rem 0}
  .chip{background:#fff;border:1px solid #ddd;border-radius:999px;padding:.25rem .8rem;font-size:.8rem}
  .chip b{font-weight:600}
  table{border-collapse:collapse;width:100%;font-size:.85rem;background:#fff}
  th,td{border:1px solid #ddd;padding:.45rem .6rem;text-align:left}
  th{background:#f0f0f0;font-weight:600}
  .mono,.ts{font-family:ui-monospace,monospace;font-size:.78rem;white-space:nowrap}
  .links a{margin-right:.6rem;white-space:nowrap}
  .verdict{font-weight:600;font-size:.75rem;padding:.1rem .5rem;border-radius:4px}
  .pass{background:#e6f4ea;color:#137333} .partial{background:#fef7e0;color:#b06000}
  .fail{background:#fce8e6;color:#c5221f}
  .empty{background:#fff;border:1px dashed #ccc;border-radius:6px;padding:1rem;color:#555}
  .note{font-size:.88rem;color:#555;margin:.25rem 0 .9rem}
  .hire{background:#eef2ff;border:1px solid #c7d2fe;border-radius:6px;padding:.6rem .9rem;font-size:.95rem}
  .key{word-break:break-all;font-family:ui-monospace,monospace;font-size:.78rem;background:#fff;
       border:1px solid #ddd;border-radius:6px;padding:.6rem .8rem}
  footer{margin-top:3rem;padding-top:1rem;border-top:1px solid #e2e2e2;color:#666;font-size:.85rem}
  @media(prefers-color-scheme:dark){
    :root{color-scheme:dark}
    body{background:#14161a;color:#e6e6e6}
    h2{border-color:#2c3038} .tagline,.empty,footer{color:#9aa0aa}
    code{background:#23262c} a{color:#7aa7ff}
    table,.chip,.key,.empty{background:#1b1e24;border-color:#2c3038}
    .note{color:#9aa0aa} .hire{background:#1c2340;border-color:#31408a}
    th{background:#23262c} th,td{border-color:#2c3038}
    .pass{background:#0e2f1c;color:#7ee2a8} .partial{background:#33280a;color:#f0c674}
    .fail{background:#3a1614;color:#f2a8a2}
  }
</style></head><body><main>

<header>
  <img src="/logo.svg" alt="">
  <div>
    <h1>Handshake</h1>
    <p class="tagline">CAP Integration Auditor · CROO Agent Protocol · Base mainnet</p>
  </div>
</header>

<p class="lede">A paid, CAP-callable agent that audits other agents' CAP integrations and issues
<strong>signed, independently verifiable attestations</strong>. Pay it ~1 USDC through CAP and it calls
your agent several times as a real paying customer, verifies USDC settlement on Base with its own RPC
checks, and delivers an AuditReport with a hash-chained reasoning trace and an embeddable badge.</p>

<p>Verdicts (<code>PASS</code> / <code>PARTIAL</code> / <code>FAIL</code>) are computed by deterministic
code — no LLM judgment, and no mechanism exists to pay for a better verdict. A FAIL ships as FAIL with
concrete remediation steps.</p>
${args.agentId ? `<p class="hire">▸ Hire it now on the
<a href="https://agent.croo.network/agents/${esc(args.agentId)}">CROO Agent Store</a> —
send <code>{"target_service_id": "&lt;service to audit&gt;"}</code> as requirements, pay 1 USDC,
keep your agent online.</p>` : ''}

<div class="meta">
  <span class="chip"><b>mode</b> ${esc(args.mode)}</span>
  <span class="chip"><b>chain</b> Base mainnet (8453)</span>
  <span class="chip"><b>checks</b> callable · schema · settlement · latency · reliability</span>
</div>

<h2>Recent audits</h2>
${audits}

<h2>Auditor identity</h2>
<p>Every report is signed with this ed25519 key. Verify offline: strip <code>signature</code>, canonicalize
the JSON (RFC 8785), check the signature over the UTF-8 bytes.</p>
<div class="key">ed25519:${esc(args.pubkey)}</div>

<h2>API</h2>
<table>
<thead><tr><th>endpoint</th><th>returns</th></tr></thead>
<tbody>
${ENDPOINTS.map(([e, d]) => `<tr><td class="mono">${esc(e)}</td><td>${esc(d)}</td></tr>`).join('\n')}
</tbody>
</table>

<footer>
  ${storeLink}<a href="${REPO_URL}">Source on GitHub</a> · <a href="/healthz">/healthz</a>
</footer>

</main></body></html>`;
}
