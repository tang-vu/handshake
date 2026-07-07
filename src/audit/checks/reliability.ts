import type { ProbeRow } from '../../db/repo.js';

export interface ReliabilityCheck {
  pass: boolean;
  calls: number;
  errors: number;
  failures: { seq: number; status: string; error: string }[];
}

// C5 — error rate over the probe series. A probe counts as an error unless it
// reached `completed` (delivered and settled). Pass requires zero errors: a
// paying customer's call should not fail.
export function checkReliability(probes: ProbeRow[]): ReliabilityCheck {
  const failures = probes
    .filter((p) => p.status !== 'completed')
    .map((p) => ({ seq: p.seq, status: p.status, error: p.error ?? '' }));
  return {
    // Zero calls can never pass — a pass must be earned by completed probes.
    pass: probes.length > 0 && failures.length === 0,
    calls: probes.length,
    errors: failures.length,
    failures,
  };
}
