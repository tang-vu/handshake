import { esc } from './html-escape.js';
import { renderPage } from './page-shell.js';

// Browser rendering of /verify/:job_id — the server-side re-check of one
// report's ed25519 signature and trace hash chain, plus the recipe to
// reproduce the same verification offline with zero trust in this server.

const CSS = `
  .checks{display:grid;grid-template-columns:repeat(auto-fit,minmax(16rem,1fr));gap:.8rem;margin-top:1rem}
  .bigcheck{border-radius:12px;padding:1.1rem 1.25rem;border:1px solid var(--line);background:var(--card)}
  .bigcheck .state{font-size:1.35rem;font-weight:700;letter-spacing:-.01em;display:flex;align-items:center;gap:.55rem}
  .bigcheck.ok .state{color:var(--good)} .bigcheck.bad .state{color:var(--crit)}
  .bigcheck .what{font-size:.85rem;color:var(--ink2);margin-top:.3rem}
  .recipe{counter-reset:step;list-style:none;padding:0;margin:.8rem 0 0}
  .recipe li{position:relative;padding:.45rem 0 .45rem 2.4rem;font-size:.9rem}
  .recipe li::before{counter-increment:step;content:counter(step);position:absolute;left:0;top:.45rem;
    width:1.55rem;height:1.55rem;border-radius:99px;background:var(--grad);color:#fff;
    font-weight:650;font-size:.8rem;display:flex;align-items:center;justify-content:center}
  .actions{display:flex;gap:.5rem;flex-wrap:wrap;margin-top:1.2rem}
`;

export function renderVerifyHtml(args: {
  jobId: string;
  verdict: string;
  signatureValid: boolean;
  chainValid: boolean;
  traceRoot: string;
  pubkey: string;
  steps: string[];
  baseUrl: string;
}): string {
  const box = (ok: boolean, label: string, what: string) => `
<div class="bigcheck ${ok ? 'ok' : 'bad'}">
  <div class="state">${ok ? '✓' : '✕'} ${esc(label)} ${ok ? 'VALID' : 'INVALID'}</div>
  <div class="what">${esc(what)}</div>
</div>`;

  const content = `
<h1>Attestation verification</h1>
<p class="small muted">Job <span class="mono">${esc(args.jobId)}</span> · verdict <strong>${esc(args.verdict)}</strong>
· re-checked server-side on every request — nothing cached.</p>

<div class="checks">
${box(args.signatureValid, 'Signature',
    'ed25519 over the RFC 8785 canonical form of the report, minus the signature field.')}
${box(args.chainValid, 'Trace chain',
    'Every reasoning step commits to its predecessor via sha256; the signed report embeds the chain root.')}
</div>

<h2>Don’t trust this page — reproduce it offline</h2>
<ol class="recipe">
${args.steps.map((s) => `<li>${esc(s.replace(/^\d+\.\s*/, ''))}</li>`).join('\n')}
</ol>
<pre class="code">npx tsx scripts/verify-report-offline.ts ${esc(args.baseUrl)}/report/${esc(args.jobId)}</pre>

<h2>Identity</h2>
<div class="keybox">auditor pubkey &nbsp;${esc(args.pubkey)}</div>
<div class="keybox" style="margin-top:.6rem">trace root &nbsp;${esc(args.traceRoot)}</div>

<div class="actions">
  <a class="btn primary" href="${esc(args.baseUrl)}/report/${esc(args.jobId)}">View report</a>
  <a class="btn ghost" href="${esc(args.baseUrl)}/trace/${esc(args.jobId)}">Reasoning trace</a>
  <a class="btn ghost" href="${esc(args.baseUrl)}/verify/${esc(args.jobId)}?format=json">Raw JSON</a>
</div>`;

  return renderPage({
    title: `Verify ${args.jobId.slice(0, 8)} — Handshake`,
    crumb: `verify · <span class="mono">${esc(args.jobId.slice(0, 8))}…</span>`,
    extraCss: CSS,
    content,
  });
}
