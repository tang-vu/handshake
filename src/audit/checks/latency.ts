import type { ProbeRow } from '../../db/repo.js';
import { config } from '../../config.js';

export interface LatencyCheck {
  pass: boolean;
  p50: number;
  p95: number;
  threshold_p95: number;
  samples: number;
  basis: string;
}

// Nearest-rank percentile over integer millisecond samples.
function percentile(sorted: number[], p: number): number {
  const idx = Math.max(0, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[idx];
}

// C4 — how fast does the target deliver once paid? Measures paid_at →
// completed_at per completed probe: the window the target controls (work +
// deliverOrder tx), excluding our negotiation and payment overhead.
export function checkLatency(probes: ProbeRow[]): LatencyCheck {
  const samples = probes
    .filter((p) => p.status === 'completed' && p.paid_at && p.completed_at)
    .map((p) => Date.parse(p.completed_at!) - Date.parse(p.paid_at!))
    .filter((ms) => Number.isFinite(ms) && ms >= 0)
    .sort((a, b) => a - b);

  if (samples.length === 0) {
    return {
      pass: false, p50: 0, p95: 0, threshold_p95: config.latencyP95ThresholdMs,
      samples: 0, basis: 'paid_at -> completed_at per completed probe; no samples available',
    };
  }

  const p95 = percentile(samples, 95);
  return {
    pass: p95 <= config.latencyP95ThresholdMs,
    p50: percentile(samples, 50),
    p95,
    threshold_p95: config.latencyP95ThresholdMs,
    samples: samples.length,
    basis: 'paid_at -> completed_at per completed probe (target work + delivery tx)',
  };
}
