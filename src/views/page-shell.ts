import { esc } from './html-escape.js';
import { DESIGN_SYSTEM_CSS } from './design-system-css.js';

// Shared shell for every server-rendered page: fonts, sticky header with the
// live-status pill, footer, and the verdict chips used across all views.

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

export function renderPage(args: {
  title: string;
  description?: string;
  // Breadcrumb line under the header, e.g. 'report · f4cb65bd…' (already escaped by caller).
  crumb?: string;
  // Page-specific CSS appended after the design-system styles.
  extraCss?: string;
  // Body content inside <main> (caller escapes its own interpolations).
  content: string;
}): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#0b0d12">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<title>${esc(args.title)}</title>
${args.description ? `<meta name="description" content="${esc(args.description)}">` : ''}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Space+Grotesk:wght@500;600;700&display=swap" rel="stylesheet">
<style>${DESIGN_SYSTEM_CSS}${args.extraCss ?? ''}</style></head><body>
<div class="site-head"><div class="inner">
  <a class="word" href="/"><img src="/logo.svg" alt="">Handshake</a>
  <span class="live-dot">live on Base</span>
  <nav>
    <a href="/#audits">Audits</a>
    <a href="/#method">Method</a>
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
  <a href="https://agent.croo.network/">CROO Agent Store</a>
  <a href="/healthz">healthz</a>
</footer>
</main></body></html>`;
}
