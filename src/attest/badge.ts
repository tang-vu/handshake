import type { ReportRow } from '../db/repo.js';
import { config } from '../config.js';

// shields.io-style status badge for an audited agent, rendered from the most
// recent signed report. Grey "unaudited" badge when no report exists.

const COLORS: Record<string, string> = {
  PASS: '#4c1',
  PARTIAL: '#dfb317',
  FAIL: '#e05d44',
  UNAUDITED: '#9f9f9f',
};

export interface BadgeData {
  agent_id: string;
  verdict: string;
  audited_at: string | null;
  report_url: string | null;
  verify_url: string | null;
}

export function badgeData(agentId: string, report: ReportRow | undefined): BadgeData {
  if (!report) {
    return { agent_id: agentId, verdict: 'UNAUDITED', audited_at: null, report_url: null, verify_url: null };
  }
  return {
    agent_id: agentId,
    verdict: report.verdict,
    audited_at: report.created_at,
    report_url: `${config.publicBaseUrl}/report/${report.job_id}`,
    verify_url: `${config.publicBaseUrl}/verify/${report.job_id}`,
  };
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function badgeSvg(data: BadgeData): string {
  const label = 'CAP audit';
  const date = data.audited_at ? ` (${data.audited_at.slice(0, 10)})` : '';
  const status = `${data.verdict}${date}`;
  const color = COLORS[data.verdict] ?? COLORS.UNAUDITED;

  // Approximate text width at 11px Verdana: ~6.5px per char + padding.
  const labelW = Math.round(label.length * 6.5) + 12;
  const statusW = Math.round(status.length * 6.5) + 12;
  const total = labelW + statusW;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${total}" height="20" role="img" aria-label="${esc(label)}: ${esc(status)}">
  <title>${esc(label)}: ${esc(status)}</title>
  <linearGradient id="s" x2="0" y2="100%"><stop offset="0" stop-color="#bbb" stop-opacity=".1"/><stop offset="1" stop-opacity=".1"/></linearGradient>
  <clipPath id="r"><rect width="${total}" height="20" rx="3" fill="#fff"/></clipPath>
  <g clip-path="url(#r)">
    <rect width="${labelW}" height="20" fill="#555"/>
    <rect x="${labelW}" width="${statusW}" height="20" fill="${color}"/>
    <rect width="${total}" height="20" fill="url(#s)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11">
    <text x="${labelW / 2}" y="14">${esc(label)}</text>
    <text x="${labelW + statusW / 2}" y="14">${esc(status)}</text>
  </g>
</svg>`;

  // Clicking the badge opens the full report when one exists.
  return data.report_url
    ? svg.replace('<title>', `<a xlink:href="${esc(data.report_url)}" target="_blank"><title>`).replace('</svg>', '</a></svg>')
    : svg;
}
