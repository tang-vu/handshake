import type { ProbeRow } from '../../db/repo.js';

export interface CallableCheck {
  pass: boolean;
  detail: string;
}

// C1 — is the target callable via CAP at all? A target is "callable" when at
// least one probe negotiation was accepted and produced an on-chain order.
export function checkCallable(probes: ProbeRow[]): CallableCheck {
  const responded = probes.filter((p) => p.order_created_at !== null).length;
  if (responded > 0) {
    return { pass: true, detail: `target accepted ${responded}/${probes.length} probe negotiations` };
  }
  return {
    pass: false,
    detail: 'target never accepted a probe negotiation (offline, draft status, or not auto-accepting)',
  };
}
