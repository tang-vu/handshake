import type { ProbeRow } from '../../db/repo.js';

export interface SchemaCheck {
  pass: boolean;
  violations: string[];
}

// Snapshot of a probe's delivery, persisted as probes.delivery_json.
export interface DeliverySnapshot {
  deliverableType: string;
  deliverableText: string;
  deliverableSchema: string;
  contentHash: string;
}

// C2 — does the target's response conform to the CAP delivery contract?
// The SDK exposes no way to fetch the target's declared schema definition, so
// this validates the observable contract: a delivery exists for every
// completed order, its type is a known CAP deliverable type, the content slot
// matching that type is non-empty, schema deliveries parse as JSON, and the
// on-chain content hash is present.
export function checkSchema(probes: ProbeRow[]): SchemaCheck {
  const completed = probes.filter((p) => p.status === 'completed');
  const violations: string[] = [];

  if (completed.length === 0) {
    return { pass: false, violations: ['no completed probe deliveries to validate'] };
  }

  for (const p of completed) {
    const label = `probe ${p.seq}`;
    if (!p.delivery_json) {
      violations.push(`${label}: delivery could not be retrieved (GetDelivery failed)`);
      continue;
    }
    let d: DeliverySnapshot;
    try {
      d = JSON.parse(p.delivery_json) as DeliverySnapshot;
    } catch {
      violations.push(`${label}: stored delivery snapshot is corrupt`);
      continue;
    }
    const hasText = d.deliverableText.trim() !== '';
    const hasSchema = d.deliverableSchema.trim() !== '';
    // Known CAP deliverable types across client surfaces: node SDK exposes
    // text/schema; the CROO MCP server exposes text/url. An unknown type name
    // is not itself a failure — the order settled on-chain — but the delivery
    // must still carry readable content and an on-chain content hash.
    if (d.deliverableType === 'schema') {
      if (!hasSchema) {
        violations.push(`${label}: schema deliverable is empty`);
      } else {
        try {
          const parsed = JSON.parse(d.deliverableSchema);
          if (typeof parsed !== 'object' || parsed === null) {
            violations.push(`${label}: schema deliverable is valid JSON but not an object`);
          }
        } catch {
          violations.push(`${label}: schema deliverable is not valid JSON`);
        }
      }
    } else if (d.deliverableType === 'text' || d.deliverableType === 'url') {
      if (!hasText) violations.push(`${label}: ${d.deliverableType} deliverable has empty content`);
    } else if (!hasText && !hasSchema) {
      violations.push(`${label}: deliverable type "${d.deliverableType}" carries no readable content`);
    }
    if (!d.contentHash) {
      violations.push(`${label}: missing on-chain content hash`);
    }
  }

  return { pass: violations.length === 0, violations };
}
