import { esc } from './html-escape.js';

// Shared shell for every server-rendered page: design tokens, header/footer,
// and the verdict chip used across landing, report, verify and trace views.
// Pages stay dependency-free — all CSS inline, no external requests.

export function verdictChip(verdict: string): string {
  const v = verdict.toUpperCase();
  const cls = v === 'PASS' ? 'pass' : v === 'FAIL' ? 'fail' : 'partial';
  const icon = v === 'PASS' ? '✓' : v === 'FAIL' ? '✕' : '△';
  return `<span class="verdict ${cls}">${icon} ${esc(v)}</span>`;
}

export function passChip(pass: boolean): string {
  return pass
    ? '<span class="verdict pass">✓ pass</span>'
    : '<span class="verdict fail">✕ fail</span>';
}

const SHELL_CSS = `
  :root{color-scheme:light;
    --bg:#fafafa;--card:#ffffff;--line:#e4e4e7;
    --ink:#18181b;--ink2:#52525b;--ink3:#8b8b94;
    --brand:#4f46e5;--link:#3b46c4;
    --good:#0ca30c;--warn:#b06000;--crit:#d03b3b;
    --good-bg:#e7f6e7;--warn-bg:#fdf3d7;--crit-bg:#fbe7e7;
    --code-bg:#f1f1f3;--grad:linear-gradient(135deg,#6366f1,#4f46e5 55%,#06b6d4)}
  @media(prefers-color-scheme:dark){:root{color-scheme:dark;
    --bg:#121419;--card:#1b1e24;--line:#2c3038;
    --ink:#e8e8ea;--ink2:#a7adb8;--ink3:#767d89;
    --link:#8ba0ff;
    --good:#5fd35f;--warn:#f0c674;--crit:#f2837b;
    --good-bg:#12310f;--warn-bg:#332a0c;--crit-bg:#3a1614;
    --code-bg:#23262c}}
  *{box-sizing:border-box}
  body{font-family:ui-sans-serif,system-ui,'Segoe UI',sans-serif;margin:0;
    background:var(--bg);color:var(--ink);line-height:1.55;font-size:16px}
  main{max-width:62rem;margin:0 auto;padding:2rem 1.25rem 4rem}
  a{color:var(--link)}
  h1{font-size:1.55rem;margin:0;letter-spacing:-.015em}
  h2{font-size:1.12rem;margin:2.6rem 0 .8rem;letter-spacing:-.01em}
  code{background:var(--code-bg);padding:.1rem .35rem;border-radius:4px;font-size:.85em}
  pre.code{background:var(--code-bg);border:1px solid var(--line);border-radius:8px;
    padding:.9rem 1rem;overflow-x:auto;font-size:.8rem;line-height:1.5;margin:.6rem 0}
  .site-head{border-bottom:1px solid var(--line);background:var(--card)}
  .site-head .inner{max-width:62rem;margin:0 auto;padding:.7rem 1.25rem;
    display:flex;align-items:center;gap:.7rem;flex-wrap:wrap}
  .site-head img{width:30px;height:30px;border-radius:7px;display:block}
  .site-head .word{font-weight:650;font-size:1.02rem;color:var(--ink);text-decoration:none;
    display:flex;align-items:center;gap:.6rem}
  .site-head nav{margin-left:auto;display:flex;gap:1.1rem;font-size:.88rem}
  .site-head nav a{color:var(--ink2);text-decoration:none}
  .site-head nav a:hover{color:var(--ink)}
  .crumb{font-size:.82rem;color:var(--ink3);margin:0 0 1rem}
  .crumb a{color:var(--ink3)}
  .card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:1rem 1.15rem}
  .table-wrap{overflow-x:auto;border:1px solid var(--line);border-radius:10px;background:var(--card)}
  table{border-collapse:collapse;width:100%;font-size:.86rem}
  th,td{padding:.5rem .75rem;text-align:left;border-top:1px solid var(--line);vertical-align:top}
  thead th{border-top:none;background:var(--code-bg);font-weight:600;font-size:.78rem;
    text-transform:uppercase;letter-spacing:.04em;color:var(--ink2)}
  .mono{font-family:ui-monospace,'Cascadia Mono',monospace;font-size:.78rem}
  .nowrap{white-space:nowrap}
  .verdict{font-weight:650;font-size:.74rem;padding:.14rem .55rem;border-radius:99px;white-space:nowrap}
  .verdict.pass{background:var(--good-bg);color:var(--good)}
  .verdict.partial{background:var(--warn-bg);color:var(--warn)}
  .verdict.fail{background:var(--crit-bg);color:var(--crit)}
  .btn{display:inline-block;padding:.5rem 1.05rem;border-radius:8px;font-size:.9rem;
    font-weight:600;text-decoration:none;border:1px solid transparent}
  .btn.primary{background:var(--grad);color:#fff}
  .btn.ghost{border-color:var(--line);color:var(--ink);background:var(--card)}
  .muted{color:var(--ink2)} .small{font-size:.85rem}
  .keybox{word-break:break-all;font-family:ui-monospace,monospace;font-size:.78rem;
    background:var(--card);border:1px solid var(--line);border-radius:8px;padding:.65rem .85rem}
  footer{margin-top:3.5rem;padding-top:1.1rem;border-top:1px solid var(--line);
    color:var(--ink3);font-size:.84rem;display:flex;gap:1rem;flex-wrap:wrap}
  footer a{color:var(--ink2)}
`;

export function renderPage(args: {
  title: string;
  description?: string;
  // Breadcrumb line under the header, e.g. 'report · f4cb65bd…' (already escaped by caller).
  crumb?: string;
  // Page-specific CSS appended after the shell styles.
  extraCss?: string;
  // Body content inside <main> (caller escapes its own interpolations).
  content: string;
}): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<title>${esc(args.title)}</title>
${args.description ? `<meta name="description" content="${esc(args.description)}">` : ''}
<style>${SHELL_CSS}${args.extraCss ?? ''}</style></head><body>
<div class="site-head"><div class="inner">
  <a class="word" href="/"><img src="/logo.svg" alt="">Handshake</a>
  <nav>
    <a href="/#audits">Audits</a>
    <a href="/#api">API</a>
    <a href="https://github.com/tang-vu/handshake">GitHub</a>
  </nav>
</div></div>
<main>
${args.crumb ? `<p class="crumb"><a href="/">home</a> / ${args.crumb}</p>` : ''}
${args.content}
<footer>
  <span>Handshake — CAP Integration Auditor</span>
  <a href="https://github.com/tang-vu/handshake">Source (MIT)</a>
  <a href="/healthz">healthz</a>
</footer>
</main></body></html>`;
}
